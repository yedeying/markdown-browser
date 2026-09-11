import {
  clampMasonryRecurseDepth,
  DEFAULT_MASONRY_RECURSE_DEPTH,
  MASONRY_RECURSE_DEPTH_MAX,
  MASONRY_RECURSE_DEPTH_MIN,
} from '../shared/masonry-config.js'

export {
  clampMasonryRecurseDepth,
  DEFAULT_MASONRY_RECURSE_DEPTH,
  MASONRY_RECURSE_DEPTH_MAX,
  MASONRY_RECURSE_DEPTH_MIN,
}

/** Parse env / injected value; invalid → default 3. */
export function resolveMasonryRecurseDepth(
  raw: string | number | undefined | null = process.env.VMD_MASONRY_RECURSE_DEPTH,
): number {
  if (raw == null || raw === '') return DEFAULT_MASONRY_RECURSE_DEPTH
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (!Number.isFinite(n)) return DEFAULT_MASONRY_RECURSE_DEPTH
  return clampMasonryRecurseDepth(n)
}
