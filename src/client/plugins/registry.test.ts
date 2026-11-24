import { test, expect } from 'bun:test'
import { PluginRegistry } from './registry.ts'
import type { VmdPlugin } from './types.ts'

test('PluginRegistry resolves plugins by priority descending and falls back when sniffAndParse returns null', () => {
  const reg = new PluginRegistry()

  const fallbackText: VmdPlugin = {
    id: 'builtin.text',
    name: 'Plain Text',
    priority: 0,
    target: 'file',
    matchPath: () => true,
  }

  const specialTxt: VmdPlugin<{ lines: number }> = {
    id: 'ext.special-txt',
    name: 'Special TXT',
    priority: 100,
    target: 'file',
    matchPath: ({ ext }) => ext === '.txt',
    sniffAndParse: ({ content }) => content.startsWith('MAGIC:') ? { lines: content.split('\n').length } : null,
  }

  reg.register(fallbackText)
  reg.register(specialTxt)

  const hit = reg.resolveFile('notes/demo.txt', 'MAGIC:hello\nworld')
  expect(hit?.plugin.id).toBe('ext.special-txt')
  expect(hit?.parsed).toEqual({ lines: 2 })

  const miss = reg.resolveFile('notes/plain.txt', 'ordinary text')
  expect(miss?.plugin.id).toBe('builtin.text')
})

test('PluginRegistry isolates crashing sniffAndParse and falls back cleanly', () => {
  const reg = new PluginRegistry()
  reg.register({
    id: 'ext.buggy',
    name: 'Buggy',
    priority: 100,
    target: 'file',
    matchPath: ({ ext }) => ext === '.txt',
    sniffAndParse: () => { throw new Error('boom') },
  })
  reg.register({
    id: 'builtin.fallback',
    name: 'Fallback',
    priority: 0,
    target: 'file',
    matchPath: () => true,
  })

  const res = reg.resolveFile('a.txt', 'hello')
  expect(res?.plugin.id).toBe('builtin.fallback')
})

test('PluginRegistry resolves folder plugins when children satisfy matchPath', () => {
  const reg = new PluginRegistry()
  reg.register({
    id: 'builtin.site-folder',
    name: 'Static Site',
    priority: 50,
    target: 'folder',
    matchPath: ({ isFolder, children }) =>
      isFolder && !!children?.some((c) => c.type === 'file' && c.name === 'index.html'),
  })

  expect(reg.resolveFolder({
    name: 'demo',
    path: 'demo',
    type: 'folder',
    children: [{ name: 'index.html', path: 'demo/index.html', type: 'file' }],
  })?.id).toBe('builtin.site-folder')

  expect(reg.resolveFolder({
    name: 'plain',
    path: 'plain',
    type: 'folder',
    children: [{ name: 'readme.md', path: 'plain/readme.md', type: 'file' }],
  })).toBeNull()
})
