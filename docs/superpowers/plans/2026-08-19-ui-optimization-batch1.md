# UI Optimization Batch 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship design-system base (adapted Cursor `DESIGN.md`) plus batch-1 UX fixes: folder switch skeleton, SSE reload policy, scroll memory, media deep links, sidebar resize, sort/hidden prefs, uniform tree rows.

**Architecture:** Path 2 — introduce CSS tokens/fonts/icons and small shared UI primitives first; then wire behavioral fixes into `App` / `ContentArea` / `FolderView` / prefs helpers without changing the three-pane IA. Gallery (2g) is out of scope.

**Tech Stack:** Preact 10, Vite 5, Bun, existing Hono server, Playwright e2e, IBM Plex Sans + JetBrains Mono, Lucide icons (per-icon imports), CSS variables (no Tailwind).

**Spec:** `docs/superpowers/specs/2026-08-19-ui-optimization-design.md`  
**Visual reference:** `DESIGN.md` (adapt; do not ship CursorGothic)

## Global Constraints

- Self-use first; no star-chasing scope creep.
- Dark theme default; dual theme required.
- Orange accent only for primary/active; hairlines, minimal shadows.
- No emoji in primary chrome (sidebar, landing, theme toggle, empty states).
- No CSS-in-JS / Tailwind / command palette / IA rewrite.
- localStorage keys stay `vmd_*` prefixed; scroll uses `sessionStorage`.
- Prefer small focused files; light-split CSS rather than one more 1500-line dump.
- Every task ends with a commit unless the user says otherwise.

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/client/styles/tokens.css` | Color/space/radius/type tokens (dark+light) |
| `src/client/styles/base.css` | Reset, font faces, body |
| `src/client/styles/layout.css` | app-layout, sidebar width+resize, headers |
| `src/client/styles/components.css` | buttons, tree rows, toast, skeleton, landing, banners |
| `src/client/styles/index.css` | Re-exports / thin leftover bridge during migration |
| `src/client/styles/markdown.css` | Article styles only (keep ownership) |
| `src/client/components/ui/Icon.tsx` | Lucide wrapper / icon name map |
| `src/client/components/ui/Skeleton.tsx` | Folder/file skeleton |
| `src/client/components/ui/EmptyState.tsx` | Empty placeholder |
| `src/client/components/ui/Toast.tsx` | `showToast(message, type)` API |
| `src/client/components/ui/ExternalUpdateBanner.tsx` | 2b banner |
| `src/client/utils/prefs.ts` | load/save helpers for sidebar width, sort, hidden |
| `src/client/utils/scrollMemory.ts` | session scroll get/set/clear |
| `src/client/utils/hiddenFiles.ts` | `isDotfile` + filter helpers |
| `src/client/hooks/useFileContent.ts` | Skip text fetch for binary; expose path selection |
| `src/client/App.tsx` | Folder switch skeleton state; SSE policy; media select |
| `src/client/components/ContentArea.tsx` | Media before content gate; banner; scroll restore |
| `src/client/components/Sidebar.tsx` | Resize handle, hidden toggle, icons, row height |
| `src/client/components/FileTree.tsx` | Hidden filter + equal row classes |
| `src/client/components/FolderListView.tsx` | Persist/read global sort |
| `src/client/components/FolderView.tsx` | Pass sort prefs; toolbar grouping |
| `src/client/components/MountLanding.tsx` | Move styles to CSS; icons |
| `src/client/components/ThemeToggle.tsx` | SVG icons |
| `src/client/main.tsx` | Import split CSS + fonts |
| `index.html` | Font preload optional |
| `package.json` | Add `@fontsource/ibm-plex-sans`, `@fontsource/jetbrains-mono`, `lucide-preact` (or `lucide`) |
| `tests/e2e/ui-batch1.spec.ts` | New e2e coverage |

---

### Task 1: Design tokens, fonts, stylesheet split

**Files:**
- Create: `src/client/styles/tokens.css`
- Create: `src/client/styles/base.css`
- Create: `src/client/styles/layout.css`
- Create: `src/client/styles/components.css`
- Modify: `src/client/styles/index.css` (become imports-only or thin leftovers)
- Modify: `src/client/main.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing `--bg`, `--text`, … class names used across components
- Produces: same CSS variable names where possible **plus** new tokens: `--accent`, `--accent-active`, `--canvas`, `--ink`, `--hairline`, `--sidebar-width` (default `280px`), `--tree-row-height` (e.g. `32px`)

- [ ] **Step 1: Add font packages**

```bash
~/.bun/bin/bun add @fontsource/ibm-plex-sans @fontsource/jetbrains-mono
```

- [ ] **Step 2: Write `tokens.css`**

Map DESIGN.md cream/orange into tool density. Dark default values on `:root, :root[data-theme="dark"]`; light on `:root[data-theme="light"]`. Keep legacy aliases (`--bg`, `--text`, `--border`, `--header-bg`, `--sidebar-bg`, `--active-bg`, `--warning`, `--success`, `--danger`) pointing at new tokens so old rules keep working.

Orange active example (light): `--active-bg: #f54e00; --active-text: #ffffff;`  
Dark: slightly brighter orange OK for contrast.

- [ ] **Step 3: Write `base.css`**

```css
@import '@fontsource/ibm-plex-sans/400.css';
@import '@fontsource/ibm-plex-sans/600.css';
@import '@fontsource/jetbrains-mono/400.css';

body {
  font-family: 'IBM Plex Sans', system-ui, sans-serif;
  /* keep existing height/overflow rules from old index.css */
}
code, pre, .cm-editor {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}
```

- [ ] **Step 4: Move layout + component rules**

Cut from current `index.css` into `layout.css` / `components.css` without changing selectors yet. `index.css` should only:

```css
@import './tokens.css';
@import './base.css';
@import './layout.css';
@import './components.css';
```

- [ ] **Step 5: Wire `main.tsx`**

Keep `import './styles/index.css'` and `markdown.css`. Confirm `data-theme` default remains `dark` via `useTheme` / existing boot logic.

- [ ] **Step 6: Smoke-check**

```bash
~/.bun/bin/bun run dev
```

Open app: dark theme loads, fonts apply, no missing-rule breakage on sidebar/content.

- [ ] **Step 7: Commit**

```bash
git add package.json bun.lock src/client/styles src/client/main.tsx
git commit -m "$(cat <<'EOF'
feat(ui): split CSS and add Plex/Mono design tokens

EOF
)"
```

---

### Task 2: Shared UI primitives (Icon, Skeleton, EmptyState, Toast)

**Files:**
- Create: `src/client/components/ui/Icon.tsx`
- Create: `src/client/components/ui/Skeleton.tsx`
- Create: `src/client/components/ui/EmptyState.tsx`
- Create: `src/client/components/ui/Toast.tsx`
- Modify: `package.json`
- Modify: `src/client/styles/components.css`

**Interfaces:**
- Consumes: Lucide icons; CSS skeleton classes
- Produces:
  - `Icon({ name: 'folder' | 'file' | 'sun' | 'moon' | 'home' | 'settings' | 'menu' | 'chevron-right' | 'eye' | 'eye-off' | 'image' | 'book', size?: number, class?: string })`
  - `Skeleton({ variant: 'folder' | 'file' })`
  - `EmptyState({ icon?: ..., title: string, description?: string, action?: ComponentChildren })`
  - `showToast(message: string, type: 'success' | 'error'): void`

- [ ] **Step 1: Add Lucide**

```bash
~/.bun/bin/bun add lucide-preact
```

If `lucide-preact` is awkward with the toolchain, use `lucide` with `preact` `h` — prefer working Preact components.

- [ ] **Step 2: Implement `Icon.tsx`**

Map `name` → Lucide component. Default `size={16}`. Pass through `class` / `aria-hidden` when decorative.

- [ ] **Step 3: Implement `Skeleton.tsx`**

Reuse existing `.tree-skeleton` / `.file-loading` markup patterns; accept `variant`.

- [ ] **Step 4: Implement `EmptyState.tsx` + `Toast.tsx`**

`showToast` appends `.toast.success|.error` to `document.body`, removes after ~2200ms (same UX as today). Export from `Toast.tsx` so FolderView/ContentArea can replace local copies later.

- [ ] **Step 5: Manual check** — import Skeleton in a temporary place or Story-less check in browser console not required; proceed to Task 3 for real wiring.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock src/client/components/ui src/client/styles/components.css
git commit -m "$(cat <<'EOF'
feat(ui): add Icon, Skeleton, EmptyState, and Toast primitives

EOF
)"
```

---

### Task 3: Apply skin to chrome (Sidebar, ThemeToggle, Landing, header)

**Files:**
- Modify: `src/client/components/ThemeToggle.tsx`
- Modify: `src/client/components/Sidebar.tsx`
- Modify: `src/client/components/MountLanding.tsx`
- Modify: `src/client/components/ContentArea.tsx` (header icons/emoji only)
- Modify: `src/client/styles/components.css` / `layout.css`
- Modify: `src/client/components/FileTree.tsx` (icons + `min-height: var(--tree-row-height)`)

**Interfaces:**
- Consumes: `Icon`, tokens
- Produces: emoji-free primary chrome; tree rows equal height (2i start)

- [ ] **Step 1: ThemeToggle** — replace ☀️/🌙 with `Icon name="sun"|"moon"`; keep `aria`/`title`.

- [ ] **Step 2: Sidebar** — replace 📚/🏠 with icons; ensure `.folder-row` / `.file-row` use `min-height: var(--tree-row-height); align-items: center`.

- [ ] **Step 3: MountLanding** — delete embedded `<style>`; move rules to `components.css` under `.landing-*`; replace emoji with `Icon`.

- [ ] **Step 4: ContentArea header** — remove 📁 / 📝 / 👁 emoji from headers; use Icon or plain text.

- [ ] **Step 5: FileTree icons** — folder/file Lucide icons instead of emoji spans where present.

- [ ] **Step 6: Visual smoke** — dark + light; landing; sidebar selection uses orange active token.

- [ ] **Step 7: Commit**

```bash
git add src/client/components src/client/styles
git commit -m "$(cat <<'EOF'
feat(ui): restyle chrome with icons and equal tree row height

EOF
)"
```

---

### Task 4: Folder switch skeleton (2a) + tree full height (2i finish)

**Files:**
- Modify: `src/client/App.tsx`
- Modify: `src/client/components/ContentArea.tsx`
- Modify: `src/client/styles/layout.css`
- Test: `tests/e2e/ui-batch1.spec.ts` (create)

**Interfaces:**
- Consumes: `Skeleton`, `selectedNode`, `loadChildren`
- Produces: When `selectedNode.type === 'folder'` and children not ready (`children == null` or explicit `folderLoading` flag), ContentArea shows `<Skeleton variant="folder" />` instead of stale previous FolderView/file content. Title/breadcrumb already reflect new node.

**Root cause to avoid:** Do not keep rendering previous file preview after folder click. Prefer: `isFolderView` true immediately; if `!selectedNode.children` (lazy), show skeleton while `loadChildren` runs.

- [ ] **Step 1: Write failing e2e**

```ts
// tests/e2e/ui-batch1.spec.ts
import { test, expect } from '@playwright/test'

test('2a: switching folder updates breadcrumb and does not keep previous file preview', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-notes"]')
  await page.click('.folder-list-row:has-text("daily.md")')
  await expect(page.locator('[data-testid="markdown-preview"]')).toBeVisible()

  await page.click('[data-testid="tree-node-notes"]') // back to folder — or click notes in breadcrumb/tree
  await expect(page.locator('[data-testid="folder-view"], [data-testid="folder-skeleton"]')).toBeVisible()
  await expect(page.locator('[data-testid="markdown-preview"]')).not.toBeVisible()
  await expect(page.locator('.folder-breadcrumb, .current-file')).toContainText('notes')
})
```

Add `data-testid="folder-skeleton"` on Skeleton folder variant.

- [ ] **Step 2: Run test — expect fail or flake on stale preview**

```bash
~/.bun/bin/bunx playwright test tests/e2e/ui-batch1.spec.ts -g "2a"
```

- [ ] **Step 3: Implement**

In `ContentArea` / `App`:
- On folder select, ensure `selectedNode` updates before/without waiting for file clear.
- Clear or ignore `currentPath` when entering folder view so file branch does not win.
- If folder `children` missing, call `loadChildren` and show skeleton.

Ensure sidebar `.sidebar` / `.file-list` flex full height (`min-height: 0; flex: 1`).

- [ ] **Step 4: Re-run e2e — pass**

- [ ] **Step 5: Commit**

```bash
git add src/client/App.tsx src/client/components/ContentArea.tsx src/client/styles tests/e2e/ui-batch1.spec.ts
git commit -m "$(cat <<'EOF'
fix: show folder skeleton on directory switch

EOF
)"
```

---

### Task 5: Media deep links (2h)

**Files:**
- Modify: `src/client/hooks/useFileContent.ts`
- Modify: `src/client/App.tsx`
- Modify: `src/client/components/ContentArea.tsx`
- Modify: `tests/e2e/ui-batch1.spec.ts`
- Fixtures: `tests/fixtures/docs/images/photo.png` (already present)

**Interfaces:**
- Consumes: `getFileType(path)`
- Produces: `selectFile(path)` sets `currentPath` for image/video **without** requiring text `content`; ContentArea routes to ImageViewer/VideoViewer **before** the `content === null` skeleton gate.

**Known bug:** In `ContentArea.renderContent`, this block runs before image/video checks:

```ts
if (loading || content === null) {
  return (/* skeleton */)
}
```

Binary files never get `content` string → eternal skeleton / blank.

- [ ] **Step 1: Failing e2e**

```ts
test('2h: deep link to image opens ImageViewer', async ({ page }) => {
  await page.goto('/images/photo.png')
  await expect(page.locator('.image-viewer img, [data-testid="image-viewer"]')).toBeVisible({ timeout: 10000 })
  await expect(page.locator('[data-testid="markdown-preview"]')).toHaveCount(0)
})
```

Add `data-testid="image-viewer"` on `ImageViewer` root.

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Fix `useFileContent`**

```ts
import { getFileType } from '../utils/fileType.js'

// inside loadFile/selectFile:
const ft = getFileType(path)
if (ft === 'image' || ft === 'video') {
  setCurrentPath(path)
  setContent('') // or keep null but ContentArea must not block
  setLoading(false)
  setError(null)
  return
}
```

Prefer empty string **or** ContentArea change: for image/video, skip content null gate:

```ts
const ft = filePath ? getFileType(filePath) : null
if (ft === 'image') return <ImageViewer ... />
if (ft === 'video') return <VideoViewer ... />
// then loading / content null skeleton for text types only
```

Do **both** path selection + render-order fix.

- [ ] **Step 4: App bootstrap** — when URL path is image/video, set `selectedNode` as file node (synthesize if missing from tree) and call `selectFile`.

- [ ] **Step 5: E2E pass**

- [ ] **Step 6: Commit**

```bash
git add src/client/hooks/useFileContent.ts src/client/App.tsx src/client/components/ContentArea.tsx src/client/components/ImageViewer.tsx tests/e2e/ui-batch1.spec.ts
git commit -m "$(cat <<'EOF'
fix: open image and video deep links without content gate

EOF
)"
```

---

### Task 6: SSE reload policy (2b) + scroll memory (2c)

**Files:**
- Create: `src/client/utils/scrollMemory.ts`
- Create: `src/client/components/ui/ExternalUpdateBanner.tsx`
- Modify: `src/client/App.tsx`
- Modify: `src/client/components/ContentArea.tsx`
- Optional unit: `src/client/utils/scrollMemory.test.ts` via `bun test`

**Interfaces:**
- Consumes: SSE `reload` / `tree-change`; ContentArea `unsaved`, `viewMode`
- Produces:
  - `getScroll(path: string): number | null`
  - `setScroll(path: string, top: number): void`
  - Banner props: `{ onReload: () => void, onDismiss: () => void }`
  - App/ContentArea: if preview or edit-clean → silent `loadFile` + restore scroll; if unsaved → set `externalUpdatePending` and show banner

- [ ] **Step 1: `scrollMemory.ts`**

```ts
const prefix = 'vmd_scroll:'

export function getScroll(path: string): number | null {
  try {
    const v = sessionStorage.getItem(prefix + path)
    if (v == null) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export function setScroll(path: string, top: number): void {
  try {
    sessionStorage.setItem(prefix + path, String(top))
  } catch {}
}
```

- [ ] **Step 2: bun test for scrollMemory**

```ts
import { test, expect } from 'bun:test'
import { getScroll, setScroll } from './scrollMemory.ts'

test('roundtrip scroll', () => {
  setScroll('notes/a.md', 120)
  expect(getScroll('notes/a.md')).toBe(120)
})
```

```bash
~/.bun/bin/bun test src/client/utils/scrollMemory.test.ts
```

- [ ] **Step 3: Wire scroll save/restore in ContentArea**

- On `content-body` scroll (preview): debounce `setScroll(filePath, el.scrollTop)`.
- After markdown content paints / silent reload: `el.scrollTop = getScroll(filePath) ?? 0` (rAF + one retry).

- [ ] **Step 4: External update banner + App SSE handler**

Lift or pass `unsaved` up: simplest approach — handle policy inside ContentArea by accepting `reloadToken` / calling `onExternalReload` props:

Option A (preferred minimal): App always calls `loadFile` on reload **only if** ContentArea reports `canSilentReload()` via ref/callback registry.

Option B: Move unsaved state to App (larger change) — avoid unless needed.

**Preferred:** ContentArea registers:

```ts
onReloadRequest?: (apply: () => void) => void
```

Or App passes `watchGeneration` and ContentArea decides:

Actually simplest: change App `handleSSEEvent`:

```ts
} else if (event.type === 'reload' && currentPath) {
  window.dispatchEvent(new CustomEvent('vmd:file-reload', { detail: { path: currentPath } }))
}
```

ContentArea listens:
- if `unsaved` → setShowBanner(true)
- else → `onSave` path: call provided `onSilentReload()` prop that invokes `loadFile`, then restore scroll

Add prop `onSilentReload: () => void` from App (`() => loadFile(currentPath!)`).

Banner **加载新版本** → `onSilentReload()` + clear unsaved local state carefully (reset editContent from new content on next effect).

- [ ] **Step 5: Manual check** — open md preview, edit file on disk, confirm silent refresh; with unsaved edits, confirm banner not clobber.

- [ ] **Step 6: Commit**

```bash
git add src/client/utils/scrollMemory.ts src/client/utils/scrollMemory.test.ts src/client/components/ui/ExternalUpdateBanner.tsx src/client/App.tsx src/client/components/ContentArea.tsx
git commit -m "$(cat <<'EOF'
feat: silent preview reload with scroll memory and edit conflict banner

EOF
)"
```

---

### Task 7: Prefs — sidebar resize (2d), sort memory (2e), hidden files (2f)

**Files:**
- Create: `src/client/utils/prefs.ts`
- Create: `src/client/utils/hiddenFiles.ts`
- Modify: `src/client/components/Sidebar.tsx`
- Modify: `src/client/components/FileTree.tsx`
- Modify: `src/client/components/FolderListView.tsx`
- Modify: `src/client/components/FolderGridView.tsx` / `FolderColumnView.tsx` if they sort independently
- Modify: `src/client/components/FolderView.tsx`
- Modify: `src/client/styles/layout.css`
- Modify: `tests/e2e/ui-batch1.spec.ts`

**Interfaces:**
- Consumes: `localStorage`
- Produces:
  - Keys: `vmd_sidebar_width`, `vmd_sort` (`JSON: { field: 'name'|'type'|'size'|'mtime', order: 'asc'|'desc' }`), `vmd_show_hidden` (`'1'|'0'`, default hidden)
  - `isDotfile(name: string): boolean` → `name.startsWith('.')`
  - `filterVisible(nodes: FileNode[], showHidden: boolean): FileNode[]`

- [ ] **Step 1: Implement utils + bun tests for `isDotfile` / filter**

```ts
export function isDotfile(name: string): boolean {
  return name.startsWith('.')
}

export function filterVisible<T extends { name: string }>(nodes: T[], showHidden: boolean): T[] {
  return showHidden ? nodes : nodes.filter(n => !isDotfile(n.name))
}
```

- [ ] **Step 2: Sidebar width resize**

- CSS: `.sidebar { width: var(--sidebar-width, 280px); }`
- On mount read `vmd_sidebar_width`, set CSS variable on `.app-layout` or `document.documentElement`.
- Handle on right edge: `pointerdown` → `pointermove` → clamp 200–480 → write localStorage.

- [ ] **Step 3: Hidden toggle**

- Add toolbar control on Sidebar header (`Icon eye/eye-off`) with `aria-label`.
- Pass `showHidden` into FileTree; filter nodes (and search results) with `filterVisible`.
- Persist toggle.

- [ ] **Step 4: Sort memory**

- Lift sort state from `FolderListView` local `useState` to read/write `vmd_sort` via `prefs.ts`.
- Apply same comparator in grid/column if they currently use unsorted `nodes` — at least list view must persist; grid/column should use same order for consistency.

- [ ] **Step 5: E2E**

```ts
test('2f: hidden files toggle', async ({ page }) => {
  // create depends on fixture — if no dotfile in fixtures, skip OR add tests/fixtures/docs/.secret.md in this task
})

test('2e: sort preference survives reload', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-notes"]')
  await page.click('[data-sort="name"]')
  await page.click('[data-sort="name"]') // desc
  await page.reload()
  await page.click('[data-testid="tree-node-notes"]')
  await expect(page.locator('[data-sort="name"]')).toHaveClass(/sorted/)
})
```

If no dotfile fixture exists, add `tests/fixtures/docs/.hidden-note.md` with one line of markdown (commit fixture).

- [ ] **Step 6: Commit**

```bash
git add src/client/utils/prefs.ts src/client/utils/hiddenFiles.ts src/client/components src/client/styles tests
git commit -m "$(cat <<'EOF'
feat: sidebar resize, sort memory, and hidden-files toggle

EOF
)"
```

---

### Task 8: Header polish + replace remaining showToast duplicates + regression e2e

**Files:**
- Modify: `src/client/components/ContentArea.tsx` (toolbar grouping already partially there — ensure desktop overflow uses “更多”, orange active buttons)
- Modify: `src/client/components/FolderView.tsx` — use shared `showToast`
- Modify: `tests/e2e/folder-view.spec.ts` if selectors broke
- Run full e2e

- [ ] **Step 1: Replace FolderView/ContentArea local `showToast` with ui/Toast**

- [ ] **Step 2: Light header polish** — primary actions visible; secondary in more menu on desktop if crowded; active buttons use `--active-bg` orange.

- [ ] **Step 3: Full e2e**

```bash
~/.bun/bin/bunx playwright test
```

Fix any regressions from icon/DOM changes (`tree-node-*` testids must remain).

- [ ] **Step 4: Commit**

```bash
git add src/client tests
git commit -m "$(cat <<'EOF'
chore(ui): finish batch-1 polish and stabilize e2e

EOF
)"
```

---

## Out of scope (do not implement in this plan)

- 2g Masonry + Lightbox gallery
- Command palette / major IA changes
- Per-folder sort memory
- Publishing npm package / LICENSE drive-by (unless user asks)

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Tokens / fonts / CSS split | 1 |
| Icons / Skeleton / Empty / Toast | 2 |
| Chrome restyle, no emoji | 3 |
| 2i row height | 3–4 |
| 2a folder skeleton | 4 |
| 2h media deep link | 5 |
| 2b SSE policy | 6 |
| 2c scroll session | 6 |
| 2d resize | 7 |
| 2e sort memory | 7 |
| 2f hidden files | 7 |
| Header/toolbar polish | 8 |
| 2g gallery | deferred |

---

## Self-review notes

- No TBD placeholders in tasks.
- 2h root cause documented (content-null gate ordering).
- Sort fields align with existing list UI (`name` / `type` / `size`); add `mtime` only if `FileNode` already exposes it — otherwise do not invent.
- Confirm `FileNode` shape before promising mtime sort; if absent, persist only existing keys.
