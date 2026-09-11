import { afterEach, beforeEach, expect, test } from 'bun:test'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { Window } from 'happy-dom'
import type { FileNode } from '../../types.js'
import FileTree from './FileTree.js'

let dom: Window
let container: HTMLElement

beforeEach(() => {
  dom = new Window()
  ;(globalThis as unknown as { window: Window }).window = dom
  ;(globalThis as unknown as { document: Document }).document = dom.document as unknown as Document
  ;(globalThis as unknown as { navigator: Navigator }).navigator = dom.navigator as unknown as Navigator
  ;(globalThis as unknown as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame =
    (callback) => setTimeout(() => callback(Date.now()), 0) as unknown as number
  ;(globalThis as unknown as { cancelAnimationFrame: typeof cancelAnimationFrame }).cancelAnimationFrame =
    (id) => clearTimeout(id)
  ;(globalThis as unknown as { localStorage: Storage }).localStorage =
    dom.localStorage as unknown as Storage
  container = dom.document.createElement('div') as unknown as HTMLElement
  dom.document.body.appendChild(container)
})

afterEach(() => {
  act(() => render(null, container))
  dom.close()
  delete (globalThis as Partial<typeof globalThis>).localStorage
  delete (globalThis as Partial<typeof globalThis>).document
  delete (globalThis as Partial<typeof globalThis>).window
  delete (globalThis as Partial<typeof globalThis>).navigator
  delete (globalThis as Partial<typeof globalThis>).requestAnimationFrame
  delete (globalThis as Partial<typeof globalThis>).cancelAnimationFrame
})

function folder(path: string, children?: FileNode[]): FileNode {
  return { name: path.split('/').pop()!, type: 'folder', path, children }
}

function skeletonCount(): number {
  return container.querySelectorAll('.tree-skeleton-row').length
}

test('expanded folder without children requests a lazy load instead of showing a stuck skeleton', () => {
  const expanded = new Set(['work'])
  const requested: string[] = []

  act(() => render(h(FileTree, {
    nodes: [folder('work')],
    currentPath: null,
    onSelect: () => {},
    onExpand: (path: string) => requested.push(path),
    expanded,
    onToggleFolder: () => {},
  }), container))

  expect(skeletonCount()).toBe(1)
  expect(requested).toEqual(['work'])
})

test('compact chain requests the tail folder, not just the toggled root', () => {
  // work → life → 团队照片：链尾 children 未就绪，骨架屏挂在链尾下
  const chain = folder('work', [folder('work/life', [folder('work/life/团队照片')])])
  const expanded = new Set(['work', 'work/life', 'work/life/团队照片'])
  const requested: string[] = []

  act(() => render(h(FileTree, {
    nodes: [chain],
    currentPath: null,
    onSelect: () => {},
    onExpand: (path: string) => requested.push(path),
    expanded,
    onToggleFolder: () => {},
  }), container))

  expect(requested).toEqual(['work/life/团队照片'])
})

test('children arriving clears the skeleton and stops further requests', () => {
  const requested: string[] = []
  const expanded = new Set(['work'])
  const props = {
    currentPath: null,
    onSelect: () => {},
    onExpand: (path: string) => requested.push(path),
    expanded,
    onToggleFolder: () => {},
  }

  act(() => render(h(FileTree, { ...props, nodes: [folder('work')] }), container))
  expect(skeletonCount()).toBe(1)

  act(() => render(h(FileTree, {
    ...props,
    nodes: [folder('work', [folder('work/a', []), folder('work/b', [])])],
  }), container))

  expect(skeletonCount()).toBe(0)
  expect(requested).toEqual(['work'])
})
