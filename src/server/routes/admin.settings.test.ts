import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Hono } from 'hono'
import { createAdminRoutes } from './admin.ts'
import { MountManager } from '../mount-manager.ts'
import { createAuthRoutes, generateSigningKey } from '../auth.ts'
import type { AuthConfig, VmdConfig } from '../../types.ts'

// 启动挂载模式的读写入口。两条硬约束：
//  1. 读（GET）绝不能落盘。dir 模式没有常驻 MountManager，而 MountManager 的构造函数
//     会在配置缺失时建文件；如果 GET 顺手构造一个，"打开设置面板"就等于往用户目录里
//     写了一个 .vmd-config.json，并把下次启动的根目录固化下来。
//  2. 写必须落在 configDir。dir 模式的 basePath 可能已经是配置里选中的挂载点目录，
//     和配置文件所在目录不是同一个路径，写错地方会产出一个永远不被读取的配置。
const CONFIG = '.vmd-config.json'

let ws: string
let docs: string
let notes: string

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), 'vmd-admin-'))
  docs = join(ws, 'docs')
  notes = join(ws, 'notes')
  mkdirSync(docs)
  mkdirSync(notes)
})

afterEach(() => {
  rmSync(ws, { recursive: true, force: true })
})

function configPath(dir: string): string {
  return join(dir, CONFIG)
}

function readConfig(dir: string): VmdConfig {
  return JSON.parse(readFileSync(configPath(dir), 'utf-8')) as VmdConfig
}

function writeConfig(dir: string, data: unknown) {
  writeFileSync(configPath(dir), JSON.stringify(data, null, 2), 'utf-8')
}

/** dir 模式：进程里没有 MountManager，路由只拿到 ServerConfig 里的两个路径 */
function dirApp(opts: { configDir: string; basePath?: string; auth?: AuthConfig | null }) {
  const app = new Hono()
  if (opts.auth) createAuthRoutes(app, opts.auth)
  createAdminRoutes(
    app,
    { mode: 'dir', configDir: opts.configDir, basePath: opts.basePath ?? opts.configDir },
    opts.auth ?? null,
  )
  return app
}

/** multi 模式：复用启动时就建好的 MountManager */
function multiApp(mm: MountManager, auth: AuthConfig | null = null) {
  const app = new Hono()
  createAdminRoutes(app, { mode: 'multi', mountManager: mm }, auth)
  return app
}

function postJson(app: Hono, url: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

// ============================================================
// 读取：dir 模式
// ============================================================

test('GET /api/admin/settings answers in dir mode without creating the config file', async () => {
  const app = dirApp({ configDir: docs })

  const res = await app.request('/api/admin/settings')
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({
    mode: 'dir',
    startupMode: 'dir',
    startupModePersisted: false,
    mounts: [],
    root: docs,
    configPath: configPath(docs),
  })

  // 打开设置面板不是"配置一次"：没有配置文件就该保持没有
  expect(existsSync(configPath(docs))).toBe(false)
})

test('GET /api/admin/settings reports the persisted startup mode and leaves the file byte-identical', async () => {
  writeConfig(docs, {
    startupMode: 'dir',
    singleMountAlias: 'notes',
    mounts: [{ alias: 'notes', name: '笔记', path: notes }],
  })
  const before = readFileSync(configPath(docs), 'utf-8')

  const res = await dirApp({ configDir: docs }).request('/api/admin/settings')
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({
    mode: 'dir',
    startupMode: 'dir',
    startupModePersisted: true,
    singleMountAlias: 'notes',
    mounts: [{ alias: 'notes', name: '笔记', path: notes, readonly: false }],
    root: docs,
    configPath: configPath(docs),
  })
  expect(readFileSync(configPath(docs), 'utf-8')).toBe(before)
})

test('GET /api/admin/settings resolves relative mount paths against the config directory', async () => {
  writeConfig(docs, { startupMode: 'multi', mounts: [{ alias: 'sub', name: '子目录', path: 'inner' }] })
  mkdirSync(join(docs, 'inner'))

  const res = await dirApp({ configDir: docs }).request('/api/admin/settings')
  const data = await res.json() as { startupMode: string; mounts: Array<{ path: string }> }
  expect(data.startupMode).toBe('multi')
  expect(data.mounts[0].path).toBe(join(docs, 'inner'))
})

test('GET /api/admin/settings survives a corrupt config file', async () => {
  writeFileSync(configPath(docs), '{ not json', 'utf-8')

  const res = await dirApp({ configDir: docs }).request('/api/admin/settings')
  expect(res.status).toBe(200)
  const data = await res.json() as { startupMode: string; mounts: unknown[] }
  expect(data.startupMode).toBe('dir')
  expect(data.mounts).toEqual([])
  // 损坏的文件不能被读操作"顺手修好"（那等于丢掉用户手写的内容）
  expect(readFileSync(configPath(docs), 'utf-8')).toBe('{ not json')
})

// ============================================================
// 写入：dir → multi
// ============================================================

test('POST /api/admin/mount-mode promotes dir to multi and registers the served root', async () => {
  const app = dirApp({ configDir: docs })

  const res = await postJson(app, '/api/admin/mount-mode', { startupMode: 'multi' })
  expect(res.status).toBe(200)
  expect(await res.json()).toMatchObject({
    ok: true,
    restartRequired: true,
    startupMode: 'multi',
    initialMount: { alias: 'docs', name: 'docs', path: docs },
  })

  expect(readConfig(docs)).toMatchObject({
    startupMode: 'multi',
    mounts: [{ alias: 'docs', name: 'docs', path: docs }],
  })
})

test('dir-to-multi reuses the mount that already points at the served root', async () => {
  writeConfig(docs, { mounts: [{ alias: 'existing', name: '已登记', path: docs }] })

  const res = await postJson(dirApp({ configDir: docs }), '/api/admin/mount-mode', { startupMode: 'multi' })
  expect(res.status).toBe(200)
  expect(await res.json()).toMatchObject({ ok: true, initialMount: { alias: 'existing', path: docs } })

  const saved = readConfig(docs)
  expect(saved.startupMode).toBe('multi')
  // 同一个目录不能出现两个挂载点
  expect(saved.mounts).toEqual([{ alias: 'existing', name: '已登记', path: docs, readonly: false }])
})

test('dir-to-multi picks a free alias instead of hijacking an existing one', async () => {
  writeConfig(docs, { mounts: [{ alias: 'docs', name: '别的目录', path: notes }] })

  const res = await postJson(dirApp({ configDir: docs }), '/api/admin/mount-mode', { startupMode: 'multi' })
  expect(res.status).toBe(200)
  const body = await res.json() as { initialMount: { alias: string; path: string } }
  expect(body.initialMount.alias).not.toBe('docs')
  expect(body.initialMount.path).toBe(docs)

  const saved = readConfig(docs)
  expect(saved.mounts).toHaveLength(2)
  // 同名挂载点原本指向别处，不能被悄悄改成当前根目录
  expect(saved.mounts.find(m => m.alias === 'docs')?.path).toBe(notes)
  expect(saved.mounts.find(m => m.alias === body.initialMount.alias)?.path).toBe(docs)
})

test('dir-to-multi writes the config at configDir, not at the served root', async () => {
  // 降级启动的形态：根目录是配置里选中的挂载点，配置文件留在工作区
  writeConfig(ws, {
    startupMode: 'dir',
    singleMountAlias: 'notes',
    mounts: [{ alias: 'notes', name: '笔记', path: notes }],
  })
  const app = dirApp({ configDir: ws, basePath: notes })

  const settings = await (await app.request('/api/admin/settings')).json() as { root: string; configPath: string }
  expect(settings.root).toBe(notes)
  expect(settings.configPath).toBe(configPath(ws))

  const res = await postJson(app, '/api/admin/mount-mode', { startupMode: 'multi' })
  expect(res.status).toBe(200)

  expect(readConfig(ws)).toMatchObject({
    startupMode: 'multi',
    // 当前根目录已经是登记过的挂载点，不该重复登记
    mounts: [{ alias: 'notes', path: notes }],
  })
  // 被服务的目录里不该冒出第二份配置
  expect(existsSync(configPath(notes))).toBe(false)
})

test('dir-to-multi rejects a served root that no longer exists', async () => {
  const gone = join(ws, 'gone')
  const res = await postJson(dirApp({ configDir: gone }), '/api/admin/mount-mode', { startupMode: 'multi' })
  expect(res.status).toBe(400)
  expect(await res.json()).toMatchObject({ ok: false })
  expect(existsSync(configPath(gone))).toBe(false)
})

// ============================================================
// 写入：dir 模式的错误路径
// ============================================================

test('POST /api/admin/mount-mode refuses dir mode without a chosen mount', async () => {
  const res = await postJson(dirApp({ configDir: docs }), '/api/admin/mount-mode', { startupMode: 'dir' })
  expect(res.status).toBe(400)
  const body = await res.json() as { ok: boolean; error: string }
  expect(body.ok).toBe(false)
  expect(body.error).toContain('挂载点')
  // 失败的写不能留下配置文件
  expect(existsSync(configPath(docs))).toBe(false)
})

test('POST /api/admin/mount-mode refuses an unknown alias without touching the config', async () => {
  writeConfig(docs, { mounts: [{ alias: 'notes', name: '笔记', path: notes }] })
  const before = readFileSync(configPath(docs), 'utf-8')

  const res = await postJson(dirApp({ configDir: docs }), '/api/admin/mount-mode', {
    startupMode: 'dir',
    singleMountAlias: 'nope',
  })
  expect(res.status).toBe(400)
  expect((await res.json() as { ok: boolean }).ok).toBe(false)
  expect(readFileSync(configPath(docs), 'utf-8')).toBe(before)
})

test('POST /api/admin/mount-mode rejects an unknown startupMode', async () => {
  const res = await postJson(dirApp({ configDir: docs }), '/api/admin/mount-mode', { startupMode: 'single' })
  expect(res.status).toBe(400)
  expect((await res.json() as { ok: boolean }).ok).toBe(false)
  expect(existsSync(configPath(docs))).toBe(false)
})

test('POST /api/admin/mount-mode reports a malformed body without leaking internals', async () => {
  const res = await dirApp({ configDir: docs }).request('/api/admin/mount-mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ not json',
  })
  expect(res.status).toBe(400)
  const body = await res.json() as { ok: boolean; error: string }
  expect(body.ok).toBe(false)
  expect(body.error).not.toContain('SyntaxError')
  expect(body.error).not.toContain('at ')
  expect(existsSync(configPath(docs))).toBe(false)
})

// ============================================================
// 被拒绝的保存不能留下任何痕迹
//
// dir 模式的写入口要构造 MountManager，而它的构造函数会在配置缺失时建文件。
// 任何在构造之后才做的校验，失败时都已经把一个空配置写进了用户目录 ——
// 也就把下一次启动的根目录固定下来了。所以校验必须全部发生在构造之前。
// ============================================================

test('a rejected dir save does not create the config file it was going to write', async () => {
  const res = await postJson(dirApp({ configDir: docs }), '/api/admin/mount-mode', {
    startupMode: 'dir',
    singleMountAlias: 'nope',
  })
  expect(res.status).toBe(400)
  expect((await res.json() as { ok: boolean }).ok).toBe(false)
  expect(existsSync(configPath(docs))).toBe(false)
})

test('a rejected dir-to-multi save does not create the config file', async () => {
  // 配置目录还在，但被服务的根目录没了（降级启动后挂载点目录被删）
  const res = await postJson(dirApp({ configDir: docs, basePath: join(docs, 'gone') }), '/api/admin/mount-mode', {
    startupMode: 'multi',
  })
  expect(res.status).toBe(400)
  expect((await res.json() as { ok: boolean }).ok).toBe(false)
  expect(existsSync(configPath(docs))).toBe(false)
})

// ============================================================
// 读写必须用同一套校验，且不能删掉用户写在配置里的东西
// ============================================================

test('GET /api/admin/settings hides mount entries that a save would reject', async () => {
  writeConfig(docs, {
    mounts: [
      { alias: 'notes', name: '笔记', path: notes },
      { alias: 'api', name: '保留字', path: docs },
      { alias: 'has space', name: '非法字符', path: docs },
      { alias: 'nopath', name: '缺少路径' },
    ],
  })

  const res = await dirApp({ configDir: docs }).request('/api/admin/settings')
  const data = await res.json() as { mounts: Array<{ alias: string }>; invalidMountEntries?: number }
  // 列出来就意味着可选，可选就必须能保存
  expect(data.mounts.map(m => m.alias)).toEqual(['notes'])
  expect(data.invalidMountEntries).toBe(3)
})

test('POST /api/admin/mount-mode refuses a reserved alias that is present in the config', async () => {
  writeConfig(docs, { mounts: [{ alias: 'api', name: '保留字', path: notes }] })
  const before = readFileSync(configPath(docs), 'utf-8')

  const res = await postJson(dirApp({ configDir: docs }), '/api/admin/mount-mode', {
    startupMode: 'dir',
    singleMountAlias: 'api',
  })
  expect(res.status).toBe(400)
  expect(readFileSync(configPath(docs), 'utf-8')).toBe(before)
})

test('saving keeps the config entries the loader cannot use', async () => {
  writeConfig(docs, {
    mounts: [
      { alias: 'notes', name: '笔记', path: notes },
      { alias: 'api', name: '保留字', path: docs },
      { alias: 'nopath', name: '缺少路径' },
    ],
  })

  const res = await postJson(dirApp({ configDir: docs }), '/api/admin/mount-mode', { startupMode: 'multi' })
  expect(res.status).toBe(200)

  const saved = readConfig(docs) as unknown as { mounts: Array<Record<string, unknown>> }
  const aliases = saved.mounts.map(m => m.alias)
  expect(aliases).toContain('notes')
  expect(aliases).toContain('docs')
  // 一次保存不能顺手删掉用户手写的条目
  expect(saved.mounts).toContainEqual({ alias: 'api', name: '保留字', path: docs })
  expect(saved.mounts).toContainEqual({ alias: 'nopath', name: '缺少路径' })
})

test('saving preserves config keys it does not manage', async () => {
  writeConfig(docs, {
    $comment: '手写的说明',
    theme: { accent: 'blue' },
    mounts: [{ alias: 'notes', name: '笔记', path: notes }],
  })

  const res = await postJson(dirApp({ configDir: docs }), '/api/admin/mount-mode', { startupMode: 'multi' })
  expect(res.status).toBe(200)

  const saved = readConfig(docs) as unknown as Record<string, unknown>
  expect(saved.$comment).toBe('手写的说明')
  expect(saved.theme).toEqual({ accent: 'blue' })
  expect(saved.startupMode).toBe('multi')
})

test('a save never overwrites a config file that cannot be parsed', async () => {
  writeFileSync(configPath(docs), '{ "mounts": [ broken', 'utf-8')

  const res = await postJson(dirApp({ configDir: docs }), '/api/admin/mount-mode', { startupMode: 'multi' })
  expect(res.status).toBe(409)
  expect((await res.json() as { ok: boolean }).ok).toBe(false)
  expect(readFileSync(configPath(docs), 'utf-8')).toBe('{ "mounts": [ broken')
})

test('dir-to-multi does not reuse an alias that only a preserved entry owns', async () => {
  // 这个条目没有 path，用不了，但仍然占着 docs 这个 alias
  writeConfig(docs, { mounts: [{ alias: 'docs', name: '占位' }] })

  const res = await postJson(dirApp({ configDir: docs }), '/api/admin/mount-mode', { startupMode: 'multi' })
  expect(res.status).toBe(200)
  const body = await res.json() as { initialMount: { alias: string; path: string } }
  expect(body.initialMount.alias).not.toBe('docs')
  expect(body.initialMount.path).toBe(docs)

  // 写回后同一个 alias 不能出现两次
  const aliases = (readConfig(docs).mounts as Array<{ alias: string }>).map(m => m.alias)
  expect(new Set(aliases).size).toBe(aliases.length)
})

test('mount CRUD stays unavailable in dir mode and answers JSON, not the SPA', async () => {
  const app = dirApp({ configDir: docs })
  const res = await postJson(app, '/api/admin/mounts', { alias: 'x', name: 'x', path: notes })
  expect(res.status).toBe(409)
  expect((await res.json() as { ok: boolean }).ok).toBe(false)
  expect(existsSync(configPath(docs))).toBe(false)
})

// ============================================================
// 鉴权
// ============================================================

test('the dir-mode settings surface requires the access password when one is set', async () => {
  const auth: AuthConfig = { password: 'secret', signingKey: generateSigningKey(), maxAge: 3600 }
  const app = dirApp({ configDir: docs, auth })

  expect((await app.request('/api/admin/settings')).status).toBe(401)
  expect((await postJson(app, '/api/admin/mount-mode', { startupMode: 'multi' })).status).toBe(401)
  expect(existsSync(configPath(docs))).toBe(false)

  const login = await postJson(app, '/api/auth/login', { password: 'secret' })
  expect(login.status).toBe(200)
  const cookie = login.headers.get('set-cookie')!.split(';')[0]

  const ok = await app.request('/api/admin/settings', { headers: { cookie } })
  expect(ok.status).toBe(200)
  expect((await ok.json() as { mode: string }).mode).toBe('dir')

  const saved = await postJson(app, '/api/admin/mount-mode', { startupMode: 'multi' }, { cookie })
  expect(saved.status).toBe(200)
  expect(readConfig(docs).startupMode).toBe('multi')
})

// ============================================================
// multi 模式
// ============================================================

test('GET /api/admin/settings in multi mode lists mounts and the persisted target', async () => {
  const mm = new MountManager(ws, [
    { alias: 'notes', name: '笔记', path: notes },
    { alias: 'docs', name: '文档', path: docs },
  ])
  expect(mm.setStartupSettings({ startupMode: 'dir', singleMountAlias: 'notes' }).ok).toBe(true)

  const res = await multiApp(mm).request('/api/admin/settings')
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({
    mode: 'multi',
    startupMode: 'dir',
    startupModePersisted: true,
    singleMountAlias: 'notes',
    mounts: [
      { alias: 'docs', name: '文档', path: docs, readonly: false },
      { alias: 'notes', name: '笔记', path: notes, readonly: false },
    ],
    root: ws,
    configPath: configPath(ws),
  })
})

test('POST /api/admin/mount-mode demotes multi to a chosen existing mount', async () => {
  const mm = new MountManager(ws, [{ alias: 'notes', name: '笔记', path: notes }])

  const res = await postJson(multiApp(mm), '/api/admin/mount-mode', {
    startupMode: 'dir',
    singleMountAlias: 'notes',
  })
  expect(res.status).toBe(200)
  expect(await res.json()).toMatchObject({
    ok: true,
    restartRequired: true,
    startupMode: 'dir',
    singleMountAlias: 'notes',
  })

  expect(readConfig(ws)).toMatchObject({ startupMode: 'dir', singleMountAlias: 'notes' })
  expect(mm.getStartupSettings()).toEqual({ startupMode: 'dir', singleMountAlias: 'notes' })
})

test('multi-to-dir refuses an alias that is not a registered mount', async () => {
  const mm = new MountManager(ws, [{ alias: 'notes', name: '笔记', path: notes }])
  const before = readFileSync(configPath(ws), 'utf-8')

  const res = await postJson(multiApp(mm), '/api/admin/mount-mode', {
    startupMode: 'dir',
    singleMountAlias: 'ghost',
  })
  expect(res.status).toBe(400)
  expect((await res.json() as { ok: boolean }).ok).toBe(false)
  expect(readFileSync(configPath(ws), 'utf-8')).toBe(before)
})

test('multi-to-dir requires an explicit mount choice', async () => {
  const mm = new MountManager(ws, [{ alias: 'notes', name: '笔记', path: notes }])
  const before = readFileSync(configPath(ws), 'utf-8')

  const res = await postJson(multiApp(mm), '/api/admin/mount-mode', { startupMode: 'dir' })
  expect(res.status).toBe(400)
  expect((await res.json() as { ok: boolean }).ok).toBe(false)
  expect(readFileSync(configPath(ws), 'utf-8')).toBe(before)
})

test('multi mode can re-affirm multi without registering a mount for the workspace', async () => {
  const mm = new MountManager(ws, [{ alias: 'notes', name: '笔记', path: notes }])

  const res = await postJson(multiApp(mm), '/api/admin/mount-mode', { startupMode: 'multi' })
  expect(res.status).toBe(200)
  expect(await res.json()).toMatchObject({ ok: true, restartRequired: true, startupMode: 'multi' })

  const saved = readConfig(ws)
  expect(saved.startupMode).toBe('multi')
  // 工作区自身不是挂载点
  expect(saved.mounts.map(m => m.alias)).toEqual(['notes'])
})

test('the existing mount CRUD endpoints still work in multi mode', async () => {
  const mm = new MountManager(ws)
  const app = multiApp(mm)

  expect((await app.request('/api/admin/status')).status).toBe(200)

  const added = await postJson(app, '/api/admin/mounts', { alias: 'notes', name: '笔记', path: notes })
  expect(added.status).toBe(200)
  expect((await (await app.request('/api/admin/mounts')).json() as { mounts: unknown[] }).mounts).toHaveLength(1)

  const updated = await app.request('/api/admin/mounts/notes', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '改名' }),
  })
  expect(updated.status).toBe(200)
  expect(mm.get('notes')?.name).toBe('改名')

  expect((await app.request('/api/admin/mounts/notes', { method: 'DELETE' })).status).toBe(200)
  expect(mm.list()).toHaveLength(0)
})
