/** Shared masonry recurse defaults (no Node env — safe for client bundle). */

export const DEFAULT_MASONRY_RECURSE_DEPTH = 3
export const MASONRY_RECURSE_DEPTH_MIN = 1
export const MASONRY_RECURSE_DEPTH_MAX = 10

export function clampMasonryRecurseDepth(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_MASONRY_RECURSE_DEPTH
  return Math.min(
    MASONRY_RECURSE_DEPTH_MAX,
    Math.max(MASONRY_RECURSE_DEPTH_MIN, Math.round(n)),
  )
}
