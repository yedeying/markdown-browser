# Media Viewer Shared Toolbar Design

**Date:** 2026-09-10  
**Status:** Approved for implementation planning  
**Approach:** A — shared `MediaToolbar` + local transform state on image stage

---

## 1. Goals & non-goals

### Goals

- One shared toolbar component used by:
  - **Half-pane** `ImageViewer` (tree / deep-link image in content area)
  - **Fullscreen** `MediaLightbox`
- First-ship actions:
  1. **Download**
  2. **Copy relative path** (e.g. `pics/a.jpg`)
  3. **Zoom** (− / fit / +)
  4. **Rotate** (left / right 90°)
  5. **Prev / next** when a media playlist is available
- Lightbox keeps **Close** as chrome (not optional).
- Video in lightbox: download, copy path, prev/next, close — **no** zoom/rotate.

### Non-goals (v1)

- Share from toolbar
- “Open in system / new tab” as a primary control
- Server-side image rewrite (rotation/zoom are client CSS only)
- Pinch-zoom / pan canvas editor
- Applying the same zoom chrome to folder grid/masonry tiles

---

## 2. Surfaces

| Surface | Host | Toolbar |
|---------|------|---------|
| Half-pane image | `ImageViewer` inside `ContentArea` | Overlay/top bar on the image stage |
| Fullscreen media | `MediaLightbox` | Replaces / consolidates existing lightbox toolbar |

ContentArea’s global header download/share may remain; toolbar is the in-viewer control surface so zoom/rotate are next to the image.

---

## 3. Shared `MediaToolbar`

### Layout

- Left: filename (+ `i / n` when playlist length > 1)
- Right: action icon buttons (existing `btn` + icon patterns)

### Actions (visibility)

| Action | Image | Video | Notes |
|--------|-------|-------|-------|
| Download | ✓ | ✓ | Existing `downloadUrl` / download helper |
| Copy relative path | ✓ | ✓ | Clipboard + toast on success/fail |
| Zoom − / fit / + | ✓ | ✗ | Disabled or hidden for video |
| Rotate left / right | ✓ | ✗ | 90° steps |
| Prev / next | ✓ if playlist | ✓ if playlist | Hidden when no playlist or length ≤ 1 |
| Close | Lightbox only | Lightbox only | Esc still closes lightbox |

### Props (conceptual)

```ts
type MediaToolbarProps = {
  name: string
  path: string
  kind: 'image' | 'video'
  index?: number
  count?: number
  onDownload: () => void
  onCopyPath: () => void
  onZoomIn?: () => void
  onZoomOut?: () => void
  onZoomFit?: () => void
  onRotateLeft?: () => void
  onRotateRight?: () => void
  onPrev?: () => void
  onNext?: () => void
  onClose?: () => void
}
```

Exact names may match repo style; zoom/rotate callbacks omitted for video.

---

## 4. Transform state (images only)

- Held by the host stage (`ImageViewer` / lightbox image branch), not the toolbar.
- Fields: `scale: number`, `rotateDeg: number` (multiples of 90).
- Reset when `path` / current media changes.
- Apply via CSS `transform: rotate(${rotateDeg}deg) scale(${scale})` on the `<img>` (or a wrapping stage element).
- **Fit**: reset `scale` to the value that fits the current stage (implementation may use `scale = 1` as “object-fit contain baseline” if the img already contains; if using natural-size layout, compute fit from container vs natural dimensions).
- Zoom steps: discrete factors (e.g. ×1.25 / ÷1.25) with min/max clamps.
- Optional: wheel zoom — pick one behavior in implementation (plain wheel **or** Ctrl/⌘+wheel); document in plan. Prefer Ctrl/⌘+wheel to avoid fighting scrollable parents in half-pane.

Rotation is view-only; download still serves original file bytes.

---

## 5. Half-pane prev/next

- `ImageViewer` accepts optional `playlist: FileNode[]` (or paths) and `onNavigate(path: string)`.
- `ContentArea` (or equivalent) builds playlist from **visible media siblings in the parent folder** when tree/children are available — same notion as lightbox folder playlist helpers where practical.
- If playlist missing or length ≤ 1: hide prev/next.
- Navigating updates selection / `loadFile` like tree navigation (sidebar selection stays coherent).

---

## 6. Lightbox integration

- Refactor existing toolbar markup into `MediaToolbar`.
- Keep overlay click-to-close, Esc, arrow keys, swipe.
- Download remains via download URL / helper (not only `<a download>` if share/mount prefixes need the shared helper).

---

## 7. Testing

- Unit: copy-path handler uses relative path string; zoom/rotate reset on path change (pure helpers if extracted).
- Component / e2e light: lightbox toolbar still has download + close; image viewer exposes toolbar testids; prev/next appear only with multi-item playlist.

---

## 8. Decisions locked

| Topic | Choice |
|-------|--------|
| Scope | Shared toolbar for half-pane + fullscreen (C) |
| Actions | Download, copy relative path, zoom, rotate, prev/next |
| Copy target | Relative path (A) |
| Close | Lightbox chrome kept |
| Share / open externally | Out of v1 |
| Architecture | Shared `MediaToolbar` + host-owned transform (Approach A) |
| Video | No zoom/rotate |
