/** 浏览器端性能日志。默认开启；localStorage.vmd_debug_perf='0' 可关。 */
export function clientPerfEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return false
    const q = new URLSearchParams(window.location.search).get('vmd_perf')
    if (q === '0') return false
    if (q === '1') return true
    const stored = localStorage.getItem('vmd_debug_perf')
    if (stored === '0') return false
    // 默认开：排查深链卡顿；不需要时设 localStorage.vmd_debug_perf='0'
    return true
  } catch {
    return true
  }
}

export function clientPerfLog(tag: string, detail: Record<string, unknown> = {}) {
  if (!clientPerfEnabled()) return
  const parts = Object.entries(detail)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? JSON.stringify(v) : String(v)}`)
    .join(' ')
  console.log(`[vmd:perf] ${tag} ${parts}`)
}

export function clientPerfTimed(tag: string, ms: number, detail: Record<string, unknown> = {}) {
  // 慢请求即使未开 debug 也打，方便排查卡顿
  if (!clientPerfEnabled() && ms < 80) return
  const parts = Object.entries({ ms: Math.round(ms), ...detail })
    .map(([k, v]) => `${k}=${typeof v === 'string' ? JSON.stringify(v) : String(v)}`)
    .join(' ')
  console.log(`[vmd:perf] ${tag} ${parts}`)
}
