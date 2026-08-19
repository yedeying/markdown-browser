// 侧边栏宽度 / 排序方式 / 隐藏文件显隐 —— 三项用户偏好的读写封装（localStorage）。

const SIDEBAR_WIDTH_KEY = 'vmd_sidebar_width'
const SORT_KEY = 'vmd_sort'
const SHOW_HIDDEN_KEY = 'vmd_show_hidden'

export const SIDEBAR_WIDTH_MIN = 200
export const SIDEBAR_WIDTH_MAX = 480
export const SIDEBAR_WIDTH_DEFAULT = 280

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, width))
}

export function getSidebarWidth(): number {
  try {
    const v = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY))
    return Number.isFinite(v) && v > 0 ? clampSidebarWidth(v) : SIDEBAR_WIDTH_DEFAULT
  } catch {
    return SIDEBAR_WIDTH_DEFAULT
  }
}

/** 写入前会先 clamp 到 [200, 480]，返回实际写入的值。 */
export function setSidebarWidth(width: number): number {
  const clamped = clampSidebarWidth(width)
  try {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clamped))
  } catch {}
  return clamped
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

export function getSort(): SortPref {
  try {
    const raw = localStorage.getItem(SORT_KEY)
    if (!raw) return { ...DEFAULT_SORT }
    const parsed = JSON.parse(raw) as Partial<SortPref>
    const field: SortField = SORT_FIELDS.includes(parsed?.field as SortField) ? (parsed.field as SortField) : DEFAULT_SORT.field
    const order: SortOrder = parsed?.order === 'desc' ? 'desc' : 'asc'
    return { field, order }
  } catch {
    return { ...DEFAULT_SORT }
  }
}

export function setSort(pref: SortPref): void {
  try {
    localStorage.setItem(SORT_KEY, JSON.stringify(pref))
  } catch {}
}

// ── 隐藏文件显隐 ──────────────────────────────────────────
// 默认隐藏点文件（'0'/未设置 = 隐藏，'1' = 显示）。
export function getShowHidden(): boolean {
  try {
    return localStorage.getItem(SHOW_HIDDEN_KEY) === '1'
  } catch {
    return false
  }
}

export function setShowHidden(show: boolean): void {
  try {
    localStorage.setItem(SHOW_HIDDEN_KEY, show ? '1' : '0')
  } catch {}
}
