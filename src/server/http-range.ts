/** Parse `Range: bytes=START-END` for single-range video/asset responses. */
export function parseBytesRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | null {
  if (!header || size <= 0) return null
  const m = /^bytes=(\d*)-(\d*)$/i.exec(header.trim())
  if (!m) return null
  const startRaw = m[1]
  const endRaw = m[2]
  let start: number
  let end: number
  if (startRaw === '' && endRaw === '') return null
  if (startRaw === '') {
    // bytes=-N → last N bytes
    const suffix = Number(endRaw)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(startRaw)
    end = endRaw === '' ? size - 1 : Number(endRaw)
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  if (start < 0 || end < start || start >= size) return null
  end = Math.min(end, size - 1)
  return { start, end }
}
