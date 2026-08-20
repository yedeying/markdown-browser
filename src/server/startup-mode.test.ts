import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { readStartupConfig, resolveStartupMode } from './startup-mode.ts'

// CLI 的模式此前完全由参数推断（位置参数 = dir/single，--workspace = multi）。
// 设置面板保存的 startupMode 必须能反过来改写这个推断，同时任何失效的目标
// （alias 不存在、目录被删）都只能降级 + 告警，绝不能让启动崩掉。

let root: string
let notes: string
let work: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vmd-startup-'))
  notes = join(root, 'notes')
  work = join(root, 'work')
  mkdirSync(notes)
  mkdirSync(work)
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function writeConfig(dir: string, data: unknown) {
  writeFileSync(join(dir, '.vmd-config.json'), typeof data === 'string' ? data : JSON.stringify(data), 'utf-8')
}

// ============================================================
// readStartupConfig
// ============================================================

test('readStartupConfig returns null when the file is missing or unreadable', () => {
  expect(readStartupConfig(root)).toBeNull()
  expect(readStartupConfig(join(root, 'nope'))).toBeNull()
})

test('readStartupConfig tolerates corrupt JSON and malformed fields', () => {
  writeConfig(root, '{ not json')
  expect(readStartupConfig(root)).toBeNull()

  writeConfig(root, { startupMode: 'dir', singleMountAlias: 'notes', mounts: 'nope' })
  expect(readStartupConfig(root)).toEqual({
    startupMode: 'dir',
    singleMountAlias: 'notes',
    mounts: [],
  })

  writeConfig(root, { startupMode: 'bogus', mounts: [{ alias: 'notes', name: '笔记', path: notes }] })
  expect(readStartupConfig(root)).toEqual({
    mounts: [{ alias: 'notes', name: '笔记', path: notes }],
  })
})

// ============================================================
// 位置参数（文件）
// ============================================================

test('a file argument stays in single mode regardless of persisted config', () => {
  const file = join(root, 'README.md')
  writeFileSync(file, '# hi\n')
  const res = resolveStartupMode(
    { kind: 'file', path: file },
    { startupMode: 'multi', mounts: [] },
  )
  expect(res).toEqual({ mode: 'single', basePath: file, source: 'argument', warnings: [] })
  // 单文件预览没有配置语义，不该谎报一个配置目录
  expect(res.configDir).toBeUndefined()
})

// ============================================================
// 位置参数（目录）
// ============================================================

test('a directory argument without config keeps argument-derived dir mode', () => {
  const res = resolveStartupMode({ kind: 'dir', path: root }, null)
  expect(res).toEqual({ mode: 'dir', basePath: root, configDir: root, source: 'argument', warnings: [] })
})

// Task 5 需要在 multi→dir 之后把设置写回原来的配置文件，所以解析结果必须
// 保留配置所在目录 —— dir 模式的 basePath 可能已经是别的挂载点目录了。

test('configDir keeps the config location for a normal dir launch', () => {
  writeConfig(root, { mounts: [] })
  const res = resolveStartupMode({ kind: 'dir', path: root }, readStartupConfig(root))
  expect(res.mode).toBe('dir')
  expect(res.basePath).toBe(root)
  expect(res.configDir).toBe(root)
})

test('configDir survives a workspace launch demoted to dir mode', () => {
  const res = resolveStartupMode(
    { kind: 'workspace', path: root },
    { startupMode: 'dir', singleMountAlias: 'work', mounts: [{ alias: 'work', name: '工作', path: work }] },
  )
  expect(res.mode).toBe('dir')
  // 根目录换成了挂载点，但配置仍然住在原来的工作区里
  expect(res.basePath).toBe(work)
  expect(res.configDir).toBe(root)
})

test('configDir is reported even when no config file exists yet', () => {
  expect(resolveStartupMode({ kind: 'dir', path: root }, null).configDir).toBe(root)
  expect(resolveStartupMode({ kind: 'workspace', path: root }, null).configDir).toBe(root)
})

test('configDir follows a directory argument promoted to multi mode', () => {
  const res = resolveStartupMode({ kind: 'dir', path: root }, { startupMode: 'multi', mounts: [] })
  expect(res.mode).toBe('multi')
  expect(res.workspace).toBe(root)
  expect(res.configDir).toBe(root)
})

test('persisted multi mode promotes a directory argument to workspace mode', () => {
  const res = resolveStartupMode(
    { kind: 'dir', path: root },
    { startupMode: 'multi', mounts: [{ alias: 'notes', name: '笔记', path: notes }] },
  )
  expect(res.mode).toBe('multi')
  expect(res.workspace).toBe(root)
  expect(res.source).toBe('config')
  expect(res.warnings).toEqual([])
})

test('persisted dir mode redirects a directory argument to the selected mount', () => {
  const res = resolveStartupMode(
    { kind: 'dir', path: root },
    {
      startupMode: 'dir',
      singleMountAlias: 'notes',
      mounts: [
        { alias: 'notes', name: '笔记', path: notes },
        { alias: 'work', name: '工作', path: work },
      ],
    },
  )
  expect(res).toEqual({ mode: 'dir', basePath: notes, configDir: root, source: 'config', warnings: [] })
})

test('a relative mount path is resolved against the config directory', () => {
  const res = resolveStartupMode(
    { kind: 'dir', path: root },
    { startupMode: 'dir', singleMountAlias: 'notes', mounts: [{ alias: 'notes', name: '笔记', path: 'notes' }] },
  )
  expect(res.mode).toBe('dir')
  expect(res.basePath).toBe(notes)
})

test('an unknown alias falls back to the argument with a warning', () => {
  const res = resolveStartupMode(
    { kind: 'dir', path: root },
    { startupMode: 'dir', singleMountAlias: 'ghost', mounts: [{ alias: 'notes', name: '笔记', path: notes }] },
  )
  expect(res.mode).toBe('dir')
  expect(res.basePath).toBe(root)
  expect(res.source).toBe('argument')
  expect(res.warnings.length).toBe(1)
  expect(res.warnings[0]).toContain('ghost')
})

test('a vanished mount directory falls back to the argument with a warning', () => {
  const gone = join(root, 'gone')
  mkdirSync(gone)
  rmSync(gone, { recursive: true, force: true })

  const res = resolveStartupMode(
    { kind: 'dir', path: root },
    { startupMode: 'dir', singleMountAlias: 'gone', mounts: [{ alias: 'gone', name: '没了', path: gone }] },
  )
  expect(res.mode).toBe('dir')
  expect(res.basePath).toBe(root)
  expect(res.warnings[0]).toContain(gone)
})

test('a mount pointing at a file instead of a directory falls back with a warning', () => {
  const file = join(root, 'notes.md')
  writeFileSync(file, '# hi\n')
  const res = resolveStartupMode(
    { kind: 'dir', path: root },
    { startupMode: 'dir', singleMountAlias: 'notes', mounts: [{ alias: 'notes', name: '笔记', path: file }] },
  )
  expect(res.basePath).toBe(root)
  expect(res.warnings.length).toBe(1)
})

test('persisted dir mode without an alias falls back to the argument with a warning', () => {
  const res = resolveStartupMode(
    { kind: 'dir', path: root },
    { startupMode: 'dir', mounts: [{ alias: 'notes', name: '笔记', path: notes }] },
  )
  expect(res.basePath).toBe(root)
  expect(res.source).toBe('argument')
  expect(res.warnings.length).toBe(1)
})

// ============================================================
// --workspace
// ============================================================

test('a workspace argument without config keeps multi mode', () => {
  const res = resolveStartupMode({ kind: 'workspace', path: root }, null)
  expect(res).toEqual({ mode: 'multi', workspace: root, configDir: root, source: 'argument', warnings: [] })
})

test('persisted dir mode demotes a workspace argument to the selected mount', () => {
  const res = resolveStartupMode(
    { kind: 'workspace', path: root },
    { startupMode: 'dir', singleMountAlias: 'work', mounts: [{ alias: 'work', name: '工作', path: work }] },
  )
  expect(res).toEqual({ mode: 'dir', basePath: work, configDir: root, source: 'config', warnings: [] })
})

test('an invalid persisted target keeps the workspace in multi mode with a warning', () => {
  const res = resolveStartupMode(
    { kind: 'workspace', path: root },
    { startupMode: 'dir', singleMountAlias: 'ghost', mounts: [] },
  )
  expect(res.mode).toBe('multi')
  expect(res.workspace).toBe(root)
  expect(res.warnings.length).toBe(1)
})

test('explicit --mount arguments win over a persisted dir mode for a workspace', () => {
  const res = resolveStartupMode(
    { kind: 'workspace', path: root, hasExplicitMounts: true },
    { startupMode: 'dir', singleMountAlias: 'work', mounts: [{ alias: 'work', name: '工作', path: work }] },
  )
  expect(res.mode).toBe('multi')
  expect(res.workspace).toBe(root)
  expect(res.source).toBe('argument')
  expect(res.warnings.length).toBe(1)
  expect(res.warnings[0]).toContain('--mount')
})

// 位置参数下 --mount 无论如何都不会被合并（只有多挂载模式才读它），
// 所以拿它去否决配置里的单挂载目标只是白丢了用户的选择，警告文案也在撒谎。

test('explicit --mount does not override a persisted dir target for a positional directory', () => {
  const res = resolveStartupMode(
    { kind: 'dir', path: root, hasExplicitMounts: true },
    { startupMode: 'dir', singleMountAlias: 'notes', mounts: [{ alias: 'notes', name: '笔记', path: notes }] },
  )
  expect(res.mode).toBe('dir')
  expect(res.basePath).toBe(notes)
  expect(res.source).toBe('config')
  expect(res.warnings.length).toBe(1)
  expect(res.warnings[0]).toContain('--mount')
  expect(res.warnings[0]).not.toContain('忽略配置')
})

test('explicit --mount is merged without warning when a directory is promoted to multi', () => {
  const res = resolveStartupMode(
    { kind: 'dir', path: root, hasExplicitMounts: true },
    { startupMode: 'multi', mounts: [] },
  )
  expect(res.mode).toBe('multi')
  expect(res.warnings).toEqual([])
})

// ============================================================
// 根目录改写的可见性
// ============================================================

// 配置只能选中它自己声明的挂载点，所以 dir 模式能达到的范围永远是同一份
// 配置在 multi 模式下本来就会暴露的范围之内 —— 硬性要求挂载点位于配置目录内
// 会直接废掉多挂载模型（挂载点本来就指向宿主机任意目录）。这里守的是可见性：
// 位置参数被改写到参数目录之外时必须显式告警，不能静默换根。

test('a positional directory redirected outside itself warns but still honors the config', () => {
  const outside = mkdtempSync(join(tmpdir(), 'vmd-outside-'))
  try {
    const res = resolveStartupMode(
      { kind: 'dir', path: join(root, 'notes') },
      { startupMode: 'dir', singleMountAlias: 'out', mounts: [{ alias: 'out', name: '外部', path: outside }] },
    )
    expect(res.mode).toBe('dir')
    expect(res.basePath).toBe(outside)
    expect(res.source).toBe('config')
    expect(res.warnings.length).toBe(1)
    expect(res.warnings[0]).toContain(outside)
  } finally {
    rmSync(outside, { recursive: true, force: true })
  }
})

test('no redirect warning when the selected mount lives inside the argument directory', () => {
  const res = resolveStartupMode(
    { kind: 'dir', path: root },
    { startupMode: 'dir', singleMountAlias: 'notes', mounts: [{ alias: 'notes', name: '笔记', path: notes }] },
  )
  expect(res.warnings).toEqual([])
})

test('a workspace demotion to an outside mount is normal and stays quiet', () => {
  const outside = mkdtempSync(join(tmpdir(), 'vmd-outside-'))
  try {
    const res = resolveStartupMode(
      { kind: 'workspace', path: root },
      { startupMode: 'dir', singleMountAlias: 'out', mounts: [{ alias: 'out', name: '外部', path: outside }] },
    )
    expect(res.basePath).toBe(outside)
    expect(res.warnings).toEqual([])
  } finally {
    rmSync(outside, { recursive: true, force: true })
  }
})

test('a resolved root is always either the argument or a declared mount of the same config', () => {
  const outside = mkdtempSync(join(tmpdir(), 'vmd-outside-'))
  try {
    // singleMountAlias 只能选中 mounts 里声明过的条目，没有任意路径字段可用
    const undeclared = resolveStartupMode(
      { kind: 'dir', path: root },
      { startupMode: 'dir', singleMountAlias: outside, mounts: [{ alias: 'notes', name: '笔记', path: notes }] },
    )
    expect(undeclared.basePath).toBe(root)
    expect(undeclared.source).toBe('argument')

    const declared = resolveStartupMode(
      { kind: 'workspace', path: root },
      { startupMode: 'dir', singleMountAlias: 'notes', mounts: [{ alias: 'notes', name: '笔记', path: notes }] },
    )
    expect([root, notes]).toContain(declared.basePath)
  } finally {
    rmSync(outside, { recursive: true, force: true })
  }
})

test('resolveStartupMode never throws on a garbage config object', () => {
  const junk = { startupMode: 'dir', singleMountAlias: 'x', mounts: [null, { alias: 'x' }] } as never
  expect(() => resolveStartupMode({ kind: 'dir', path: root }, junk)).not.toThrow()
  expect(resolveStartupMode({ kind: 'dir', path: root }, junk).basePath).toBe(root)
})
