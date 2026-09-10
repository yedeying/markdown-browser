# Media Viewer Shared Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shared `MediaToolbar` for half-pane `ImageViewer` and fullscreen `MediaLightbox` with download, copy relative path, zoom, rotate, and prev/next when a playlist exists.

**Architecture:** Presentational `MediaToolbar` + pure `imageTransform` helpers; hosts own `scale`/`rotateDeg` and apply CSS transform on the image stage. `ContentArea` injects sibling media playlist into `ImageViewer` for ←→. Lightbox refactors its existing toolbar into the shared component.

**Tech Stack:** Preact 10, existing `Icon` / `downloadSingleFile` / `showToast` / `galleryMedia`, bun:test, `bun run build`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-10-media-toolbar-design.md`
- Actions: download, copy **relative path**, zoom (−/fit/+), rotate ±90°, prev/next if playlist; Lightbox keeps Close
- Video: download / copy / prev/next / close only — no zoom/rotate
- Transform is client CSS only; download serves original bytes
- Wheel zoom: **Ctrl/⌘ + wheel** only (avoid fighting half-pane scroll)
- After client changes: `bun run build`
- Commits: only if the human explicitly asks (otherwise finish tasks without committing)

---

## File map

| File | Role |
| --- | --- |
| `src/client/utils/imageTransform.ts` (+ test) | `clampScale`, `zoomIn`/`zoomOut`/`fitScale`, `rotateLeft`/`rotateRight`, reset |
| `src/client/components/MediaToolbar.tsx` (+ test) | Shared toolbar UI |
| `src/client/components/ui/Icon.tsx` | Add zoom/rotate icons (lucide) |
| `src/client/components/ImageViewer.tsx` (+ test) | Toolbar + transform + optional playlist nav |
| `src/client/components/MediaLightbox.tsx` | Use `MediaToolbar`; image transform state |
| `src/client/components/ContentArea.tsx` | Build sibling media playlist; wire `ImageViewer` |
| `src/client/utils/galleryMedia.ts` (+ test if needed) | Helper: media siblings for a file path given parent children / tree |
| `src/client/styles/layout.css` / `components.css` | Half-pane toolbar + transform stage styles |
| `tests/e2e/gallery.spec.ts` | Smoke: lightbox toolbar still download/close; optional image-viewer toolbar |

---

### Task 1: Pure image transform helpers

**Files:**
- Create: `src/client/utils/imageTransform.ts`
- Create: `src/client/utils/imageTransform.test.ts`

**Interfaces:**
- Produces:

```ts
export const ZOOM_FACTOR = 1.25
export const MIN_SCALE = 0.25
export const MAX_SCALE = 8

export function clampScale(scale: number): number
export function zoomIn(scale: number): number   // * ZOOM_FACTOR, clamped
export function zoomOut(scale: number): number  // / ZOOM_FACTOR, clamped
export function rotateLeft(deg: number): number  // deg - 90, normalize to (-180,180] or [0,360)
export function rotateRight(deg: number): number
/** Fit baseline for object-fit:contain layout: scale returns to 1 */
export function fitScale(): number  // returns 1
export function resetTransform(): { scale: number; rotateDeg: number } // {1, 0}
```

- [ ] **Step 1: Write failing tests**

```ts
import { expect, test } from 'bun:test'
import {
  clampScale, zoomIn, zoomOut, rotateLeft, rotateRight, fitScale, resetTransform,
  MIN_SCALE, MAX_SCALE,
} from './imageTransform.ts'

test('zoomIn/out clamps', () => {
  expect(zoomOut(MIN_SCALE)).toBe(MIN_SCALE)
  expect(zoomIn(MAX_SCALE)).toBe(MAX_SCALE)
  expect(zoomIn(1)).toBeGreaterThan(1)
})

test('rotate steps by 90', () => {
  expect(rotateRight(0)).toBe(90)
  expect(rotateLeft(0)).toBe(-90) // or 270 — pick one convention and stick to it in impl+tests
})

test('reset and fit', () => {
  expect(fitScale()).toBe(1)
  expect(resetTransform()).toEqual({ scale: 1, rotateDeg: 0 })
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test src/client/utils/imageTransform.test.ts`

- [ ] **Step 3: Implement helpers**

Use rotate convention: keep `rotateDeg` as integer multiples of 90 unbounded or normalized with `((d % 360) + 360) % 360` — prefer **unbounded accumulation** then CSS `rotate(${deg}deg)` (simplest). Tests: `rotateRight(0)===90`, `rotateLeft(90)===0`.

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit only if human asked**

---

### Task 2: `MediaToolbar` component + icons

**Files:**
- Create: `src/client/components/MediaToolbar.tsx`
- Create: `src/client/components/MediaToolbar.test.tsx` (happy-dom / preact testing pattern used in repo)
- Modify: `src/client/components/ui/Icon.tsx` — add `zoom-in`, `zoom-out`, `maximize` (fit), `rotate-ccw`, `rotate-cw` from lucide-preact
- Modify: `src/client/styles/components.css` — extract/generalize `.media-toolbar*` from lightbox toolbar styles

**Interfaces:**
- Produces:

```tsx
export type MediaToolbarProps = {
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

- Visibility: zoom/rotate buttons only if `kind==='image'` and callbacks provided; prev/next only if `onPrev`/`onNext` and `(count ?? 0) > 1`; close only if `onClose`.

- [ ] **Step 1: Failing component test**

Assert toolbar renders download + copy; for `kind:'image'` with zoom callbacks, zoom buttons present; for `kind:'video'`, zoom buttons absent; with `count:3` and onPrev/onNext, prev/next present.

Use existing test patterns from `FolderMasonryView.test.tsx` / happy-dom.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `MediaToolbar` + icons + CSS**

Reuse lightbox toolbar class names where possible (`media-lightbox-toolbar` → shared `media-toolbar` with lightbox alias if needed to avoid big CSS churn). Prefer new `media-toolbar` classes and update lightbox later in Task 4.

Copy button `data-testid="media-toolbar-copy-path"`; download `media-toolbar-download`; etc.

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit only if human asked**

---

### Task 3: Sibling playlist helper

**Files:**
- Modify: `src/client/utils/galleryMedia.ts`
- Modify: `src/client/utils/galleryMedia.test.ts`

**Interfaces:**
- Produces:

```ts
/** Parent-folder media siblings for half-pane ←→; empty if unknown */
export function mediaPlaylistForPath(
  filePath: string,
  tree: FileNode[] | undefined,
  showHidden: boolean,
): FileNode[]
```

Implementation sketch:
- Find parent dir path (`''` for root)
- Find folder node (or virtual root with `tree` as children)
- `filterVisible` / existing hidden filter if the repo has one — follow `FolderView` / `al` helpers used elsewhere; if only `showHidden` flag exists on API listings, filter dotfiles client-side when `!showHidden`
- `buildMediaPlaylist(children)` preserving sort order of children as provided (caller sorts)

Also export small:

```ts
export function stepPlaylistPath(playlist: FileNode[], currentPath: string, delta: number): string | null
```

- [ ] **Step 1: Failing tests** with a tiny tree fixture

- [ ] **Step 2–4: Implement + PASS**

- [ ] **Step 5: Commit only if human asked**

---

### Task 4: Wire `ImageViewer` + `ContentArea`

**Files:**
- Modify: `src/client/components/ImageViewer.tsx`
- Create: `src/client/components/ImageViewer.test.tsx` (optional but preferred)
- Modify: `src/client/components/ContentArea.tsx`
- Modify: `src/client/styles/layout.css` — `.image-viewer` becomes column: toolbar + stage; img uses transform

**Interfaces:**
- Consumes: `MediaToolbar`, `imageTransform`, `mediaPlaylistForPath`, `downloadSingleFile`, `showToast`
- `ImageViewer` props:

```ts
{
  filePath: string
  playlist?: FileNode[]
  onNavigate?: (path: string) => void
}
```

- [ ] **Step 1: ImageViewer hosts transform state**

```tsx
const [scale, setScale] = useState(1)
const [rotateDeg, setRotateDeg] = useState(0)
useEffect(() => {
  const r = resetTransform()
  setScale(r.scale)
  setRotateDeg(r.rotateDeg)
}, [filePath])
```

Img style: `transform: rotate(${rotateDeg}deg) scale(${scale})`, `transformOrigin: 'center center'`.

Toolbar: download → `downloadSingleFile(filePath)`; copy → `navigator.clipboard.writeText(filePath)` + toast; zoom/rotate via helpers; prev/next call `onNavigate(stepPlaylistPath(...))` when playlist length > 1.

Ctrl/⌘+wheel on stage: preventDefault, zoomIn/Out.

- [ ] **Step 2: ContentArea**

```tsx
const mediaPlaylist = useMemo(() => {
  if (!filePath || (fileType !== 'image' && fileType !== 'video')) return []
  return mediaPlaylistForPath(filePath, tree, showHidden)
}, [filePath, fileType, tree, showHidden])

// image branch:
return (
  <ImageViewer
    filePath={filePath}
    playlist={mediaPlaylist}
    onNavigate={(p) => onNavigate?.(p) /* or onSelectNode find node */}
  />
)
```

Resolve navigation: prefer existing `onNavigate` / `onSelectNode` so tree selection updates. If only path string available, call the same path the app uses for deep links.

Also pass playlist into `VideoViewer` only if we add a minimal toolbar there in Task 5 — for Task 4 images only is OK; video half-pane can get toolbar in Task 5 for symmetry (download/copy/←→). Spec says half-pane ImageViewer; video half-pane optional. Prefer add thin toolbar to `VideoViewer` in Task 5 with kind=video.

- [ ] **Step 3: Tests + `bun run build`**

- [ ] **Step 4: Commit only if human asked**

---

### Task 5: Refactor `MediaLightbox` to shared toolbar + image transform

**Files:**
- Modify: `src/client/components/MediaLightbox.tsx`
- Modify: `tests/e2e/gallery.spec.ts` if selectors change
- CSS: ensure fullscreen toolbar still looks correct

**Interfaces:**
- Consumes: `MediaToolbar`, `imageTransform`, `downloadSingleFile` or `downloadUrl`

- [ ] **Step 1: Replace inline toolbar with `<MediaToolbar ... />`**

Map existing prev/next/download/close; add copy path, zoom, rotate for images.

- [ ] **Step 2: Image transform state** keyed by `current.path` (reset on change)

Apply transform on lightbox `<img>` only.

- [ ] **Step 3: Keep Esc / arrows / swipe / overlay click behavior**

- [ ] **Step 4: Update e2e testids** — keep `media-lightbox-download` / `media-lightbox-close` as aliases on buttons OR update e2e to `media-toolbar-*`. Prefer **stable lightbox testids** on the toolbar when `onClose` is set (pass `testIdPrefix="media-lightbox"` prop) to avoid breaking e2e.

```ts
testIdPrefix?: string  // default 'media-toolbar'
```

- [ ] **Step 5: `bun test` + e2e gallery smoke if quick + `bun run build`**

- [ ] **Step 6: Commit only if human asked**

---

### Task 6: Video half-pane toolbar (download / copy / ←→)

**Files:**
- Modify: `src/client/components/VideoViewer.tsx`
- Modify: `ContentArea.tsx` video branch to pass playlist + onNavigate

- [ ] **Step 1:** Same `MediaToolbar` with `kind="video"` (no zoom/rotate)

- [ ] **Step 2:** Tests if cheap; build

- [ ] **Step 3:** Commit only if human asked**

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Shared toolbar component | 2 |
| Download | 2, 4, 5 |
| Copy relative path | 2, 4, 5 |
| Zoom −/fit/+ | 1, 4, 5 |
| Rotate ±90° | 1, 4, 5 |
| Prev/next with playlist | 3, 4, 5 |
| Lightbox close chrome | 5 |
| Half-pane ImageViewer | 4 |
| Video no zoom/rotate | 2, 5, 6 |
| Ctrl/⌘+wheel | 4, 5 |
| Reset transform on path change | 1, 4, 5 |

## Placeholder / consistency review

- Rotate convention fixed in Task 1 (unbounded ±90 steps).
- `testIdPrefix` avoids e2e breakage.
- No share / open-external in v1.
