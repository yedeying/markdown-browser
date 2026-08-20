/**
 * 挂载点配置管理器
 *
 * 职责：
 * - 加载/保存 <workspace>/.vmd-config.json
 * - 校验 alias 合法性和路径安全
 * - 挂载点 CRUD（供 admin API 调用）
 * - 订阅变更通知（供路由层失效缓存）
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs'
import { isAbsolute, join, resolve } from 'path'
import type { MountConfig, StartupMode, VmdConfig } from '../types.js'
import { CONFIG_FILENAME } from './reserved-files.js'
import { isValidMountAlias, parseMountEntries, validateMountDirectory } from './mount-config.js'

/** 这个类管理的顶层字段；其余字段属于用户，写回时原样保留 */
const MANAGED_KEYS = new Set(['startupMode', 'singleMountAlias', 'mounts'])

export interface StartupSettings {
  startupMode?: StartupMode
  singleMountAlias?: string
}

export interface StartupSettingsInput {
  startupMode: StartupMode
  /** dir 模式必填：作为单目录根的挂载点 alias */
  singleMountAlias?: string
  /** 目录模式升级到多挂载时，把当前目录登记为首个挂载点 */
  initialMount?: MountConfig
}

export type MountChangeType = 'add' | 'update' | 'delete' | 'reload'

export interface MountChangeEvent {
  type: MountChangeType
  alias?: string
}

type Listener = (event: MountChangeEvent) => void

export class MountManager {
  private workspace: string
  private configPath: string
  private mounts: Map<string, MountConfig> = new Map()
  private listeners: Set<Listener> = new Set()
  private startupMode?: StartupMode
  private singleMountAlias?: string
  /** 载入时用不了的挂载点条目，原样写回，不因为一次保存就丢掉用户的数据 */
  private ignoredMounts: unknown[] = []
  /** 配置里不属于本类管理的顶层字段，同样原样写回 */
  private extraFields: Record<string, unknown> = {}
  /** 配置文件存在但无法解析：此时任何写回都会毁掉用户的内容 */
  private configUnreadable = false

  /**
   * @param workspace 工作区绝对路径（用于解析相对 path）
   * @param initial   初始挂载点（来自 CLI --mount 参数）；会合并到落盘配置
   */
  constructor(workspace: string, initial: MountConfig[] = []) {
    this.workspace = resolve(workspace)
    this.configPath = join(this.workspace, CONFIG_FILENAME)
    this.load()
    // CLI 传入的挂载点覆盖/补充磁盘配置
    for (const m of initial) {
      this.mounts.set(m.alias, this.normalize(m))
    }
    if (initial.length > 0) this.save()
  }

  // ============================================================
  // 加载 / 保存
  // ============================================================

  private load() {
    if (!existsSync(this.configPath)) {
      // 首次启动：若工作区不存在则创建
      if (!existsSync(this.workspace)) {
        mkdirSync(this.workspace, { recursive: true })
      }
      this.save()
      return
    }
    try {
      const raw = readFileSync(this.configPath, 'utf-8')
      const data = JSON.parse(raw) as VmdConfig & Record<string, unknown>
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        this.configUnreadable = true
        return
      }
      if (data.startupMode === 'dir' || data.startupMode === 'multi') {
        this.startupMode = data.startupMode
      }
      if (typeof data.singleMountAlias === 'string' && this.validateAlias(data.singleMountAlias)) {
        this.singleMountAlias = data.singleMountAlias
      }
      for (const [key, value] of Object.entries(data)) {
        if (!MANAGED_KEYS.has(key)) this.extraFields[key] = value
      }
      // 逐条判定：一个畸形条目不能连带丢掉它后面的挂载点
      const parsed = parseMountEntries(data.mounts)
      this.ignoredMounts = parsed.ignored
      for (const m of parsed.mounts) {
        this.mounts.set(m.alias, this.normalize(m))
      }
    } catch {
      // JSON 损坏：保持空列表，并记住不能往这个文件上写
      this.configUnreadable = true
    }
  }

  private save() {
    // 文件在但解析不了：写回就会把用户的内容替换成一份"干净"的配置。
    // 调用方应先用 isConfigReadable() 拦住，这里是最后一道防线。
    if (this.configUnreadable) return
    // 启动设置与挂载点同文件，任何一次挂载点保存都必须带着它们写回；
    // 用不了的条目和陌生字段同样带回去，它们是用户的数据。
    const data: Record<string, unknown> = {
      ...this.extraFields,
      ...(this.startupMode ? { startupMode: this.startupMode } : {}),
      ...(this.singleMountAlias ? { singleMountAlias: this.singleMountAlias } : {}),
      mounts: [...this.mounts.values(), ...this.ignoredMounts],
    }
    const json = JSON.stringify(data, null, 2)
    // 原子写：tmp + rename
    const tmp = this.configPath + '.tmp'
    writeFileSync(tmp, json, 'utf-8')
    renameSync(tmp, this.configPath)
  }

  /** 将相对路径转为绝对，去除多余字段 */
  private normalize(m: MountConfig): MountConfig {
    const absPath = isAbsolute(m.path) ? m.path : join(this.workspace, m.path)
    return {
      alias: m.alias,
      name: m.name || m.alias,
      path: resolve(absPath),
      readonly: !!m.readonly,
    }
  }

  // ============================================================
  // 校验
  // ============================================================

  /** alias 必须匹配 [a-zA-Z0-9_-]+ 且不为保留字（与读路径同一套规则） */
  validateAlias(alias: string): boolean {
    return isValidMountAlias(alias)
  }

  /** 校验 path 存在且是目录 */
  validatePath(p: string): { ok: boolean; error?: string; absPath?: string } {
    return validateMountDirectory(p, this.workspace)
  }

  /**
   * 磁盘上的配置能否被解析。false 表示文件在但内容坏了，
   * 此时任何写回都会用一份"干净"的配置覆盖掉用户的内容。
   */
  isConfigReadable(): boolean {
    return !this.configUnreadable
  }

  /** 载入时被跳过、但仍保留在文件里的条目数量 */
  getIgnoredMountCount(): number {
    return this.ignoredMounts.length
  }

  /**
   * alias 是否已被占用。被跳过的条目也算占用：它们会原样写回文件，
   * 复用它们的 alias 就会产出一份含重复 alias 的配置。
   */
  isAliasTaken(alias: string): boolean {
    if (this.mounts.has(alias)) return true
    for (const entry of this.ignoredMounts) {
      const a = (entry as { alias?: unknown } | null)?.alias
      if (typeof a === 'string' && a === alias) return true
    }
    return false
  }

  // ============================================================
  // CRUD
  // ============================================================

  list(): MountConfig[] {
    return [...this.mounts.values()].sort((a, b) => a.alias.localeCompare(b.alias))
  }

  get(alias: string): MountConfig | undefined {
    return this.mounts.get(alias)
  }

  /** 任何写操作的前置检查：配置坏了就不能落盘，否则会覆盖用户内容 */
  private guardWritable(): { ok: boolean; error?: string } | null {
    if (this.configUnreadable) {
      return { ok: false, error: '配置文件无法解析，为避免覆盖内容已拒绝写入，请先修复它' }
    }
    return null
  }

  add(m: MountConfig): { ok: boolean; error?: string } {
    const blocked = this.guardWritable()
    if (blocked) return blocked
    if (!this.validateAlias(m.alias)) {
      return { ok: false, error: 'alias 只能包含字母、数字、_、-，且不能使用保留字' }
    }
    if (this.mounts.has(m.alias)) {
      return { ok: false, error: `alias 已存在: ${m.alias}` }
    }
    const v = this.validatePath(m.path)
    if (!v.ok) return { ok: false, error: v.error }
    this.mounts.set(m.alias, this.normalize({ ...m, path: v.absPath! }))
    this.save()
    this.emit({ type: 'add', alias: m.alias })
    return { ok: true }
  }

  update(alias: string, patch: Partial<MountConfig>): { ok: boolean; error?: string } {
    const blocked = this.guardWritable()
    if (blocked) return blocked
    const cur = this.mounts.get(alias)
    if (!cur) return { ok: false, error: `未找到挂载点: ${alias}` }
    const next: MountConfig = { ...cur, ...patch, alias: cur.alias }
    if (patch.path && patch.path !== cur.path) {
      const v = this.validatePath(patch.path)
      if (!v.ok) return { ok: false, error: v.error }
      next.path = v.absPath!
    }
    this.mounts.set(alias, this.normalize(next))
    this.save()
    this.emit({ type: 'update', alias })
    return { ok: true }
  }

  remove(alias: string): { ok: boolean; error?: string } {
    const blocked = this.guardWritable()
    if (blocked) return blocked
    if (!this.mounts.has(alias)) {
      return { ok: false, error: `未找到挂载点: ${alias}` }
    }
    this.mounts.delete(alias)
    // 删掉的正是启动目标：清空指针，让 CLI 回退到命令行推断而不是指向不存在的挂载点
    if (this.singleMountAlias === alias) this.singleMountAlias = undefined
    this.save()
    this.emit({ type: 'delete', alias })
    return { ok: true }
  }

  // ============================================================
  // 启动挂载模式
  // ============================================================

  getStartupSettings(): StartupSettings {
    const s: StartupSettings = {}
    if (this.startupMode) s.startupMode = this.startupMode
    if (this.singleMountAlias) s.singleMountAlias = this.singleMountAlias
    return s
  }

  /**
   * 保存启动挂载模式。全部校验通过后才落盘（一次原子写），
   * 因此校验失败时磁盘配置保持原样。
   */
  setStartupSettings(next: StartupSettingsInput): { ok: boolean; error?: string } {
    const blocked = this.guardWritable()
    if (blocked) return blocked
    if (next.startupMode !== 'dir' && next.startupMode !== 'multi') {
      return { ok: false, error: `startupMode 只能是 dir 或 multi: ${next.startupMode}` }
    }

    // 先在副本上校验，避免中途失败留下半成品
    const pending = new Map(this.mounts)
    let added: MountConfig | undefined
    const init = next.initialMount
    if (init) {
      if (!this.validateAlias(init.alias)) {
        return { ok: false, error: 'alias 只能包含字母、数字、_、-，且不能使用保留字' }
      }
      if (!pending.has(init.alias)) {
        const v = this.validatePath(init.path)
        if (!v.ok) return { ok: false, error: v.error }
        added = this.normalize({ ...init, path: v.absPath! })
        pending.set(added.alias, added)
      }
    }

    // 未显式指定时沿用现有目标（仍然存在才保留）
    const wanted = next.singleMountAlias ?? this.singleMountAlias
    const alias = wanted && pending.has(wanted) ? wanted : undefined
    if (next.startupMode === 'dir') {
      if (!wanted) return { ok: false, error: 'dir 模式必须指定 singleMountAlias' }
      if (!alias) return { ok: false, error: `未找到挂载点: ${wanted}` }
    }

    this.mounts = pending
    this.startupMode = next.startupMode
    this.singleMountAlias = alias
    this.save()
    if (added) this.emit({ type: 'add', alias: added.alias })
    return { ok: true }
  }

  // ============================================================
  // 订阅
  // ============================================================

  onChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: MountChangeEvent) {
    for (const l of this.listeners) {
      try { l(event) } catch { /* ignore */ }
    }
  }

  getWorkspace(): string {
    return this.workspace
  }

  getConfigPath(): string {
    return this.configPath
  }
}
