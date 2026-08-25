import { test, expect } from 'bun:test'
import type { FileNode } from '../../types.js'
import { mergeChildLists, patchChildren } from './treePatch.ts'

function folder(path: string, children?: FileNode[]): FileNode {
  const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path
  return children !== undefined
    ? { name, type: 'folder', path, children }
    : { name, type: 'folder', path }
}

function file(path: string): FileNode {
  const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path
  return { name, type: 'file', path }
}

test('mergeChildLists keeps loaded deep children when next listing omits them', () => {
  const prev = [
    folder('notes/sub', [file('notes/sub/a.md'), folder('notes/sub/deep', [file('notes/sub/deep/x.md')])]),
  ]
  // 浅层刷新：sub 有 children，但 deep 未带 children
  const next = [
    folder('notes/sub', [file('notes/sub/a.md'), folder('notes/sub/deep')]),
  ]
  const merged = mergeChildLists(prev, next)
  const deep = merged[0].children?.find((n) => n.path === 'notes/sub/deep')
  expect(deep?.type).toBe('folder')
  expect(deep && deep.type === 'folder' ? deep.children : undefined).toEqual([
    file('notes/sub/deep/x.md'),
  ])
})

test('mergeChildLists drops nodes removed from next listing', () => {
  const prev = [file('a.md'), file('gone.md')]
  const next = [file('a.md')]
  expect(mergeChildLists(prev, next)).toEqual([file('a.md')])
})

test('mergeChildLists trusts explicit empty children on next', () => {
  const prev = [folder('empty', [file('empty/old.md')])]
  const next = [folder('empty', [])]
  expect(mergeChildLists(prev, next)).toEqual([folder('empty', [])])
})

test('patchChildren on ancestor preserves deeper loaded subtree', () => {
  const tree: FileNode[] = [
    folder('notes', [
      folder('notes/sub', [
        folder('notes/sub/deep', [file('notes/sub/deep/x.md')]),
      ]),
    ]),
  ]
  // 模拟 refresh(notes)：新 listing 里 deep 没有 children
  const refreshedNotesChildren = [
    folder('notes/sub', [folder('notes/sub/deep'), file('notes/sub/y.md')]),
  ]
  const next = patchChildren(tree, 'notes', refreshedNotesChildren)
  const deep = next[0].children?.[0].children?.find((n) => n.path === 'notes/sub/deep')
  expect(deep && deep.type === 'folder' ? deep.children : undefined).toEqual([
    file('notes/sub/deep/x.md'),
  ])
  // 新文件仍合并进来
  expect(next[0].children?.[0].children?.some((n) => n.path === 'notes/sub/y.md')).toBe(true)
})

test('patchChildren root merge preserves nested loads', () => {
  const tree: FileNode[] = [
    folder('notes', [folder('notes/a', [file('notes/a/1.md')])]),
  ]
  const rootNext = [folder('notes'), file('readme.md')]
  const next = patchChildren(tree, '', rootNext)
  expect(next.map((n) => n.path).sort()).toEqual(['notes', 'readme.md'])
  const notes = next.find((n) => n.path === 'notes')
  expect(notes && notes.type === 'folder' ? notes.children : undefined).toEqual([
    folder('notes/a', [file('notes/a/1.md')]),
  ])
})
