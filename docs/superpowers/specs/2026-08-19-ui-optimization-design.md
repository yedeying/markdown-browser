# UI & UX Optimization Design — Markdown Browser (vmd)

**Date:** 2026-08-19  
**Status:** Approved for implementation planning  
**Approach:** Path 2 — design-system base first, then functional fixes  
**Visual reference:** Root `DESIGN.md` (Cursor template via getdesign), **adapted** for a reading tool (not marketing-site literal)

---

## 1. Goals & non-goals

### Goals (batch 1)

- Self-use first; open-source is a baseline (LICENSE-ready, forkable), not star-chasing.
- Overall UI refresh: tokens, typography, icons, light layout polish.
- Fix daily friction: folder switch, SSE reload behavior, scroll restore, media deep links.
- Small prefs: resizable sidebar, sort memory, hidden-files toggle, uniform tree row height.

### Non-goals (batch 1)

- Gallery overhaul (waterfall + lightbox) — **batch 2 / separate track (2g)**.
- Command palette, major IA rewrite, per-folder sort memory.
- CSS-in-JS, Tailwind, new router framework.
- Shipping proprietary CursorGothic.

---

## 2. Product decisions (locked)

| ID | Decision |
|----|----------|
| Audience | Self-use primary; OSS baseline only |
| Visual | Adapt DESIGN.md: dark default, orange accent, hairlines, no emoji → SVG |
| Fonts | IBM Plex Sans (UI) + JetBrains Mono (code) |
| UI depth | Skin + light layout (toolbar hierarchy, empty/skeleton, sidebar resize) |
| Theme | Dual theme; **dark default**; light = cream system from DESIGN.md |
| 2a | Path/breadcrumb update immediately; content area shows skeleton |
| 2b | Preview: silent reload + keep scroll; edit+unsaved: banner, do not clobber |
| 2c | Scroll positions in `sessionStorage`, keyed by file path |
| 2d | Resizable sidebar width, persisted |
| 2e | Global sort field + direction in `localStorage` |
| 2f | Hide dotfiles by default; toggle persisted |
| 2h | Image/video URLs open correct viewers; no blank shell |
| 2i | Uniform tree row height; sidebar full-height with content |
| 2g | Deferred: masonry + lightbox gallery |

---

## 3. Architecture — design system base

### 3.1 Tokens

- Keep `data-theme="dark" | "light"` on `<html>` (or root); default **dark**.
- Map DESIGN.md semantics into tool-density tokens (not 80px marketing sections):

  - Light: cream canvas, warm ink, hairlines, **orange** (`#f54e00` family) for primary/active only.
  - Dark: warm deep surfaces (not raw GitHub clone), same spacing/radius/hairline language, orange accent.

- Orange is reserved for primary CTAs and selection/activation — not decorative chrome.

### 3.2 Typography

- UI: IBM Plex Sans (npm or self-hosted woff2; no fragile CDN-only dependency).
- Code / CodeMirror / markdown fences: JetBrains Mono.
- Do **not** bundle CursorGothic.

### 3.3 Icons

- Lucide (or equivalent), tree-shake / per-icon imports.
- Replace emoji in Sidebar, Landing, ThemeToggle, empty states, folder chrome.

### 3.4 Stylesheet layout

Split the monolithic `index.css` lightly:

| File | Role |
|------|------|
| `tokens.css` | Color, space, radius, type scale |
| `base.css` | Reset, fonts, scrollbars |
| `layout.css` | app-layout, sidebar, headers, resize handle |
| `components.css` | buttons, tree, toast, skeleton, landing, banners |
| `markdown.css` | Unchanged ownership of article styles |

Remove embedded `<style>` from `MountLanding` and reduce layout-critical inline styles in `App` / headers.

### 3.5 Small shared UI pieces

- `Skeleton` — folder/file loading (reuse shimmer language, new tokens).
- `EmptyState` — icon + title + short hint + optional CTA.
- `IconButton` — accessible icon actions (`aria-label`, focus-visible).
- Toast as a component (replace `document.createElement` toasts).

### 3.6 Explicitly out of base

- No new SPA framework, no command palette, no three-pane IA change beyond polish.

---

## 4. Functional behavior

### 4.1 Folder switch (2a)

1. On folder select (sidebar / breadcrumb / root): update `selectedNode`, URL, breadcrumb/title **immediately**.
2. Main pane shows **folder skeleton** (do not keep previous folder’s listing).
3. Ensure `loadChildren` for the path; render `FolderView` when ready.
4. File → folder: leave preview/edit chrome; enter folder view with the same skeleton contract.

### 4.2 External updates vs edit (2b)

| State | On SSE `reload` for current file |
|-------|----------------------------------|
| Preview (not unsaved) | Silent refetch; restore scroll (2c) |
| Edit + unsaved | No overwrite; banner: “文件已在外部更新” + **加载新版本** / **忽略** |
| Edit + clean | Same as preview (silent sync) |

- `tree-change`: refresh tree / current folder children only — no full page reload.

### 4.3 Scroll memory (2c)

- Key: `vmd_scroll:<filePath>` in `sessionStorage`.
- Save: debounced on scroll; flush on navigate away / unmount.
- Restore: after content paint (including silent reload); one short retry if height not ready.
- Scope: file preview (and editor scroll if cheap); **not** folder views by default.

### 4.4 Media deep links (2h)

- Pathname to image/video → `ImageViewer` / `VideoViewer` via existing `getFileType`.
- First paint / `popstate` share the same path resolution as markdown/code.
- If tree node missing: infer type from extension and still open; missing file → explicit error state (never blank).

### 4.5 Sidebar resize (2d)

- Desktop: drag handle on sidebar’s right edge.
- Persist `vmd_sidebar_width` in `localStorage`.
- Clamp (~200–480px). Mobile drawer: no resize.

### 4.6 Sort memory (2e)

- Global `{ field, order }` in `localStorage` (e.g. `vmd_sort`).
- Shared across list / grid / column folder views.
- No per-folder overrides in batch 1.
- Fields: at least `name` and `mtime` (extend only if UI already exposes more).

### 4.7 Hidden files (2f)

- Default: hide names starting with `.` (files and folders).
- Toggle in sidebar or folder toolbar; persist `vmd_show_hidden`.
- Client-side filter on tree + folder listings; search results follow the same flag.

### 4.8 Tree equal height (2i)

- Fixed/`min-height` rows; icon + label vertically centered.
- Sidebar column stretches to full app height; tree list scrolls inside (`flex: 1; min-height: 0`).

### 4.9 Errors

- Load/save failures: short toast or inline error.
- SSE disconnect: keep existing connection affordance; no new reconnect UI in batch 1.

---

## 5. Layout & visual landing

### 5.1 Shell

- Keep: sidebar | content | TOC (when headings exist).
- Header: left (menu/path) · center (light status) · right (primary actions + overflow “更多”).
- Primary/active: orange; chrome: hairline, minimal shadow.

### 5.2 Landing / empty

- No emoji; title + one sentence + primary CTA.
- Mount cards: hairline surfaces + SVG icons.

### 5.3 Tree & folder chrome

- Lucide file/folder icons; selection via orange background **or** orange leading bar (pick one; both themes must remain readable).
- Toolbar group: view mode, sort, hidden-files toggle.
- Skeleton shimmer recolored to tokens.

### 5.4 Reading / editing

- Article measure ~65–75ch.
- Unsaved / warning colors from tokens.
- External-update banner under header (2b).

### 5.5 Theme matrix

| | Light | Dark (default) |
|--|-------|----------------|
| Background | Cream canvas | Warm deep |
| Text | Warm ink | Warm light gray |
| Accent | Orange | Orange (slightly brighter OK) |
| Border | Hairline | Dark hairline |

### 5.6 Motion

- ~150ms transitions for hover/drawer/sidebar.
- Folder switch: instant title + skeleton — no full-page fade theatrics.

---

## 6. Implementation order (Path 2)

1. Tokens, fonts, icon plumbing, stylesheet split, Skeleton/EmptyState/IconButton/Toast.
2. Apply skin to Sidebar, ContentArea header, Landing, ThemeToggle (emoji removal).
3. 2a + 2i (folder switch skeleton + tree row/height).
4. 2b + 2c (SSE policy + scroll session memory).
5. 2h (media deep links).
6. 2d + 2e + 2f (resize, sort, hidden).
7. Pass for polish / e2e.
8. **Later:** 2g gallery (masonry + lightbox).

---

## 7. Testing

- E2E: folder switch shows skeleton then content; deep-link image; hidden toggle; sort survives reload.
- 2b/2c: exercise watch reload in preview vs unsaved edit when feasible.
- Visual smoke: dark default + light cream; no emoji in primary chrome.

---

## 8. Open points for implementation plan (not blockers)

- Exact Lucide vs alternate icon set package wiring.
- Selection style: fill vs leading bar (decide in UI pass).
- Whether clean edit mode uses identical silent sync as preview (spec allows; prefer silent).

---

## 9. Batch 2 preview (out of scope now)

- **2g:** Default masonry gallery for image-heavy folders; click → lightbox (keyboard next/prev); video in same lightbox shell.
