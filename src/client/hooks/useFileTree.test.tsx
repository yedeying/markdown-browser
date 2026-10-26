import { afterEach, beforeEach, expect, test } from 'bun:test'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { Window } from 'happy-dom'
import type { FileNode } from '../../types.js'
import { useFileTree } from './useFileTree.js'

type Api = ReturnType<typeof useFileTree>

const file = (path: string): FileNode => ({ name: path.split('/').pop()!, type: 'file', path })
const folder = (path: string): FileNode => ({ name: path.split('/').pop()!, type: 'folder', path })

let disk: Record<string, FileNode[]>
let dom: Window
let container: HTMLElement
let api: Api
const realFetch = globalThis.fetch

function Harness() {
  api = useFileTree(false)
  return null
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

const childNames = (path: string): string[] => {
  const find = (nodes: FileNode[]): FileNode | undefined => {
    for (const n of nodes) {
      if (n.path === path) return n
      const hit = n.children && find(n.children)
      if (hit) return hit
    }
  }
  const list = path === '' ? api.tree : find(api.tree)?.children
  return (list ?? []).map((n) => n.name)
}

beforeEach(() => {
  disk = {
    '': [folder('a')],
    a: [folder('a/b')],
    'a/b': [file('a/b/one.md')],
  }
  globalThis.fetch = (async (input: string) => {
    const path = new URL(input, 'http://x').searchParams.get('path') ?? ''
    return new Response(JSON.stringify(disk[path] ?? []), { status: 200 })
  }) as typeof fetch
  dom = new Window()
  ;(globalThis as unknown as { window: Window }).window = dom
  ;(globalThis as unknown as { document: Document }).document = dom.document as unknown as Document
  ;(globalThis as unknown as { localStorage: Storage }).localStorage =
    dom.localStorage as unknown as Storage
  container = dom.document.createElement('div') as unknown as HTMLElement
  dom.document.body.appendChild(container)
})

afterEach(() => {
  act(() => render(null, container))
  dom.close()
  globalThis.fetch = realFetch
  delete (globalThis as Partial<typeof globalThis>).document
  delete (globalThis as Partial<typeof globalThis>).window
  delete (globalThis as Partial<typeof globalThis>).localStorage
})

test('tree-change in a child dir does not stop later changes in its ancestors from refreshing', async () => {
  await act(async () => { render(h(Harness, {}), container) })
  await flush()
  await act(async () => { await api.loadChildren('a') })
  await act(async () => { await api.loadChildren('a/b') })

  disk['a/b'] = [...disk['a/b'], file('a/b/two.md')]
  await act(async () => { await api.refresh('a/b') })
  expect(childNames('a/b')).toEqual(['one.md', 'two.md'])

  disk.a = [...disk.a, file('a/parent-new.md')]
  await act(async () => { await api.refresh('a') })
  expect(childNames('a')).toEqual(['b', 'parent-new.md'])

  disk[''] = [...disk[''], file('root-new.md')]
  await act(async () => { await api.refresh('') })
  expect(childNames('')).toEqual(['a', 'root-new.md'])
})

test('tree-change while the first load of that dir is in flight refetches it', async () => {
  await act(async () => { render(h(Harness, {}), container) })
  await flush()
  await act(async () => { await api.loadChildren('a') })

  let release!: () => void
  const gate = new Promise<void>((r) => { release = r })
  const baseFetch = globalThis.fetch
  globalThis.fetch = (async (input: string) => {
    const res = await baseFetch(input)
    if (input.includes('path=a%2Fb')) await gate
    return res
  }) as typeof fetch

  let firstLoad!: Promise<void>
  await act(async () => { firstLoad = api.loadChildren('a/b') as Promise<void> })
  disk['a/b'] = [...disk['a/b'], file('a/b/two.md')]
  let refreshDone!: Promise<void>
  await act(async () => { refreshDone = api.refresh('a/b') })
  globalThis.fetch = baseFetch
  release()
  await act(async () => { await firstLoad; await refreshDone })
  expect(childNames('a/b')).toEqual(['one.md', 'two.md'])
})
