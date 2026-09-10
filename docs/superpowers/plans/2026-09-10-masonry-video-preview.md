# Masonry Video Preview + HEIC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show video cover frames in masonry with desktop-hover / touch-long-press muted preview (click→Lightbox unchanged), and treat HEIC/HEIF as displayable images via server transcode.

**Architecture:** Parent-owned masonry video session (viewport gate + concurrency ≤2 + cover blob cache) so column remounts do not abort work; HEIC classified as `image` client-side and always transcoded on `/api/asset` (never raw passthrough for preview). Touch preview uses a long-press path that does **not** suppress the subsequent click unless the pointer moved past the existing cancel threshold.

**Tech Stack:** Preact 10, existing `assetUrl` / `fetchAssetBlob`, sharp/`transformImage`, bun:test, optional Playwright smoke.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-10-masonry-video-preview-design.md`
- Video covers/previews: client-only (no ffmpeg)
- Max concurrent masonry video decode/play work: **2**
- Desktop preview: hover; touch preview: long-press while held
- Long-press without move: click still opens Lightbox; long-press + move: cancel click
- HEIC/HEIF: `image`; server transcode for display; download keeps original
- Do not add hover/long-press preview to list/grid/column
- After client/server code changes: `bun run build` (repo default-build rule)
- Commits only if the human explicitly asks (otherwise finish tasks without committing)

---

## File map

| File | Role |
| --- | --- |
| `src/client/utils/fileType.ts` (+ test) | Add `.heic` / `.heif` to `IMAGE_EXTS` |
| `src/server/image-transform.ts` (+ test) | `isTranscodable` includes HEIC/HEIF; MIME helpers |
| `src/server/routes/dir.ts` / `single.ts` / `share.ts` | Always transcode HEIC for asset display; MIME map |
| `src/client/utils/fsApi.ts` (+ test) | `displayAssetUrl(path, opts?)` — forces `fmt=webp` for HEIC/HEIF |
| `src/client/components/ImageViewer.tsx` | Use `displayAssetUrl` |
| `src/client/components/MediaLightbox.tsx` | Images use `displayAssetUrl` |
| `src/client/utils/masonryVideoSession.ts` (+ test) | Concurrency queue, request/abort/teardown API |
| `src/client/utils/videoCover.ts` (+ test where pure) | Capture first frame → blob URL helpers |
| `src/client/components/FolderMasonryView.tsx` | Video tiles: cover, hover, long-press preview |
| `src/client/hooks/useLongPress.ts` or local gesture | Touch preview without always suppressing click |
| `src/client/styles/components.css` | Video cover / preview layer styles |
| `tests/e2e/gallery.spec.ts` | Optional: HEIC/video smoke if fixtures exist |

---

### Task 1: HEIC client file type

**Files:**
- Modify: `src/client/utils/fileType.ts`
- Modify: `src/client/utils/fileType.test.ts`
- Modify: `src/server/routes/dir.ts` — keep `IMAGE_EXTS` / `BINARY_EXTS` in sync if duplicated

**Interfaces:**
- Produces: `getFileType('a.heic') === 'image'`, `getFileType('b.HEIF') === 'image'`

- [ ] **Step 1: Write the failing test**

Add to `src/client/utils/fileType.test.ts`:

```ts
test('heic/heif are images', () => {
  expect(getFileType('photo.heic')).toBe('image')
  expect(getFileType('photo.HEIC')).toBe('image')
  expect(getFileType('scan.heif')).toBe('image')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/client/utils/fileType.test.ts`
Expected: FAIL — `heic` not image

- [ ] **Step 3: Minimal implementation**

In `fileType.ts`, extend:

```ts
const IMAGE_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp',
  '.heic', '.heif',
])
```

Mirror the same extensions in `dir.ts` `IMAGE_EXTS` (and thus `BINARY_EXTS`) so file open / binary routing stays consistent.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/client/utils/fileType.test.ts`
Expected: PASS

- [ ] **Step 5: Commit only if human asked**

```bash
git add src/client/utils/fileType.ts src/client/utils/fileType.test.ts src/server/routes/dir.ts
git commit -m "$(cat <<'EOF'
feat: treat HEIC/HEIF as images in file type detection

EOF
)"
```

---

### Task 2: HEIC server transcode (never passthrough for display)

**Files:**
- Modify: `src/server/image-transform.ts`
- Modify: `src/server/image-transform.test.ts`
- Modify: `src/server/routes/dir.ts` asset handler
- Modify: `src/server/routes/single.ts` asset handler
- Modify: `src/server/share.ts` MIME map (and asset path if it passthroughs)

**Interfaces:**
- Produces: `isTranscodable('.heic') === true`
- Produces: asset route for HEIC without `w`/`fmt` still returns webp/jpeg (not `image/heic` passthrough)
- Consumes: existing `transformImage`, `c.req.raw.signal`

- [ ] **Step 1: Write failing unit tests**

In `image-transform.test.ts`:

```ts
test('isTranscodable includes heic/heif', async () => {
  const { isTranscodable } = await import('./image-transform.js')
  expect(isTranscodable('.heic')).toBe(true)
  expect(isTranscodable('.heif')).toBe(true)
})
```

If a tiny HEIC fixture can be generated or checked into `tests/fixtures/`, add:

```ts
test('transformImage decodes heic to webp when fixture available', async () => {
  // skip if fixture missing or sharp cannot decode
})
```

Otherwise rely on route-level logic tests with mocked `transformImage` only if already patterned; prefer real fixture when cheap.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/server/image-transform.test.ts`
Expected: FAIL on `isTranscodable('.heic')`

- [ ] **Step 3: Implement `isTranscodable` + MIME**

```ts
export function isTranscodable(ext: string): boolean {
  const e = ext.toLowerCase()
  return (
    e === '.png' || e === '.jpg' || e === '.jpeg' || e === '.webp' ||
    e === '.heic' || e === '.heif'
  )
}
```

Add `.heic` / `.heif` content types in passthrough MIME maps only for completeness; display path should not passthrough.

Export helper if useful:

```ts
export function mustTranscodeForBrowser(ext: string): boolean {
  const e = ext.toLowerCase()
  return e === '.heic' || e === '.heif'
}
```

- [ ] **Step 4: Route logic — always transcode HEIC**

In `dir.ts` / `single.ts` asset handlers, change the branch so that for `mustTranscodeForBrowser(ext)` OR explicit `w`/`fmt`, call `transformImage`. For HEIC with no query params, still set `fmt` via `fmtForExt(ext, pickOutputFormat(accept))` or force `'webp'`, and a sensible `maxWidth` (`DEFAULT_MAX_WIDTH`).

Keep AbortSignal wiring from the prior abort work.

Sync `TRANSCODABLE_IMAGE_EXTS` sets in `dir.ts` / `single.ts` with `isTranscodable` (prefer importing `isTranscodable` / `mustTranscodeForBrowser` from `image-transform.js` instead of duplicating sets).

- [ ] **Step 5: Run tests**

Run: `bun test src/server/image-transform.test.ts`
Expected: PASS for `isTranscodable`; optional HEIC decode test passes or skips cleanly

- [ ] **Step 6: Commit only if human asked**

```bash
git commit -m "$(cat <<'EOF'
feat: always transcode HEIC/HEIF assets for browser display

EOF
)"
```

---

### Task 3: `displayAssetUrl` for HEIC in viewers

**Files:**
- Modify: `src/client/utils/fsApi.ts`
- Modify: `src/client/utils/fsApi.test.ts`
- Modify: `src/client/components/ImageViewer.tsx`
- Modify: `src/client/components/MediaLightbox.tsx` (image branch only)

**Interfaces:**
- Produces:

```ts
export function displayAssetUrl(
  path: string,
  opts?: { w?: number; fmt?: string },
): string
```

- Behavior: if basename ext is `.heic`/`.heif` (case-insensitive), ensure `fmt` defaults to `'webp'` even when caller passes no opts; otherwise delegate to `assetUrl`.

- [ ] **Step 1: Failing tests**

```ts
test('displayAssetUrl forces webp for heic/heif', () => {
  expect(displayAssetUrl('a.heic')).toBe('/api/asset/a.heic?fmt=webp')
  expect(displayAssetUrl('a.HEIF', { w: 800 })).toBe('/api/asset/a.HEIF?w=800&fmt=webp')
  expect(displayAssetUrl('a.png')).toBe('/api/asset/a.png')
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `bun test src/client/utils/fsApi.test.ts`

- [ ] **Step 3: Implement + wire viewers**

```ts
function isHeicPath(path: string): boolean {
  const base = path.split('/').pop() || path
  const i = base.lastIndexOf('.')
  if (i < 0) return false
  const ext = base.slice(i).toLowerCase()
  return ext === '.heic' || ext === '.heif'
}

export function displayAssetUrl(path: string, opts?: { w?: number; fmt?: string }): string {
  if (isHeicPath(path)) {
    return assetUrl(path, { w: opts?.w, fmt: opts?.fmt ?? 'webp' })
  }
  return assetUrl(path, opts)
}
```

`ImageViewer`: `src={displayAssetUrl(filePath)}`  
`MediaLightbox` image: `src={displayAssetUrl(current.path)}`  
Grid/masonry image thumbs already pass `fmt: 'webp'` — leave as-is once HEIC is transcodable.

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit only if human asked**

---

### Task 4: Masonry video session (concurrency + abort)

**Files:**
- Create: `src/client/utils/masonryVideoSession.ts`
- Create: `src/client/utils/masonryVideoSession.test.ts`

**Interfaces:**
- Produces:

```ts
export type VideoSessionCallbacks = {
  onCover: (path: string, objectUrl: string, ratio: number) => void
  onCoverError: (path: string) => void
}

export class MasonryVideoSession {
  constructor(opts?: { maxConcurrent?: number }) // default 2
  /** Queue cover capture for path; no-op if already have cover or in-flight */
  requestCover(path: string, srcUrl: string, signal?: AbortSignal): void
  /** Cancel queued/in-flight for path */
  cancel(path: string): void
  /** Abort all + revoke covers owned by session */
  dispose(): void
  getCover(path: string): string | undefined
}
```

Implementation sketch (keep in plan for implementer):

- Internal queue; `inFlight <= maxConcurrent` (2)
- `requestCover` creates `AbortController` linked to optional external signal
- Load via temporary `HTMLVideoElement` or injected loader for tests
- For unit tests: inject `loader: (url, signal) => Promise<{ bitmapWidth; bitmapHeight; blob }>` so bun:test does not need real video decode

- [ ] **Step 1: Failing test — queue abort**

```ts
test('MasonryVideoSession aborts queued work and never runs it', async () => {
  let ran = 0
  const session = new MasonryVideoSession({
    maxConcurrent: 1,
    loader: async (_url, signal) => {
      ran++
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 50)
        signal.addEventListener('abort', () => {
          clearTimeout(t)
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
      return { width: 16, height: 9, blob: new Blob([new Uint8Array([0])]) }
    },
  })
  // occupy slot
  session.requestCover('a', '/a')
  session.requestCover('b', '/b')
  session.cancel('b')
  await new Promise((r) => setTimeout(r, 80))
  expect(ran).toBe(1) // only a
  session.dispose()
})
```

(Adjust API so `loader` is constructable for tests.)

- [ ] **Step 2: Run — expect FAIL (class missing)**

Run: `bun test src/client/utils/masonryVideoSession.test.ts`

- [ ] **Step 3: Implement session with injectable loader**

Default browser loader (used by UI task): create `<video muted playsInline preload="metadata" src=...>`, on loadeddata/seeked draw to canvas, `toBlob('image/webp')` → object URL; report `videoWidth/videoHeight` ratio.

- [ ] **Step 4: Tests PASS including `dispose` revokes and cancels**

- [ ] **Step 5: Commit only if human asked**

---

### Task 5: Wire video tiles in `FolderMasonryView`

**Files:**
- Modify: `src/client/components/FolderMasonryView.tsx`
- Modify: `src/client/styles/components.css`
- Possibly: small hook `useMasonryVideoPreview.ts` colocated if file grows

**Interfaces:**
- Consumes: `MasonryVideoSession`, `assetUrl(path)` for video src, `onAspectRatio` for pack
- Produces: video tile with cover / error / preview layers; no permanent shimmer

- [ ] **Step 1: Parent owns one `MasonryVideoSession` per mount**

```tsx
useEffect(() => {
  const session = new MasonryVideoSession()
  sessionRef.current = session
  return () => session.dispose()
}, [pathKey]) // new folder → new session
```

- [ ] **Step 2: Viewport observation on wrap**

`IntersectionObserver` with `root: wrapRef.current`, `rootMargin: '200px 0px'`. When a `[data-path].is-video` intersects, `session.requestCover(path, assetUrl(path))`. On leave viewport: `session.cancel(path)` only if cover not yet ready (optional: keep cover, cancel only in-flight).

Feed cover ratio into existing `handleAspectRatio`.

- [ ] **Step 3: Tile UI states**

- No cover yet: finite shimmer (same as images) OR static dark placeholder — **must end** on cover or error
- Cover ready: `<img src={coverUrl}>` + ▶
- Error: icon + ▶ (current fallback)
- Previewing: `<video muted loop playsInline src={assetUrl} />` visible above cover

- [ ] **Step 4: Desktop hover**

On tile: `onPointerEnter` if `e.pointerType === 'mouse'` (or matchMedia hover) → start preview play (reuse warm video element or second element). `onPointerLeave` → pause, hide preview layer.

Respect global concurrency: if session says too busy, skip preview or wait — prefer pause other previews so at most 2 playing.

- [ ] **Step 5: Touch long-press preview without killing click**

Do **not** use `useLongPress({ suppressClick: true })` for preview (that suppresses click after long-press). Instead:

- On `pointerdown` (touch): start 500ms timer; store x/y
- On move > 10px: clear timer; if previewing stop; set `cancelClickRef = true`
- On timer fire: start muted preview (`previewing=true`); do **not** set cancelClick
- On `pointerup`/`click`: if `cancelClickRef` prevent open; else `onSelect(node)` (Lightbox). Stop preview on up.

Keep existing selection long-press / context menu behavior intact — if conflict, prefer: selection-mode long-press from `selectionProps.onLongPress` remains for checkbox mode; preview long-press only when not in selection mode. Document chosen resolution in code comment if both fire.

- [ ] **Step 6: Manual check + build**

Run: `bun run build`  
Manual: folder with mp4/mov + images — covers appear; hover previews on desktop; touch long-press previews then tap opens lightbox; scroll away cancels pending loads.

- [ ] **Step 7: Commit only if human asked**

---

### Task 6: Regression tests + optional e2e

**Files:**
- Modify: `src/client/utils/galleryMedia.test.ts` — HEIC counts as media if using `getFileType`
- Modify: `tests/e2e/gallery.spec.ts` only if fixture available

- [ ] **Step 1: Extend galleryMedia test**

```ts
test('heic counts as media for masonry', () => {
  const nodes = [
    { name: 'a.heic', type: 'file' as const, path: 'a.heic' },
  ]
  expect(folderHasMedia(nodes)).toBe(true)
  expect(filterMasonryNodes(nodes).map((n) => n.path)).toEqual(['a.heic'])
})
```

- [ ] **Step 2: Run**

`bun test src/client/utils/galleryMedia.test.ts src/client/utils/fsApi.test.ts src/client/utils/fileType.test.ts src/client/utils/masonryVideoSession.test.ts src/server/image-transform.test.ts`

Expected: all PASS

- [ ] **Step 3: `bun run build`**

Expected: success

- [ ] **Step 4: Commit only if human asked**

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Video static cover + ▶ | 5 |
| Desktop hover muted loop | 5 |
| Touch long-press preview | 5 |
| Click unchanged if no move | 5 |
| Long-press + move cancels click | 5 |
| Viewport gate | 5 |
| Concurrency ≤ 2 | 4, 5 |
| Teardown on leave masonry | 4, 5 |
| Parent-owned session (remount safe) | 4, 5 |
| No ffmpeg | 4–5 |
| HEIC as image | 1 |
| HEIC always transcode for display | 2 |
| display URLs for viewers | 3 |
| Download original HEIC | unchanged download path |
| No list/grid/column preview | out of scope (no tasks) |

## Placeholder / consistency review

- No TBD steps; `MasonryVideoSession` loader injection defined for tests.
- Click vs `useLongPress(suppressClick)` conflict called out explicitly in Task 5.
- `displayAssetUrl` vs `assetUrl` naming consistent across Tasks 3 and 5.
