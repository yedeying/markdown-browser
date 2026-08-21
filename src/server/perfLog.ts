/** 性能诊断日志。设置 VMD_DEBUG_PERF=1 开启（默认开启慢请求 >80ms 也会打）。 */
const FORCE = process.env.VMD_DEBUG_PERF === '1' || process.env.VMD_DEBUG_PERF === 'true'
const SLOW_MS = Number(process.env.VMD_DEBUG_PERF_MS || 80)

export function perfEnabled(): boolean {
  return FORCE || process.env.VMD_DEBUG_PERF !== '0'
}

export function perfLog(tag: string, detail: Record<string, unknown>) {
  if (!FORCE && process.env.VMD_DEBUG_PERF === '0') return
  // 未显式关闭时：详细日志仅 FORCE；慢日志走 perfLogTimed
  if (!FORCE) return
  const parts = Object.entries(detail)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? JSON.stringify(v) : String(v)}`)
    .join(' ')
  console.log(`[vmd:perf] ${tag} ${parts}`)
}

/** 始终记录慢操作；VMD_DEBUG_PERF=1 时全部记录 */
export function perfLogTimed(tag: string, ms: number, detail: Record<string, unknown> = {}) {
  if (!FORCE && ms < SLOW_MS) return
  const parts = Object.entries({ ms: Math.round(ms), ...detail, slow: ms >= SLOW_MS })
    .map(([k, v]) => `${k}=${typeof v === 'string' ? JSON.stringify(v) : String(v)}`)
    .join(' ')
  console.log(`[vmd:perf] ${tag} ${parts}`)
}

export function nowMs(): number {
  return performance.now()
}
