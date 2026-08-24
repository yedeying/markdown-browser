import { test, expect } from 'bun:test'
import type { FileNode } from '../../types.js'
import {
  buildMediaPlaylist,
  filterMasonryNodes,
  folderHasMedia,
  isMediaFile,
} from './galleryMedia.ts'

function folder(name: string, path: string): FileNode {
  return { name, type: 'folder', path, children: [] }
}
function file(name: string, path: string): FileNode {
  return { name, type: 'file', path, size: '1' }
}

test('isMediaFile detects images and videos only', () => {
  expect(isMediaFile(file('a.png', 'a.png'))).toBe(true)
  expect(isMediaFile(file('a.MP4', 'a.MP4'))).toBe(true)
  expect(isMediaFile(file('a.md', 'a.md'))).toBe(false)
  expect(isMediaFile(folder('imgs', 'imgs'))).toBe(false)
})

test('folderHasMedia is true when any child is media', () => {
  expect(folderHasMedia([file('n.md', 'n.md'), folder('d', 'd')])).toBe(false)
  expect(folderHasMedia([file('n.md', 'n.md'), file('p.jpg', 'p.jpg')])).toBe(true)
  expect(folderHasMedia([file('v.webm', 'v.webm')])).toBe(true)
})

test('filterMasonryNodes keeps only media, drops folders and other files', () => {
  const nodes = [
    folder('sub', 'sub'),
    file('a.md', 'a.md'),
    file('b.png', 'b.png'),
    file('c.ts', 'c.ts'),
    file('d.mp4', 'd.mp4'),
  ]
  expect(filterMasonryNodes(nodes).map((n) => n.path)).toEqual(['b.png', 'd.mp4'])
})

test('buildMediaPlaylist is media-only in order', () => {
  const nodes = [
    folder('sub', 'sub'),
    file('b.png', 'b.png'),
    file('a.md', 'a.md'),
    file('d.mp4', 'd.mp4'),
  ]
  expect(buildMediaPlaylist(nodes).map((n) => n.path)).toEqual(['b.png', 'd.mp4'])
})
