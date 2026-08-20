import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  applyAppearancePrefs,
  getAccentTokens,
  resolveTheme,
} from './appearance.js'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

function createRoot() {
  const attributes = new Map<string, string>()
  const properties = new Map<string, string>()
  return {
    attributes,
    properties,
    root: {
      setAttribute(name: string, value: string) {
        attributes.set(name, value)
      },
      style: {
        setProperty(name: string, value: string) {
          properties.set(name, value)
        },
      },
    } as unknown as HTMLElement,
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: new MemoryStorage(),
  })
})

afterEach(() => {
  delete (globalThis as Partial<typeof globalThis>).localStorage
})

describe('resolveTheme', () => {
  test('resolves system from the current color-scheme preference', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  test('keeps an explicitly selected theme', () => {
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })
})

describe('getAccentTokens', () => {
  test('returns theme-specific tokens for all six presets', () => {
    const expected = {
      orange: ['#ff7b47', '#f54e00'],
      blue: ['#58a6ff', '#0969da'],
      cyan: ['#39c5cf', '#0e7490'],
      green: ['#3fb950', '#1a7f37'],
      purple: ['#a371f7', '#8250df'],
      rose: ['#f778ba', '#bf3989'],
    } as const

    for (const [preset, [dark, light]] of Object.entries(expected)) {
      expect(getAccentTokens(preset as keyof typeof expected, 'dark').accent).toBe(dark)
      expect(getAccentTokens(preset as keyof typeof expected, 'light').accent).toBe(light)
    }
  })

  test('validates custom colors and darkens them for light theme', () => {
    expect(getAccentTokens('custom', 'dark', '#336699').accent).toBe('#336699')
    expect(getAccentTokens('custom', 'light', '#336699').accent).toBe('#2b5782')
    expect(getAccentTokens('custom', 'light', 'not-a-color').accent).toBe('#f54e00')
  })

  test('selects readable text from accent luminance', () => {
    expect(getAccentTokens('custom', 'dark', '#ffee55').onAccent).toBe('#1f2328')
    expect(getAccentTokens('custom', 'dark', '#112233').onAccent).toBe('#ffffff')
  })

  test('chooses white when it has better contrast for a boundary accent', () => {
    expect(getAccentTokens('custom', 'dark', '#767676').onAccent).toBe('#ffffff')
  })
})

test('applyAppearancePrefs maps stored appearance values to root CSS variables', () => {
  localStorage.setItem('vmd_theme', 'system')
  localStorage.setItem('vmd_accent', 'purple')
  localStorage.setItem('vmd_reading_width', '1140')
  localStorage.setItem('vmd_reading_font_size', '17')
  localStorage.setItem('vmd_reading_line_height', '1.9')
  localStorage.setItem('vmd_editor_font_size', '15')
  const { root, attributes, properties } = createRoot()

  const appearance = applyAppearancePrefs(root, true)

  expect(appearance).toEqual({ selectedTheme: 'system', resolvedTheme: 'dark' })
  expect(attributes.get('data-theme')).toBe('dark')
  expect(properties.get('--accent')).toBe('#a371f7')
  expect(properties.get('--accent-active')).toBe('#8b60d2')
  expect(properties.get('--on-accent')).toBe('#1f2328')
  expect(properties.get('--reading-width')).toBe('1140px')
  expect(properties.get('--reading-font-size')).toBe('17px')
  expect(properties.get('--reading-line-height')).toBe('1.9')
  expect(properties.get('--editor-font-size')).toBe('15px')
})

test('applyAppearancePrefs maps unlimited reading width to none', () => {
  localStorage.setItem('vmd_reading_width', 'full')
  const { root, properties } = createRoot()

  applyAppearancePrefs(root, false)

  expect(properties.get('--reading-width')).toBe('none')
})
