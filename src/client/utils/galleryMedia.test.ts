import { test, expect } from 'bun:test'
import type { FileNode } from '../../types.js'
import {
  buildMediaPlaylist,
  filterMasonryNodes,
  folderHasMedia,
  isMediaFile,
  mediaPlaylistForPath,
  stepPlaylistPath,
} from './galleryMedia.ts'

function folder(name: string, path: string, children: FileNode[] = []): FileNode {
  return { name, type: 'folder', path, children }
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

test('heic counts as media for masonry', () => {
  const nodes = [
    { name: 'a.heic', type: 'file' as const, path: 'a.heic' },
  ]
  expect(folderHasMedia(nodes)).toBe(true)
  expect(filterMasonryNodes(nodes).map((n) => n.path)).toEqual(['a.heic'])
})

const siblingTree: FileNode[] = [
  file('a.png', 'a.png'),
  file('b.md', 'b.md'),
  file('c.jpg', 'c.jpg'),
  folder('photos', 'photos', [
    file('x.png', 'photos/x.png'),
    file('.hidden.png', 'photos/.hidden.png'),
    file('y.mp4', 'photos/y.mp4'),
    file('note.md', 'photos/note.md'),
  ]),
]

test('mediaPlaylistForPath returns root media siblings in order', () => {
  expect(mediaPlaylistForPath('c.jpg', siblingTree, false).map((n) => n.path)).toEqual([
    'a.png',
    'c.jpg',
  ])
})

test('mediaPlaylistForPath filters hidden siblings when showHidden is false', () => {
  expect(mediaPlaylistForPath('photos/x.png', siblingTree, false).map((n) => n.path)).toEqual([
    'photos/x.png',
    'photos/y.mp4',
  ])
})

test('mediaPlaylistForPath includes hidden siblings when showHidden is true', () => {
  expect(mediaPlaylistForPath('photos/x.png', siblingTree, true).map((n) => n.path)).toEqual([
    'photos/x.png',
    'photos/.hidden.png',
    'photos/y.mp4',
  ])
})

test('mediaPlaylistForPath returns empty when tree or parent is unknown', () => {
  expect(mediaPlaylistForPath('photos/x.png', undefined, false)).toEqual([])
  expect(mediaPlaylistForPath('missing/x.png', siblingTree, false)).toEqual([])
  expect(mediaPlaylistForPath('', siblingTree, false)).toEqual([])
})

test('stepPlaylistPath steps within playlist bounds', () => {
  const playlist = [
    file('a.png', 'a.png'),
    file('b.png', 'b.png'),
    file('c.png', 'c.png'),
  ]
  expect(stepPlaylistPath(playlist, 'b.png', -1)).toBe('a.png')
  expect(stepPlaylistPath(playlist, 'b.png', 1)).toBe('c.png')
  expect(stepPlaylistPath(playlist, 'a.png', -1)).toBeNull()
  expect(stepPlaylistPath(playlist, 'c.png', 1)).toBeNull()
  expect(stepPlaylistPath(playlist, 'missing.png', 1)).toBeNull()
  expect(stepPlaylistPath([], 'a.png', 1)).toBeNull()
})
