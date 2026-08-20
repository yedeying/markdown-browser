import { test, expect, beforeEach } from 'bun:test'
import {
  getPref,
  setPref,
  subscribePref,
  resetLocalPrefs,
  getSidebarWidth,
  setSidebarWidth,
  getSort,
  setSort,
  getShowHidden,
  setShowHidden,
  SIDEBAR_WIDTH_DEFAULT,
  type PrefKey,
} from './prefs.ts'

class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  clear(): void {
    this.store.clear()
  }
  get length(): number {
    return this.store.size
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null
  }
}

beforeEach(() => {
  ;(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage()
})

const ALL_KEYS: PrefKey[] = [
  'theme',
  'accent',
  'accentCustom',
  'readingWidth',
  'readingFontSize',
  'readingLineHeight',
  'folderView',
  'sort',
  'showHidden',
  'editorFontSize',
  'sidebarWidth',
]

test('getPref returns typed defaults when storage is empty', () => {
  expect(getPref('theme')).toBe('dark')
  expect(getPref('accent')).toBe('orange')
  expect(getPref('readingWidth')).toBe(900)
  expect(getPref('readingFontSize')).toBe(16)
  expect(getPref('readingLineHeight')).toBe(1.7)
  expect(getPref('folderView')).toBe('list')
  expect(getPref('sort')).toEqual({ field: 'name', order: 'asc' })
  expect(getPref('showHidden')).toBe(false)
  expect(getPref('editorFontSize')).toBe(14)
  expect(getPref('sidebarWidth')).toBe(SIDEBAR_WIDTH_DEFAULT)
})

test('getPref validates stored values and falls back to defaults', () => {
  localStorage.setItem('vmd_theme', 'invalid')
  localStorage.setItem('vmd_accent', 'not-a-preset')
  localStorage.setItem('vmd_reading_width', '999')
  localStorage.setItem('vmd_reading_font_size', '12')
  localStorage.setItem('vmd_reading_line_height', '2.5')
  localStorage.setItem('vmd_folder_view_mode', 'table')
  localStorage.setItem('vmd_sort', '{not json')
  localStorage.setItem('vmd_show_hidden', 'yes')
  localStorage.setItem('vmd_editor_font_size', '20')
  localStorage.setItem('vmd_sidebar_width', '-5')

  expect(getPref('theme')).toBe('dark')
  expect(getPref('accent')).toBe('orange')
  expect(getPref('readingWidth')).toBe(900)
  expect(getPref('readingFontSize')).toBe(16)
  expect(getPref('readingLineHeight')).toBe(1.7)
  expect(getPref('folderView')).toBe('list')
  expect(getPref('sort')).toEqual({ field: 'name', order: 'asc' })
  expect(getPref('showHidden')).toBe(false)
  expect(getPref('editorFontSize')).toBe(14)
  expect(getPref('sidebarWidth')).toBe(SIDEBAR_WIDTH_DEFAULT)
})

test('setPref persists values readable by getPref', () => {
  setPref('theme', 'system')
  setPref('accent', 'blue')
  setPref('accentCustom', '#336699')
  setPref('readingWidth', 1140)
  setPref('readingFontSize', 17)
  setPref('readingLineHeight', 1.55)
  setPref('folderView', 'grid')
  setPref('sort', { field: 'size', order: 'desc' })
  setPref('showHidden', true)
  setPref('editorFontSize', 15)
  setPref('sidebarWidth', 320)

  expect(getPref('theme')).toBe('system')
  expect(getPref('accent')).toBe('blue')
  expect(getPref('accentCustom')).toBe('#336699')
  expect(getPref('readingWidth')).toBe(1140)
  expect(getPref('readingFontSize')).toBe(17)
  expect(getPref('readingLineHeight')).toBe(1.55)
  expect(getPref('folderView')).toBe('grid')
  expect(getPref('sort')).toEqual({ field: 'size', order: 'desc' })
  expect(getPref('showHidden')).toBe(true)
  expect(getPref('editorFontSize')).toBe(15)
  expect(getPref('sidebarWidth')).toBe(320)
})

test('subscribePref notifies listeners after successful writes for the same key', () => {
  const seen: boolean[] = []
  subscribePref('showHidden', (value) => {
    seen.push(value)
  })

  setPref('showHidden', true)
  setPref('showHidden', false)

  expect(seen).toEqual([true, false])
})

test('subscribePref does not notify listeners for other keys', () => {
  let calls = 0
  subscribePref('theme', () => {
    calls += 1
  })

  setPref('accent', 'green')
  expect(calls).toBe(0)
})

test('subscribePref unsubscribe stops notifications', () => {
  let calls = 0
  const unsubscribe = subscribePref('theme', () => {
    calls += 1
  })

  setPref('theme', 'light')
  unsubscribe()
  setPref('theme', 'dark')

  expect(calls).toBe(1)
})

test('resetLocalPrefs deletes only vmd_* localStorage keys', () => {
  for (const key of ALL_KEYS) {
    setPref(key, getPref(key))
  }
  localStorage.setItem('other_app_key', 'keep')
  localStorage.setItem('vmd_theme', 'light')

  resetLocalPrefs()

  expect(localStorage.getItem('other_app_key')).toBe('keep')
  expect(localStorage.getItem('vmd_theme')).toBeNull()
  expect(localStorage.getItem('vmd_sort')).toBeNull()
  expect(getPref('theme')).toBe('dark')
})

test('legacy wrapper functions stay compatible with the typed store', () => {
  setSidebarWidth(360)
  setSort({ field: 'type', order: 'desc' })
  setShowHidden(true)

  expect(getSidebarWidth()).toBe(360)
  expect(getSort()).toEqual({ field: 'type', order: 'desc' })
  expect(getShowHidden()).toBe(true)
  expect(getPref('sidebarWidth')).toBe(360)
  expect(getPref('sort')).toEqual({ field: 'type', order: 'desc' })
  expect(getPref('showHidden')).toBe(true)
})
