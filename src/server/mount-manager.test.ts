import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { MountManager } from './mount-manager.ts'
import type { VmdConfig } from '../types.ts'

// 启动挂载模式（startupMode / singleMountAlias）与挂载点写在同一个
// <workspace>/.vmd-config.json 里，因此任何一次挂载点保存都不能把它们丢掉；
// 旧配置（只有 mounts）也必须能原样加载和写回。

let ws: string
let notes: string
let work: string

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), 'vmd-mm-'))
  notes = join(ws, 'notes')
  work = join(ws, 'work')
  mkdirSync(notes)
  mkdirSync(work)
})

afterEach(() => {
  rmSync(ws, { recursive: true, force: true })
})

function configPath(): string {
  return join(ws, '.vmd-config.json')
}

function readConfig(): VmdConfig {
  return JSON.parse(readFileSync(configPath(), 'utf-8')) as VmdConfig
}

function writeConfig(raw: string) {
  writeFileSync(configPath(), raw, 'utf-8')
}

test('legacy config without startup fields loads and stays clean after a mount save', () => {
  writeConfig(JSON.stringify({ mounts: [{ alias: 'notes', name: '笔记', path: notes }] }))

  const mm = new MountManager(ws)
  expect(mm.list().map(m => m.alias)).toEqual(['notes'])
  expect(mm.getStartupSettings()).toEqual({})

  expect(mm.add({ alias: 'work', name: '工作', path: work }).ok).toBe(true)

  const saved = readConfig()
  expect(saved.mounts.map(m => m.alias).sort()).toEqual(['notes', 'work'])
  expect('startupMode' in saved).toBe(false)
  expect('singleMountAlias' in saved).toBe(false)
})

test('dir-to-multi promotion registers the initial mount and persists multi mode', () => {
  const mm = new MountManager(ws)
  const res = mm.setStartupSettings({
    startupMode: 'multi',
    initialMount: { alias: 'notes', name: '笔记', path: notes },
  })
  expect(res.ok).toBe(true)

  expect(readConfig()).toMatchObject({
    startupMode: 'multi',
    mounts: [{ alias: 'notes', name: '笔记', path: notes }],
  })

  // 重新实例化（模拟重启）后仍然可见
  const reopened = new MountManager(ws)
  expect(reopened.getStartupSettings().startupMode).toBe('multi')
  expect(reopened.get('notes')?.path).toBe(notes)
})

test('multi-to-dir selection persists the chosen alias and survives later mount edits', () => {
  const mm = new MountManager(ws, [
    { alias: 'notes', name: '笔记', path: notes },
    { alias: 'work', name: '工作', path: work },
  ])

  expect(mm.setStartupSettings({ startupMode: 'dir', singleMountAlias: 'notes' }).ok).toBe(true)
  expect(mm.getStartupSettings()).toEqual({ startupMode: 'dir', singleMountAlias: 'notes' })

  // 另一个挂载点的增删改都不能冲掉启动设置
  expect(mm.update('work', { name: '工作区' }).ok).toBe(true)
  expect(readConfig().startupMode).toBe('dir')
  expect(mm.remove('work').ok).toBe(true)

  const saved = readConfig()
  expect(saved.startupMode).toBe('dir')
  expect(saved.singleMountAlias).toBe('notes')
  expect(saved.mounts.map(m => m.alias)).toEqual(['notes'])
})

test('setStartupSettings rejects invalid targets without touching the config file', () => {
  const mm = new MountManager(ws, [{ alias: 'notes', name: '笔记', path: notes }])
  const before = readFileSync(configPath(), 'utf-8')

  expect(mm.setStartupSettings({ startupMode: 'dir', singleMountAlias: 'ghost' }).ok).toBe(false)
  expect(mm.setStartupSettings({ startupMode: 'dir' }).ok).toBe(false)
  expect(mm.setStartupSettings({ startupMode: 'single' as 'dir' }).ok).toBe(false)
  expect(mm.setStartupSettings({
    startupMode: 'multi',
    initialMount: { alias: 'gone', name: '不存在', path: join(ws, 'missing') },
  }).ok).toBe(false)
  expect(mm.setStartupSettings({
    startupMode: 'multi',
    initialMount: { alias: 'api', name: '保留字', path: work },
  }).ok).toBe(false)

  expect(mm.getStartupSettings()).toEqual({})
  expect(readFileSync(configPath(), 'utf-8')).toBe(before)
})

test('removing the selected mount drops the dangling singleMountAlias', () => {
  const mm = new MountManager(ws, [
    { alias: 'notes', name: '笔记', path: notes },
    { alias: 'work', name: '工作', path: work },
  ])
  mm.setStartupSettings({ startupMode: 'dir', singleMountAlias: 'notes' })

  expect(mm.remove('notes').ok).toBe(true)

  expect(mm.getStartupSettings()).toEqual({ startupMode: 'dir' })
  expect('singleMountAlias' in readConfig()).toBe(false)
})

test('unknown startupMode values on disk are ignored instead of crashing', () => {
  writeConfig(JSON.stringify({ startupMode: 'wat', singleMountAlias: 42, mounts: [] }))
  const mm = new MountManager(ws)
  expect(mm.getStartupSettings()).toEqual({})
})

test('save preserves entries it cannot load and keys it does not manage', () => {
  // 校验不通过的条目和陌生的顶层字段都是用户写进去的数据。
  // 加载时用不了它们是一回事，一次挂载点保存就把它们从文件里抹掉是另一回事。
  writeConfig(JSON.stringify({
    $comment: '手写的说明',
    mounts: [
      { alias: 'notes', name: '笔记', path: notes },
      { alias: 'api', name: '保留字', path: notes },
      { alias: 'has space', name: '非法字符', path: notes },
      { alias: 'nopath', name: '缺少路径' },
      null,
    ],
  }))

  const mm = new MountManager(ws)
  // 用不了的条目不能出现在可用列表里（否则 UI 会列出保存必然被拒的挂载点）
  expect(mm.list().map(m => m.alias)).toEqual(['notes'])

  expect(mm.add({ alias: 'work', name: '工作', path: work }).ok).toBe(true)

  const saved = readConfig() as unknown as Record<string, unknown>
  expect(saved.$comment).toBe('手写的说明')
  const entries = saved.mounts as Array<Record<string, unknown> | null>
  expect(entries.map(m => m?.alias)).toContain('notes')
  expect(entries.map(m => m?.alias)).toContain('work')
  expect(entries).toContainEqual({ alias: 'api', name: '保留字', path: notes })
  expect(entries).toContainEqual({ alias: 'has space', name: '非法字符', path: notes })
  expect(entries).toContainEqual({ alias: 'nopath', name: '缺少路径' })
  expect(entries).toContainEqual(null)
})

test('a malformed entry does not truncate the mounts that follow it', () => {
  // normalize() 会在 path 缺失时抛错；如果整个 load 被一次 try/catch 吞掉，
  // 后面的挂载点就全丢了，而下一次 save 会把这个截断结果落盘。
  writeConfig(JSON.stringify({
    mounts: [
      { alias: 'nopath', name: '缺少路径' },
      { alias: 'notes', name: '笔记', path: notes },
      { alias: 'work', name: '工作', path: work },
    ],
  }))

  const mm = new MountManager(ws)
  expect(mm.list().map(m => m.alias)).toEqual(['notes', 'work'])
})

test('startup fields load even when mounts is missing or malformed', () => {
  writeConfig(JSON.stringify({ startupMode: 'multi' }))
  const mm = new MountManager(ws)
  expect(mm.getStartupSettings().startupMode).toBe('multi')
  expect(mm.list()).toEqual([])
})
