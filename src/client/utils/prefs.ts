// 侧边栏宽度 / 排序方式 / 隐藏文件显隐 —— 三项用户偏好的读写封装（localStorage）。
// 扩展为类型化偏好存储，供设置对话框与同页组件订阅同步。

const SIDEBAR_WIDTH_KEY = 'vmd_sidebar_width'
const SORT_KEY = 'vmd_sort'
const SHOW_HIDDEN_KEY = 'vmd_show_hidden'

export const SIDEBAR_WIDTH_MIN = 200
export const SIDEBAR_WIDTH_MAX = 480
export const SIDEBAR_WIDTH_DEFAULT = 280

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, width))
}

// ── 排序偏好 ──────────────────────────────────────────────
// 注意：FileNode 目前只有 size（无 mtime），因此只支持这三个排序字段。
export type SortField = 'name' | 'type' | 'size'
export type SortOrder = 'asc' | 'desc'

export interface SortPref {
  field: SortField
  order: SortOrder
}

const SORT_FIELDS: SortField[] = ['name', 'type', 'size']
const DEFAULT_SORT: SortPref = { field: 'name', order: 'asc' }

// ── 类型化偏好 ────────────────────────────────────────────

export type ThemePref = 'dark' | 'light' | 'system'
export type AccentPref = 'orange' | 'blue' | 'cyan' | 'green' | 'purple' | 'rose' | 'custom'
export type ReadingWidthPref = 720 | 900 | 1140 | 'full'
export type ReadingFontSizePref = 14 | 15 | 16 | 17
export type ReadingLineHeightPref = 1.55 | 1.7 | 1.9
export type FolderViewPref = 'list' | 'grid' | 'column'
export type EditorFontSizePref = 13 | 14 | 15

export interface PrefValues {
  theme: ThemePref
  accent: AccentPref
  accentCustom: string
  readingWidth: ReadingWidthPref
  readingFontSize: ReadingFontSizePref
  readingLineHeight: ReadingLineHeightPref
  folderView: FolderViewPref
  sort: SortPref
  showHidden: boolean
  editorFontSize: EditorFontSizePref
  sidebarWidth: number
}

export type PrefKey = keyof PrefValues

const STORAGE_KEYS: Record<PrefKey, string> = {
  theme: 'vmd_theme',
  accent: 'vmd_accent',
  accentCustom: 'vmd_accent_custom',
  readingWidth: 'vmd_reading_width',
  readingFontSize: 'vmd_reading_font_size',
  readingLineHeight: 'vmd_reading_line_height',
  folderView: 'vmd_folder_view_mode',
  sort: SORT_KEY,
  showHidden: SHOW_HIDDEN_KEY,
  editorFontSize: 'vmd_editor_font_size',
  sidebarWidth: SIDEBAR_WIDTH_KEY,
}

const THEME_PREFS: ThemePref[] = ['dark', 'light', 'system']
const ACCENT_PREFS: AccentPref[] = ['orange', 'blue', 'cyan', 'green', 'purple', 'rose', 'custom']
const READING_WIDTHS: ReadingWidthPref[] = [720, 900, 1140, 'full']
const READING_FONT_SIZES: ReadingFontSizePref[] = [14, 15, 16, 17]
const READING_LINE_HEIGHTS: ReadingLineHeightPref[] = [1.55, 1.7, 1.9]
const FOLDER_VIEWS: FolderViewPref[] = ['list', 'grid', 'column']
const EDITOR_FONT_SIZES: EditorFontSizePref[] = [13, 14, 15]

const DEFAULTS: PrefValues = {
  theme: 'dark',
  accent: 'orange',
  accentCustom: '#ff7b47',
  readingWidth: 900,
  readingFontSize: 16,
  readingLineHeight: 1.7,
  folderView: 'list',
  sort: { ...DEFAULT_SORT },
  showHidden: false,
  editorFontSize: 14,
  sidebarWidth: SIDEBAR_WIDTH_DEFAULT,
}

type PrefListener<K extends PrefKey> = (value: PrefValues[K]) => void

const listeners = new Map<PrefKey, Set<PrefListener<PrefKey>>>()

function readRaw(key: PrefKey): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS[key])
  } catch {
    return null
  }
}

function writeRaw(key: PrefKey, value: string): boolean {
  try {
    localStorage.setItem(STORAGE_KEYS[key], value)
    return true
  } catch {
    return false
  }
}

function parseSort(raw: string | null): SortPref {
  if (!raw) return { ...DEFAULT_SORT }
  try {
    const parsed = JSON.parse(raw) as Partial<SortPref>
    const field: SortField = SORT_FIELDS.includes(parsed?.field as SortField)
      ? (parsed.field as SortField)
      : DEFAULT_SORT.field
    const order: SortOrder = parsed?.order === 'desc' ? 'desc' : 'asc'
    return { field, order }
  } catch {
    return { ...DEFAULT_SORT }
  }
}

function parsePref<K extends PrefKey>(key: K, raw: string | null): PrefValues[K] {
  switch (key) {
    case 'theme':
      return (THEME_PREFS.includes(raw as ThemePref) ? raw : DEFAULTS.theme) as PrefValues[K]
    case 'accent':
      return (ACCENT_PREFS.includes(raw as AccentPref) ? raw : DEFAULTS.accent) as PrefValues[K]
    case 'accentCustom':
      return (raw && /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : DEFAULTS.accentCustom) as PrefValues[K]
    case 'readingWidth': {
      if (raw === 'full') return 'full' as PrefValues[K]
      const n = Number(raw)
      return (READING_WIDTHS.includes(n as ReadingWidthPref) ? n : DEFAULTS.readingWidth) as PrefValues[K]
    }
    case 'readingFontSize': {
      const n = Number(raw)
      return (READING_FONT_SIZES.includes(n as ReadingFontSizePref)
        ? n
        : DEFAULTS.readingFontSize) as PrefValues[K]
    }
    case 'readingLineHeight': {
      const n = Number(raw)
      return (READING_LINE_HEIGHTS.includes(n as ReadingLineHeightPref)
        ? n
        : DEFAULTS.readingLineHeight) as PrefValues[K]
    }
    case 'folderView':
      return (FOLDER_VIEWS.includes(raw as FolderViewPref) ? raw : DEFAULTS.folderView) as PrefValues[K]
    case 'sort':
      return parseSort(raw) as PrefValues[K]
    case 'showHidden':
      return (raw === '1') as PrefValues[K]
    case 'editorFontSize': {
      const n = Number(raw)
      return (EDITOR_FONT_SIZES.includes(n as EditorFontSizePref)
        ? n
        : DEFAULTS.editorFontSize) as PrefValues[K]
    }
    case 'sidebarWidth': {
      const n = Number(raw)
      return (Number.isFinite(n) && n > 0 ? clampSidebarWidth(n) : DEFAULTS.sidebarWidth) as PrefValues[K]
    }
    default:
      return DEFAULTS[key]
  }
}

function serializePref<K extends PrefKey>(key: K, value: PrefValues[K]): string {
  switch (key) {
    case 'sort':
      return JSON.stringify(value)
    case 'showHidden':
      return value ? '1' : '0'
    case 'readingWidth':
      return String(value)
    default:
      return String(value)
  }
}

export function getPref<K extends PrefKey>(key: K): PrefValues[K] {
  return parsePref(key, readRaw(key))
}

export function setPref<K extends PrefKey>(key: K, value: PrefValues[K]): void {
  let normalized = value
  if (key === 'sidebarWidth') {
    normalized = clampSidebarWidth(value as number) as PrefValues[K]
  }
  if (key === 'sort') {
    normalized = parseSort(JSON.stringify(value)) as PrefValues[K]
  }

  const ok = writeRaw(key, serializePref(key, normalized))
  if (!ok) return

  const keyListeners = listeners.get(key)
  if (keyListeners) {
    for (const listener of keyListeners) {
      listener(normalized)
    }
  }
}

export function subscribePref<K extends PrefKey>(
  key: K,
  listener: PrefListener<K>,
): () => void {
  let set = listeners.get(key)
  if (!set) {
    set = new Set()
    listeners.set(key, set)
  }
  set.add(listener as PrefListener<PrefKey>)
  return () => {
    set!.delete(listener as PrefListener<PrefKey>)
    if (set!.size === 0) listeners.delete(key)
  }
}

export function resetLocalPrefs(): void {
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i)
      if (storageKey?.startsWith('vmd_')) keysToRemove.push(storageKey)
    }
    for (const storageKey of keysToRemove) {
      localStorage.removeItem(storageKey)
    }
  } catch {}
}

// ── 兼容封装（sidebar / sort / hidden files）──────────────

export function getSidebarWidth(): number {
  return getPref('sidebarWidth')
}

/** 写入前会先 clamp 到 [200, 480]，返回实际写入的值。 */
export function setSidebarWidth(width: number): number {
  const clamped = clampSidebarWidth(width)
  setPref('sidebarWidth', clamped)
  return clamped
}

export function getSort(): SortPref {
  return getPref('sort')
}

export function setSort(pref: SortPref): void {
  setPref('sort', pref)
}

// 默认隐藏点文件（'0'/未设置 = 隐藏，'1' = 显示）。
export function getShowHidden(): boolean {
  return getPref('showHidden')
}

export function setShowHidden(show: boolean): void {
  setPref('showHidden', show)
}
