# Masonry Video Cover + Preview Design

**Date:** 2026-09-10  
**Status:** Approved for implementation planning  
**Approach:** A — client-only poster frame + gated muted preview (no ffmpeg)

---

## 1. Goals & non-goals

### Goals

- Video tiles in masonry show a **static cover frame** (like image thumbs), with a ▶ affordance.
- **Desktop:** hover starts muted looping preview; leave stops.
- **Touch:** long-press (pointer stays on tile) plays muted preview; lift without meaningful move still fires **click → Lightbox**; long-press then move **cancels click**.
- Click / Lightbox behavior for videos stays as today otherwise.
- Performance: viewport gating, global decode/play concurrency limit, abort/teardown on leave masonry.
- **HEIC / HEIF** files are treated as images in gallery flows (masonry, grid thumbs, Lightbox / image viewer): browsers do not reliably decode them, so the server always serves a transcoded raster (webp/jpeg) for display.

### Non-goals

- Server-side **video** frame extraction or ffmpeg dependency.
- Auto-play when merely entering the viewport (without hover / long-press).
- Hover/long-press preview in list / grid / column views.
- Guaranteed perfect posters for every video codec (especially some `.mov`); icon fallback is OK.
- Editing / lossless round-trip of HEIC; download of original bytes may remain the source file via download API.

---

## 2. Appearance

| State | UI |
|-------|-----|
| Loading cover | Same shimmer placeholder as images (finite, until frame or error) |
| Cover ready | Drawn frame (canvas → blob URL or equivalent) + ▶ badge |
| Cover failed | Existing icon + ▶ (no infinite shimmer) |
| Previewing | Muted looping `<video>` over the cover; ▶ may hide or stay subtle |

Aspect ratio: prefer decoded video dimensions when known; else keep `16 / 9` placeholder until metadata arrives, then feed masonry pack ratios like images.

---

## 3. Interaction

### Click (all pointers)

- Unchanged: open `MediaLightbox` on the video (folder media playlist).
- Must not open Lightbox when the gesture is classified as **long-press + move** (drag cancel).

### Desktop (fine pointer / hover-capable)

- `pointerenter` (or equivalent): start muted loop preview if cover session is ready or video element is available.
- `pointerleave`: pause, reset to cover frame (keep element warm while still in viewport per §4).

### Touch (coarse pointer)

- Align with existing long-press displacement threshold used by folder cards / masonry tiles.
- **Long-press fire (hold, no leave):** start muted preview while pressed.
- **Pointer up, movement below threshold:** treat as click → Lightbox (preview stops).
- **Pointer move beyond threshold while held:** stop preview; **do not** fire click; allow scroll / marquee as today.

Desktop long-press is not required; hover is the preview trigger. Touch does not use hover.

---

## 4. Performance & lifecycle

### Viewport

- Only tiles intersecting the masonry scroll root (`.folder-masonry-wrap`) plus a modest `rootMargin` attach a `<video>` / start cover capture.
- Leaving the viewport: pause, clear/detach `src` if idle policy says so, keep cover blob if already captured.

### Concurrency

- Global cap of **2** simultaneous video decode/load or playing previews for masonry.
- Excess work queues; cancelled when tile leaves viewport or masonry unmounts.

### Cover capture

- Client: `preload="metadata"` (or short buffered load), seek/near-zero frame, draw to canvas → `createObjectURL` (or reuse a still from the video element without keeping network warm forever).
- Capture failures → icon fallback; mark settled for pack so layout does not wait forever.

### Teardown

- Leaving masonry view or changing folder: abort queued work, pause all, revoke cover object URLs owned by the session, remove media `src`.

### Remount safety

- Cover/blob and in-flight controllers live in a **parent-owned session** (or equivalent), so column reshuffles remounting tiles do not abort and restart cover work unnecessarily (same class of bug as image `fetch` remount abort).

---

## 5. Integration points

- Primary: `FolderMasonryView` / masonry tile video branch.
- Reuse: `assetUrl` for video src; existing long-press helpers / selection props where possible.
- Masonry pack: video paths can contribute real aspect ratios once metadata known; until then `16/9` (existing `estimateMasonryTileHeight` video branch).
- No change required to Lightbox playlist helpers for this feature beyond HEIC counting as `image`.

---

## 5b. HEIC / HEIF

### Detection

- Client `getFileType`: `.heic` / `.heif` → `'image'` (so masonry button, masonry filter, Lightbox playlist, and image viewer path include them).

### Serving for display

- Raw HEIC must **not** be used as `<img src>` in Chrome/Firefox; Safari-only is insufficient.
- Extend server `isTranscodable` (and asset MIME map) to include `.heic` / `.heif`.
- For these extensions, `/api/asset` **always** transcodes to a browser-safe format when used for preview (prefer explicit `?fmt=webp` from masonry/grid; if URL has no `w`/`fmt`, still convert to webp/jpeg instead of passthrough — unlike PNG/JPEG bare passthrough).
- Failures → existing broken-image / icon error UI; do not hang the transform queue (same AbortSignal rules).

### Scope of HEIC in this work

| Surface | Behavior |
|---------|----------|
| Masonry / grid thumbs | `assetUrl(..., { w, fmt: 'webp' })` after HEIC is transcodable |
| Lightbox / ImageViewer | Display via transcoded asset URL (fmt webp or jpeg) |
| Download | Keep original HEIC bytes (existing download path) |

### Risk

- Sharp/libvips must decode HEIC on the host (libheif present in current sharp build). If a platform build cannot decode, show error fallback; document runtime requirement briefly in implementer notes — no alternate decoder dependency in v1 unless sharp fails in CI.

---

## 6. Testing

- Unit: concurrency queue cancels; settled/fallback when capture fails (pure helpers if extracted); `getFileType('a.heic') === 'image'`; HEIC is transcodable / non-passthrough for display assets.
- Component / e2e light: masonry video tile shows cover or fallback without permanent shimmer; click still opens lightbox; (desktop) hover can be smoke-tested if stable in Playwright; touch long-press + move does not open lightbox if automatable; HEIC appears in masonry as an image tile when fixtures exist (or unit-level asset transform if e2e fixture heavy).

---

## 7. Decisions locked

| Topic | Choice |
|-------|--------|
| Display | Static cover + preview (not icon-only) |
| Desktop preview | Hover |
| Touch preview | Long-press while held |
| Click after long-press (no move) | Still opens Lightbox |
| Long-press + move | Cancels click |
| Implementation | Client-only for **video** cover/preview (Approach A) |
| Server video thumbs / ffmpeg | No |
| Max concurrent video work | 2 |
| HEIC / HEIF | Treat as image; server transcode for display; download keeps original |
