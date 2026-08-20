/**
 * 挂载点条目的校验与解析 —— 读路径和写路径共用同一套规则
 *
 * 这份规则原本有两套：`MountManager.load` 用 alias 白名单过滤，
 * `readStartupConfig` 只检查 alias/path 是不是字符串。结果是设置面板
 * 能列出一个保存时必然被拒的挂载点（比如 alias 为 `api`），而"保存为
 * 多挂载"又会在写回时把这些条目从配置文件里抹掉。规则只能有一份。
 *
 * 另一条同样重要的约定：校验不通过的条目是用户写进文件里的数据。
 * 加载时用不了它们，不等于可以在下一次保存时删掉它们。
 */
import { existsSync, statSync } from 'fs'
import { isAbsolute, join, resolve } from 'path'
import type { MountConfig } from '../types.js'

const ALIAS_PATTERN = /^[a-zA-Z0-9_-]+$/

/** 保留前缀，避免与 API / 静态资源 / 挂载路由冲突 */
const RESERVED_ALIASES = new Set(['api', 'admin', 'assets', 'login', 'share', 'm', 'static'])

/** alias 必须匹配 [a-zA-Z0-9_-]+ 且不是保留字 */
export function isValidMountAlias(alias: unknown): alias is string {
  if (typeof alias !== 'string' || !alias) return false
  if (!ALIAS_PATTERN.test(alias)) return false
  return !RESERVED_ALIASES.has(alias.toLowerCase())
}

export interface ParsedMounts {
  /** 可用的挂载点，保持配置里的顺序 */
  mounts: MountConfig[]
  /** 用不了的条目，原样保留：写回配置时必须带上 */
  ignored: unknown[]
}

/** 条目要能用，alias 必须合法、path 必须是非空字符串 */
function isUsableMountEntry(entry: unknown): entry is MountConfig {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
  const m = entry as Partial<MountConfig>
  return isValidMountAlias(m.alias) && typeof m.path === 'string' && !!m.path
}

/**
 * 拆分配置里的 mounts 数组。
 * 非数组（含缺失）当作空数组：它无法被表达成挂载点列表，也无法原样写回。
 */
export function parseMountEntries(raw: unknown): ParsedMounts {
  if (!Array.isArray(raw)) return { mounts: [], ignored: [] }
  const mounts: MountConfig[] = []
  const ignored: unknown[] = []
  for (const entry of raw) {
    if (isUsableMountEntry(entry)) mounts.push(entry)
    else ignored.push(entry)
  }
  return { mounts, ignored }
}

/**
 * 已被占用的 alias。被保留的条目也算占用：
 * 否则新建的挂载点可能和一个用不了的条目重名，写出一份有重复 alias 的配置。
 */
export function takenMountAliases(parsed: ParsedMounts): Set<string> {
  const taken = new Set(parsed.mounts.map(m => m.alias))
  for (const entry of parsed.ignored) {
    const alias = (entry as { alias?: unknown } | null)?.alias
    if (typeof alias === 'string') taken.add(alias)
  }
  return taken
}

/** path 必须存在且是目录；相对路径按 baseDir 解析 */
export function validateMountDirectory(
  p: string,
  baseDir: string,
): { ok: boolean; error?: string; absPath?: string } {
  try {
    const absPath = isAbsolute(p) ? p : join(baseDir, p)
    if (!existsSync(absPath)) {
      return { ok: false, error: `路径不存在: ${absPath}` }
    }
    if (!statSync(absPath).isDirectory()) {
      return { ok: false, error: `不是目录: ${absPath}` }
    }
    return { ok: true, absPath: resolve(absPath) }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}
