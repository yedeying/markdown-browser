/**
 * 挂载点配置管理器
 *
 * 职责：
 * - 加载/保存 <workspace>/.vmd-config.json
 * - 校验 alias 合法性和路径安全
 * - 挂载点 CRUD（供 admin API 调用）
 * - 订阅变更通知（供路由层失效缓存）
 */
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, renameSync } from 'fs'
import { isAbsolute, join, resolve } from 'path'
import type { MountConfig, VmdConfig } from '../types.js'

const CONFIG_FILENAME = '.vmd-config.json'
const ALIAS_PATTERN = /^[a-zA-Z0-9_-]+$/

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
      const data = JSON.parse(raw) as VmdConfig
      if (!Array.isArray(data.mounts)) return
      for (const m of data.mounts) {
        if (!this.validateAlias(m.alias)) continue
        this.mounts.set(m.alias, this.normalize(m))
      }
    } catch {
      // 配置损坏时保留空列表，不覆盖原文件
    }
  }

  private save() {
    const data: VmdConfig = { mounts: [...this.mounts.values()] }
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

  /** alias 必须匹配 [a-zA-Z0-9_-]+ 且不为保留字 */
  validateAlias(alias: string): boolean {
    if (!alias || typeof alias !== 'string') return false
    if (!ALIAS_PATTERN.test(alias)) return false
    // 保留前缀，避免与 API / 静态资源冲突
    const reserved = ['api', 'admin', 'assets', 'login', 'share', 'm', 'static']
    if (reserved.includes(alias.toLowerCase())) return false
    return true
  }

  /** 校验 path 存在且是目录；不存在尝试创建 */
  validatePath(p: string): { ok: boolean; error?: string; absPath?: string } {
    try {
      const absPath = isAbsolute(p) ? p : join(this.workspace, p)
      if (!existsSync(absPath)) {
        return { ok: false, error: `路径不存在: ${absPath}` }
      }
      const st = statSync(absPath)
      if (!st.isDirectory()) {
        return { ok: false, error: `不是目录: ${absPath}` }
      }
      return { ok: true, absPath: resolve(absPath) }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
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

  add(m: MountConfig): { ok: boolean; error?: string } {
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
    if (!this.mounts.has(alias)) {
      return { ok: false, error: `未找到挂载点: ${alias}` }
    }
    this.mounts.delete(alias)
    this.save()
    this.emit({ type: 'delete', alias })
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
