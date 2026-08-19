// 记录每个文件的预览滚动位置，用于 SSE 静默重载后恢复阅读位置。
// 使用 sessionStorage：仅在当前标签页生命周期内有效，刷新页面后仍保留，关闭标签页后清空。
const prefix = 'vmd_scroll:'

export function getScroll(path: string): number | null {
  try {
    const v = sessionStorage.getItem(prefix + path)
    if (v == null) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export function setScroll(path: string, top: number): void {
  try {
    sessionStorage.setItem(prefix + path, String(top))
  } catch {}
}
