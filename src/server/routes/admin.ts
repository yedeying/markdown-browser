/**
 * 挂载点与启动设置 API（/api/admin/*）
 *
 * 鉴权：
 *   - multi 模式：父 app 已有全局访问密码中间件（/api/admin/status 在白名单里）
 *   - dir 模式：父 app 只有这一组路由，中间件在本文件里注册
 *   - 无访问密码时：所有端点公开，方便本地使用
 *
 * 启动设置（startupMode / singleMountAlias）两种模式都要能读写：
 * 单目录模式恰恰是最需要"切回多挂载"的那一端。
 */
import { Hono } from 'hono'
import type { Context, MiddlewareHandler } from 'hono'
import { existsSync, realpathSync, statSync } from 'fs'
import { basename, join, resolve } from 'path'
import type { AdminSettings, AuthConfig, MountConfig, StartupMode } from '../../types.js'
import { MountManager } from '../mount-manager.js'
import { createAuthMiddleware } from '../auth.js'
import { readStartupConfig, readStartupConfigState } from '../startup-mode.js'
import { CONFIG_FILENAME } from '../reserved-files.js'
import { validateMountDirectory } from '../mount-config.js'

const CONFIG_UNREADABLE = '配置文件无法解析，为避免覆盖内容已拒绝保存，请先修复它'

/** Bun.serve 把 server 作为 Hono 的 env 传进来，对端地址只能从这里拿 */
interface PeerEnv {
  requestIP?: (req: Request) => { address: string } | null
}

function isLoopbackAddress(address: string): boolean {
  return address === '::1'
    || address === '::ffff:127.0.0.1'
    || address.startsWith('127.')
}

/**
 * 仅允许本机访问。拿不到对端地址时放行：单测直接调用 app.request() 时没有
 * Bun server，此处无从判断；生产路径上 Bun 总会提供 requestIP。
 */
const localOnly: MiddlewareHandler = async (c, next) => {
  const address = (c.env as PeerEnv | undefined)?.requestIP?.(c.req.raw)?.address
  if (address && !isLoopbackAddress(address)) {
    return c.json(
      { ok: false, error: '启动设置仅限本机访问；如需远程管理请用 -P 设置访问密码' },
      403,
    )
  }
  await next()
}

/**
 * 路由需要知道的运行形态。
 * dir 模式没有常驻 MountManager：配置文件所在目录（configDir）与被服务的根目录
 * （basePath）可能不同，而且构造 MountManager 会落盘，所以只在写请求里按需创建。
 */
export type AdminTarget =
  | { mode: 'multi'; mountManager: MountManager }
  | { mode: 'dir'; configDir: string; basePath: string }

interface MountModeBody {
  startupMode?: unknown
  singleMountAlias?: unknown
}

export function createAdminRoutes(
  app: Hono,
  target: AdminTarget,
  authConfig: AuthConfig | null,
) {
  // dir 模式的父 app 没有全局鉴权中间件，这里必须自己守住：
  // 启动设置能改写下一次启动的根目录，不能对未登录客户端开放。
  if (target.mode === 'dir' && authConfig) {
    app.use('/api/admin/*', createAuthMiddleware(authConfig))
  }

  // 没有访问密码时，用"仅本机"兜底。这一组接口能改写下一次启动的根目录，
  // 而默认绑定是 0.0.0.0，同一个 app 还服务匿名分享页 —— 不设门槛就等于
  // 把它交给整个局域网。范围刻意收窄，避免改变已有行为：
  //   - dir 模式整组都是本次新增的暴露面，可以整体收紧
  //   - multi 模式只收紧新增的 mount-mode 写入，沿用已久的挂载点 CRUD 不动
  if (!authConfig) {
    if (target.mode === 'dir') app.use('/api/admin/*', localOnly)
    else app.use('/api/admin/mount-mode', localOnly)
  }

  app.get('/api/admin/status', (c) => {
    const s = readSettings(target)
    return c.json({
      enabled: true,
      requiresLogin: !!authConfig,
      mode: s.mode,
      workspace: s.mode === 'multi' ? s.root : undefined,
      configPath: s.configPath,
    })
  })

  // 当前启动设置。纯读：dir 模式下不构造 MountManager，
  // 否则"打开设置面板"就会在用户目录里创建一个 .vmd-config.json。
  app.get('/api/admin/settings', (c) => {
    return c.json(readSettings(target))
  })

  // 保存启动挂载模式。当前进程不热切换根目录，永远需要重启。
  app.post('/api/admin/mount-mode', async (c) => {
    let raw: MountModeBody
    try {
      raw = await c.req.json() as MountModeBody
    } catch {
      return c.json({ ok: false, error: '请求体必须是 JSON 对象' }, 400)
    }
    if (!raw || typeof raw !== 'object') {
      return c.json({ ok: false, error: '请求体必须是 JSON 对象' }, 400)
    }

    const startupMode = raw.startupMode
    if (startupMode !== 'dir' && startupMode !== 'multi') {
      return c.json({ ok: false, error: 'startupMode 只能是 dir 或 multi' }, 400)
    }

    let alias: string | undefined
    if (raw.singleMountAlias !== undefined && raw.singleMountAlias !== null) {
      if (typeof raw.singleMountAlias !== 'string' || !raw.singleMountAlias) {
        return c.json({ ok: false, error: 'singleMountAlias 必须是非空字符串' }, 400)
      }
      alias = raw.singleMountAlias
    }
    // 单目录启动必须明确指向一个挂载点，不能沿用一个可能已经失效的旧值
    if (startupMode === 'dir' && !alias) {
      return c.json({ ok: false, error: '切换到单目录模式必须选择一个已登记的挂载点' }, 400)
    }

    try {
      return applyMountMode(c, target, startupMode, alias)
    } catch {
      // 细节（路径、堆栈）只留在服务端日志语义里，不回传给客户端
      return c.json({ ok: false, error: '保存启动设置失败' }, 500)
    }
  })

  if (target.mode === 'multi') {
    createMountCrudRoutes(app, target.mountManager)
  } else {
    createDirModeMountRoutes(app, target)
  }
}

// ============================================================
// 启动设置
// ============================================================

function readSettings(target: AdminTarget): AdminSettings {
  if (target.mode === 'multi') {
    const mm = target.mountManager
    const startup = mm.getStartupSettings()
    return buildSettings({
      mode: 'multi',
      persistedMode: startup.startupMode,
      singleMountAlias: startup.singleMountAlias,
      mounts: mm.list(),
      invalidMountEntries: mm.getIgnoredMountCount(),
      root: mm.getWorkspace(),
      configPath: mm.getConfigPath(),
    })
  }

  // 缺失或损坏的配置返回 null；读操作不修复、不创建文件。
  // mounts 已经按写路径的同一套规则过滤过：列出来就意味着可选，
  // 可选就必须能保存。
  const persisted = readStartupConfig(target.configDir)
  return buildSettings({
    mode: 'dir',
    persistedMode: persisted?.startupMode,
    singleMountAlias: persisted?.singleMountAlias,
    mounts: (persisted?.mounts ?? []).map(m => normalizeMount(m, target.configDir)),
    invalidMountEntries: persisted?.ignoredMounts?.length ?? 0,
    root: target.basePath,
    configPath: join(target.configDir, CONFIG_FILENAME),
  })
}

function buildSettings(input: {
  mode: 'dir' | 'multi'
  persistedMode?: StartupMode
  singleMountAlias?: string
  mounts: MountConfig[]
  invalidMountEntries: number
  root: string
  configPath: string
}): AdminSettings {
  const settings: AdminSettings = {
    mode: input.mode,
    // 配置里没写启动模式时，下次启动仍由命令行参数决定，也就是当前这个形态
    startupMode: input.persistedMode ?? input.mode,
    startupModePersisted: !!input.persistedMode,
    mounts: input.mounts,
    root: input.root,
    configPath: input.configPath,
  }
  if (input.singleMountAlias) settings.singleMountAlias = input.singleMountAlias
  if (input.invalidMountEntries > 0) settings.invalidMountEntries = input.invalidMountEntries
  return settings
}

/** 配置里的相对 path 是相对配置目录的；补齐默认字段方便前端直接展示 */
function normalizeMount(m: MountConfig, configDir: string): MountConfig {
  return {
    alias: m.alias,
    name: m.name || m.alias,
    path: resolve(configDir, m.path),
    readonly: !!m.readonly,
  }
}

function applyMountMode(
  c: Context,
  target: AdminTarget,
  startupMode: StartupMode,
  alias: string | undefined,
) {
  let mm: MountManager
  let initialMount: MountConfig | undefined

  if (target.mode === 'multi') {
    mm = target.mountManager
    // 文件在但内容坏了：写回等于用一份"干净"的配置覆盖掉用户的内容
    if (!mm.isConfigReadable()) {
      return c.json({ ok: false, error: CONFIG_UNREADABLE }, 409)
    }
  } else {
    if (!isDirectory(target.configDir)) {
      return c.json({ ok: false, error: `配置目录不存在: ${target.configDir}` }, 400)
    }

    // MountManager 的构造函数在配置缺失时就会写出一份，所以在构造之前
    // 必须把这次保存能失败的理由全部排除掉 —— 否则一次被拒的请求会留下
    // 一个凭空出现的 .vmd-config.json，而它还是个 UI 里看不见、删不掉的保留文件。
    const state = readStartupConfigState(target.configDir)
    if (state.state === 'unreadable') {
      return c.json({ ok: false, error: CONFIG_UNREADABLE }, 409)
    }
    const persisted = state.state === 'ok' ? state.config : null

    if (startupMode === 'dir') {
      // 只认已经过校验的可用条目：GET 列出的正是这一批
      if (!persisted?.mounts.some(m => m.alias === alias)) {
        return c.json({ ok: false, error: `未找到挂载点: ${alias}` }, 400)
      }
    } else {
      const v = validateMountDirectory(target.basePath, target.configDir)
      if (!v.ok) return c.json({ ok: false, error: v.error }, 400)
    }

    mm = new MountManager(target.configDir)
    if (startupMode === 'multi') {
      // 目录模式升级为多挂载：当前根目录必须成为一个挂载点，否则重启后无处可看
      const picked = pickInitialMount(mm, target.basePath)
      if (!picked.ok) return c.json({ ok: false, error: picked.error }, 400)
      initialMount = picked.mount
    }
  }

  const res = mm.setStartupSettings({ startupMode, singleMountAlias: alias, initialMount })
  if (!res.ok) return c.json({ ok: false, error: res.error }, 400)

  const saved = mm.getStartupSettings()
  return c.json({
    ok: true,
    restartRequired: true,
    startupMode: saved.startupMode,
    ...(saved.singleMountAlias ? { singleMountAlias: saved.singleMountAlias } : {}),
    ...(initialMount ? { initialMount } : {}),
  })
}

/**
 * 为当前根目录挑一个挂载点：
 * 已经登记过同一个目录就复用，否则用目录名派生一个未被占用的 alias。
 * 绝不复用一个指向别处的同名挂载点——那会把用户已有的挂载点悄悄改向。
 */
function pickInitialMount(
  mm: MountManager,
  basePath: string,
): { ok: true; mount: MountConfig } | { ok: false; error: string } {
  const v = mm.validatePath(basePath)
  if (!v.ok) return { ok: false, error: v.error ?? `路径不可用: ${basePath}` }
  const abs = v.absPath!

  const existing = mm.list().find(m => samePath(m.path, abs))
  if (existing) return { ok: true, mount: existing }

  const name = basename(abs) || 'root'
  return { ok: true, mount: { alias: uniqueAlias(mm, name), name, path: abs } }
}

function uniqueAlias(mm: MountManager, rawName: string): string {
  const base = rawName.replace(/[^a-zA-Z0-9_-]/g, '') || 'root'
  // 保留字（api/admin/...）算被占用；载入时跳过但仍留在文件里的条目也算，
  // 否则写回后同一个 alias 会出现两次
  const taken = (a: string) => !mm.validateAlias(a) || mm.isAliasTaken(a)
  if (!taken(base)) return base
  for (let i = 2; i <= 100; i++) {
    const candidate = `${base}-${i}`
    if (!taken(candidate)) return candidate
  }
  return `mount-${Date.now()}`
}

function realOrSelf(p: string): string {
  try {
    return realpathSync(p)
  } catch {
    return resolve(p)
  }
}

function samePath(a: string, b: string): boolean {
  return realOrSelf(a) === realOrSelf(b)
}

function isDirectory(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).isDirectory()
  } catch {
    return false
  }
}

// ============================================================
// 挂载点 CRUD
// ============================================================

function createMountCrudRoutes(app: Hono, mountManager: MountManager) {
  // 列出挂载点（详细含 path）
  app.get('/api/admin/mounts', (c) => {
    return c.json({
      mounts: mountManager.list(),
      workspace: mountManager.getWorkspace(),
    })
  })

  // 新增
  app.post('/api/admin/mounts', async (c) => {
    try {
      const body = await c.req.json() as { alias: string; name: string; path: string; readonly?: boolean }
      const res = mountManager.add({
        alias: body.alias,
        name: body.name,
        path: body.path,
        readonly: body.readonly,
      })
      if (!res.ok) return c.json({ ok: false, error: res.error }, 400)
      return c.json({ ok: true })
    } catch (e) {
      return c.json({ ok: false, error: String(e) }, 400)
    }
  })

  // 更新
  app.put('/api/admin/mounts/:alias', async (c) => {
    try {
      const alias = c.req.param('alias')
      const body = await c.req.json() as { name?: string; path?: string; readonly?: boolean }
      const res = mountManager.update(alias, body)
      if (!res.ok) return c.json({ ok: false, error: res.error }, 400)
      return c.json({ ok: true })
    } catch (e) {
      return c.json({ ok: false, error: String(e) }, 400)
    }
  })

  // 删除
  app.delete('/api/admin/mounts/:alias', (c) => {
    const alias = c.req.param('alias')
    const res = mountManager.remove(alias)
    if (!res.ok) return c.json({ ok: false, error: res.error }, 400)
    return c.json({ ok: true })
  })
}

/**
 * 单目录模式：挂载点只读。
 * 这个模式下 /m/<alias> 路由并不存在，新增挂载点不会有任何效果，
 * 但请求仍要拿到 JSON 而不是掉进 SPA fallback 拿到一份 HTML。
 */
function createDirModeMountRoutes(app: Hono, target: Extract<AdminTarget, { mode: 'dir' }>) {
  const UNAVAILABLE = '单目录模式没有挂载点管理，请先切换到多挂载模式并重启服务'

  app.get('/api/admin/mounts', (c) => {
    const s = readSettings(target)
    return c.json({ mounts: s.mounts, workspace: target.configDir, readonly: true })
  })

  const reject = (c: Context) => c.json({ ok: false, error: UNAVAILABLE }, 409)
  app.post('/api/admin/mounts', reject)
  app.put('/api/admin/mounts/:alias', reject)
  app.delete('/api/admin/mounts/:alias', reject)
}
