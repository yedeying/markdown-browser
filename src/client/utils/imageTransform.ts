export const ZOOM_FACTOR = 1.25
export const MIN_SCALE = 0.25
export const MAX_SCALE = 8

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

export function zoomIn(scale: number): number {
  return clampScale(scale * ZOOM_FACTOR)
}

export function zoomOut(scale: number): number {
  return clampScale(scale / ZOOM_FACTOR)
}

export function rotateLeft(deg: number): number {
  return deg - 90
}

export function rotateRight(deg: number): number {
  return deg + 90
}

export function fitScale(): number {
  return 1
}

export function resetTransform(): { scale: number; rotateDeg: number } {
  return { scale: 1, rotateDeg: 0 }
}
