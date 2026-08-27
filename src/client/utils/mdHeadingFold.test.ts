import { test, expect, beforeEach } from 'bun:test'
import { Window } from 'happy-dom'
import {
  wrapMarkdownHeadingFolds,
  getCollapsedHeadingIds,
  setCollapsedHeadingIds,
  applyCollapsedHeadingIds,
  toggleHeadingFold,
  expandHeadingAncestors,
  findElementByDomId,
  FOLD_STORAGE_PREFIX,
} from './mdHeadingFold.ts'

function freshDoc() {
  const window = new Window()
  const document = window.document
  return { window, document }
}

beforeEach(() => {
  const store = new Map<string, string>()
  ;(globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    setItem: (k, v) => { store.set(k, v) },
    removeItem: (k) => { store.delete(k) },
    clear: () => { store.clear() },
    get length() { return store.size },
    key: (i) => [...store.keys()][i] ?? null,
  }
})

test('wrapMarkdownHeadingFolds nests lower headings inside higher section body', () => {
  const { document } = freshDoc()
  const root = document.createElement('div')
  root.innerHTML = [
    '<h2 id="a">A</h2>',
    '<p>a-body</p>',
    '<h3 id="a1">A1</h3>',
    '<p>a1-body</p>',
    '<h2 id="b">B</h2>',
    '<p>b-body</p>',
  ].join('')

  wrapMarkdownHeadingFolds(root as unknown as HTMLElement)

  const folds = root.querySelectorAll(':scope > .md-fold')
  expect(folds.length).toBe(2)
  expect(folds[0].getAttribute('data-heading-id')).toBe('a')
  expect(folds[0].querySelector('.md-fold-body .md-fold')?.getAttribute('data-heading-id')).toBe('a1')
  expect(folds[1].getAttribute('data-heading-id')).toBe('b')
  expect(folds[0].querySelector('h2')?.id).toBe('a')
  expect(folds[0].querySelector('h2 .md-fold-toggle')?.getAttribute('aria-expanded')).toBe('true')
  // 按钮在标题内，不污染可见标题文案（仅 aria-label）
  expect(folds[0].querySelector('h2')?.textContent?.replace(/\s+/g, '')).toBe('A')
})

test('wrapMarkdownHeadingFolds is idempotent', () => {
  const { document } = freshDoc()
  const root = document.createElement('div')
  root.innerHTML = '<h2 id="x">X</h2><p>y</p>'
  wrapMarkdownHeadingFolds(root as unknown as HTMLElement)
  wrapMarkdownHeadingFolds(root as unknown as HTMLElement)
  expect(root.querySelectorAll('.md-fold').length).toBe(1)
})

test('sessionStorage save/load collapsed ids by filePath', () => {
  expect(getCollapsedHeadingIds('notes/a.md')).toEqual(new Set())
  setCollapsedHeadingIds('notes/a.md', new Set(['h1', 'h2']))
  expect([...getCollapsedHeadingIds('notes/a.md')].sort()).toEqual(['h1', 'h2'])
  expect(sessionStorage.getItem(`${FOLD_STORAGE_PREFIX}notes/a.md`)).toContain('h1')
  setCollapsedHeadingIds('', new Set(['x']))
  expect(sessionStorage.getItem(`${FOLD_STORAGE_PREFIX}`)).toBeNull()
})

test('applyCollapsedHeadingIds and toggleHeadingFold update class and storage', () => {
  const { document } = freshDoc()
  const root = document.createElement('div')
  root.innerHTML = '<h2 id="sec">Sec</h2><p>body</p>'
  wrapMarkdownHeadingFolds(root as unknown as HTMLElement)
  applyCollapsedHeadingIds(root as unknown as HTMLElement, new Set(['sec']))
  const section = root.querySelector('.md-fold')!
  expect(section.classList.contains('md-fold--collapsed')).toBe(true)
  expect(section.querySelector('.md-fold-toggle')?.getAttribute('aria-expanded')).toBe('false')

  toggleHeadingFold(section as unknown as HTMLElement, 'notes/a.md')
  expect(section.classList.contains('md-fold--collapsed')).toBe(false)
  expect(getCollapsedHeadingIds('notes/a.md').has('sec')).toBe(false)

  toggleHeadingFold(section as unknown as HTMLElement, 'notes/a.md')
  expect(section.classList.contains('md-fold--collapsed')).toBe(true)
  expect(getCollapsedHeadingIds('notes/a.md').has('sec')).toBe(true)
})

test('expandHeadingAncestors opens collapsed parents of a heading id', () => {
  const { document } = freshDoc()
  const root = document.createElement('div')
  root.innerHTML = [
    '<h2 id="a">A</h2>',
    '<h3 id="a1">A1</h3>',
    '<p>x</p>',
  ].join('')
  wrapMarkdownHeadingFolds(root as unknown as HTMLElement)
  applyCollapsedHeadingIds(root as unknown as HTMLElement, new Set(['a', 'a1']))
  expandHeadingAncestors(root as unknown as HTMLElement, 'a1')
  expect(root.querySelector('[data-heading-id="a"]')?.classList.contains('md-fold--collapsed')).toBe(false)
  expect(root.querySelector('[data-heading-id="a1"]')?.classList.contains('md-fold--collapsed')).toBe(false)
})

test('findElementByDomId supports ids that start with a digit', () => {
  const { document } = freshDoc()
  const root = document.createElement('div')
  root.innerHTML = '<h2 id="1-过敏与消化-最高优先级">T</h2>'
  const hit = findElementByDomId(root as unknown as ParentNode, '1-过敏与消化-最高优先级')
  expect(hit?.tagName).toBe('H2')
})
