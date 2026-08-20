/**
 * 启动挂载模式解析
 *
 * CLI 的模式原本完全由参数推断：位置参数 → dir/single，--workspace → multi。
 * 设置面板把用户选择写进 <dir>/.vmd-config.json，这里负责让持久化的
 * startupMode 反过来改写那个推断，并保证任何失效目标只降级 + 告警。
 *
 * 本模块只做纯解析，不启动服务、不写配置，便于单测直接引用。
 */
import { existsSync, readFileSync, realpathSync, statSync } from 'fs'
import { isAbsolute, join, resolve, sep } from 'path'
import type { MountConfig, StartupMode, VmdConfig } from '../types.js'
import { CONFIG_FILENAME } from './reserved-files.js'
import { parseMountEntries } from './mount-config.js'

/** 从磁盘读到的启动相关配置（字段已过滤，mounts 一定是数组） */
export interface PersistedStartupConfig {
  startupMode?: StartupMode
  singleMountAlias?: string
  mounts: MountConfig[]
  /**
   * 校验不通过、被跳过但仍留在文件里的条目（仅在存在时出现）。
   * 写回配置时必须原样带上，不能当作"不存在"删掉。
   */
  ignoredMounts?: unknown[]
}

export interface StartupInput {
  /** file/dir 来自位置参数，workspace 来自 --workspace；path 必须是调用方已确认存在的绝对路径 */
  kind: 'file' | 'dir' | 'workspace'
  path: string
  /** 命令行是否显式传了 --mount（显式挂载点意味着多挂载意图，优先于持久化的 dir 模式） */
  hasExplicitMounts?: boolean
}

export interface StartupResolution {
  mode: 'single' | 'dir' | 'multi'
  /** single / dir 模式的根 */
  basePath?: string
  /** multi 模式的工作区 */
  workspace?: string
  /**
   * .vmd-config.json 所在目录（single 模式无此语义）。
   * dir 模式的 basePath 可能已经是别的挂载点目录，写回设置必须用这个路径。
   */
  configDir?: string
  /** config = 结果被持久化配置改写；argument = 仍是命令行参数推断的结果 */
  source: 'argument' | 'config'
  /** 需要打印给用户的降级原因 */
  warnings: string[]
}

/**
 * 磁盘配置的三种状态。
 * "缺失"和"损坏"必须分开：前者可以放心写出一份新配置，后者一写就会
 * 覆盖掉用户的内容，所以调用方要能拒绝这次保存而不是静默重建。
 */
export type StartupConfigState =
  | { state: 'missing' }
  | { state: 'unreadable' }
  | { state: 'ok'; config: PersistedStartupConfig }

/** 纯读 <dir>/.vmd-config.json，区分缺失与损坏；字段非法则丢弃该字段 */
export function readStartupConfigState(dir: string): StartupConfigState {
  const p = join(dir, CONFIG_FILENAME)
  let raw: string
  try {
    if (!existsSync(p)) return { state: 'missing' }
    raw = readFileSync(p, 'utf-8')
  } catch {
    return { state: 'unreadable' }
  }

  let data: VmdConfig
  try {
    data = JSON.parse(raw) as VmdConfig
  } catch {
    return { state: 'unreadable' }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { state: 'unreadable' }
  }

  // MountManager 落盘时用同一套规则，所以这里读到的可用条目
  // 就是保存时能被接受的条目
  const parsed = parseMountEntries(data.mounts)
  const config: PersistedStartupConfig = { mounts: parsed.mounts }
  if (data.startupMode === 'dir' || data.startupMode === 'multi') {
    config.startupMode = data.startupMode
  }
  if (typeof data.singleMountAlias === 'string' && data.singleMountAlias) {
    config.singleMountAlias = data.singleMountAlias
  }
  if (parsed.ignored.length > 0) config.ignoredMounts = parsed.ignored
  return { state: 'ok', config }
}

/**
 * 读取 <dir>/.vmd-config.json。
 * 文件缺失、无法读取、JSON 损坏一律返回 null；字段非法则丢弃该字段。
 */
export function readStartupConfig(dir: string): PersistedStartupConfig | null {
  const s = readStartupConfigState(dir)
  return s.state === 'ok' ? s.config : null
}

/**
 * 结合命令行输入与持久化配置得出最终启动形态。
 * 任何无法满足的持久化意图都退回参数推断，并在 warnings 里说明原因。
 */
export function resolveStartupMode(
  input: StartupInput,
  persisted: PersistedStartupConfig | null,
): StartupResolution {
  const warnings: string[] = []

  // 单文件预览没有“挂载”概念，配置一律不参与
  if (input.kind === 'file') {
    return { mode: 'single', basePath: input.path, source: 'argument', warnings }
  }

  // 配置总是住在参数指向的目录里，即使文件还不存在：设置写回要用它
  const configDir = input.path

  const fallback: StartupResolution = input.kind === 'workspace'
    ? { mode: 'multi', workspace: input.path, configDir, source: 'argument', warnings }
    : { mode: 'dir', basePath: input.path, configDir, source: 'argument', warnings }

  const startupMode = persisted?.startupMode
  if (!startupMode) return fallback

  if (startupMode === 'multi') {
    // 目录参数被提升为工作区；--workspace 本来就是 multi，无需改写
    return {
      mode: 'multi',
      workspace: input.path,
      configDir,
      source: input.kind === 'dir' ? 'config' : 'argument',
      warnings,
    }
  }

  // 只有 --workspace 会把 --mount 合并进配置，此时显式挂载点确实表达了多挂载意图
  if (input.kind === 'workspace' && input.hasExplicitMounts) {
    warnings.push('命令行显式使用了 --mount，忽略配置中的单挂载启动模式')
    return fallback
  }

  const target = resolveSingleMount(configDir, persisted, warnings)
  if (!target) return fallback

  // 位置参数下 --mount 根本不会被读取，回退到参数目录只是白丢用户选的挂载点
  if (input.hasExplicitMounts) {
    warnings.push('--mount 仅在多挂载模式下生效，本次已忽略')
  }
  // 位置参数说的是“看这个目录”，配置把根换到目录之外时不能悄悄换
  if (input.kind === 'dir' && !isInside(target, configDir)) {
    warnings.push(`启动挂载目录不在参数目录内: ${target}（来自 ${join(configDir, CONFIG_FILENAME)}）`)
  }
  return { mode: 'dir', basePath: target, configDir, source: 'config', warnings }
}

function realPathOrSelf(p: string): string {
  try {
    return realpathSync(p)
  } catch {
    return resolve(p)
  }
}

/** child 是否落在 parent 内部（含相等）；按 realpath 比较，避免符号链接误判 */
function isInside(child: string, parent: string): boolean {
  const c = realPathOrSelf(child)
  const p = realPathOrSelf(parent)
  return c === p || c.startsWith(p + sep)
}

/** 找出 singleMountAlias 指向的目录；不可用时写入告警并返回 undefined */
function resolveSingleMount(
  configDir: string,
  persisted: PersistedStartupConfig | null,
  warnings: string[],
): string | undefined {
  const alias = persisted?.singleMountAlias
  if (!alias) {
    warnings.push('配置为单挂载启动模式但未指定 singleMountAlias，回退到命令行参数')
    return undefined
  }
  // persisted 可能来自调用方手工构造的对象，这里仍按同一套规则过滤
  const mount = parseMountEntries(persisted?.mounts).mounts.find(m => m.alias === alias)
  if (!mount) {
    warnings.push(`启动挂载点不存在: ${alias}，回退到命令行参数`)
    return undefined
  }
  const abs = resolve(isAbsolute(mount.path) ? mount.path : join(configDir, mount.path))
  try {
    if (!existsSync(abs) || !statSync(abs).isDirectory()) {
      warnings.push(`启动挂载目录不可用: ${abs}，回退到命令行参数`)
      return undefined
    }
  } catch {
    warnings.push(`启动挂载目录不可用: ${abs}，回退到命令行参数`)
    return undefined
  }
  return abs
}
