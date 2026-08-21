# JSONL / ST Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `.jsonl` browsable with ST chat bubbles when exports match the demo-backed schema, plus fix directory pruning, unknown-file plaintext opening, and sidebar width/wrapping.

**Architecture:** Client-side parse of JSONL text into either ST messages or generic lines; `ContentArea` picks `StChatPreview` or `JsonlLinePreview`. Server listing stops dropping folders/files that fall outside the old extension whitelist. Sidebar clamp and tree typography are preference/CSS fixes.

**Tech Stack:** Preact, TypeScript, existing Markdown pipeline (`marked` / `MarkdownPreview` helpers), Bun tests, Playwright.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-20-jsonl-st-preview-design.md`
- ST schema truth: `demo.jsonl` / `demo1.jsonl` (not the outdated absolute required fields in old `st_jsonl.md`)
- `mes` always Markdown with HTML escaped; no swipes UI; header used only for detection
- Non-empty `extra.reasoning` shown in a collapsible block (default collapsed) in ST bubbles
- Directory must appear if it has any on-disk children; unknown extensions listed and openable as UTF-8 text when possible
- Sidebar max width at least ~half viewport; tree names single-line ellipsis
- Do not commit unless the user explicitly asks
- Preserve unrelated uncommitted work; do not revert prior settings/UI commits
- TDD: failing test before production code for each behavioral change

## File map

| File | Responsibility |
| --- | --- |
| `src/client/utils/stJsonl.ts` | Parse/detect ST JSONL; escape HTML for mes |
| `src/client/utils/stJsonl.test.ts` | Detection tests using demos + negatives |
| `src/client/components/StChatPreview.tsx` | Chat bubble UI |
| `src/client/components/JsonlLinePreview.tsx` | Per-line JSON cards |
| `src/client/utils/fileType.ts` | `.jsonl` + unknown→text attempt types |
| `src/client/utils/prefs.ts` | `jsonlPreviewMode` pref; sidebar max |
| `src/client/components/ContentArea.tsx` | Wire previews + mode toggle |
| `src/server/routes/dir.ts` | List all files; keep non-empty dirs |
| `src/client/styles/*` | Chat bubbles, jsonl cards, tree ellipsis, code scroll |
| `st_jsonl.md` | Align docs with demo schema |

---

### Task 1: Directory listing — keep folders and unknown files

**Files:**
- Modify: `src/server/routes/dir.ts` (`listDir`, `buildTree`)
- Modify: `src/server/share.ts` if it duplicates the same extension filter for folder trees
- Test: `src/server/routes/dir.listing.test.ts` (create)

**Interfaces:**
- Produces: tree nodes include folders that only contain unknown extensions; unknown files appear as `type: 'file'`

- [ ] **Step 1: Write failing tests**

Create a temp dir with `only-jsonl/chat.jsonl` and assert `GET /api/files?path=&depth=2` includes the folder and the `.jsonl` file (after `.jsonl` may still be unknown to whitelist — assert folder presence even if file is listed as a generic file).

Also assert a folder containing only `weird.xyz` still appears and lists `weird.xyz`.

- [ ] **Step 2: Run tests — expect FAIL** (folder missing / file filtered)

Run: `bun test src/server/routes/dir.listing.test.ts`

- [ ] **Step 3: Implement**

In `listDir`:
- Always push directories (existing).
- For files: if extension in `SUPPORTED_EXTS`, push as today; **else still push** the file node (unknown).
- In `buildTree`: do not drop a folder solely because filtered children were empty; include folder when on-disk listing had children OR recursive children length > 0. Simplest correct approach: after changing `listDir` to include unknown files, empty-children prune only applies to truly empty dirs.

Mirror any duplicate filter in share folder listing / grep includes as needed for `.jsonl` search later (Task 4 can add `--include=*.jsonl`).

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Do not commit** unless user asks

---

### Task 2: Sidebar half-screen width + single-line names

**Files:**
- Modify: `src/client/utils/prefs.ts` (`SIDEBAR_WIDTH_MAX`, clamp)
- Modify: `src/client/utils/prefs.test.ts`
- Modify: `src/client/styles/layout.css` / `components.css` (tree row name rules)
- Modify: sidebar drag handler if it hardcodes 480

**Interfaces:**
- Produces: `clampSidebarWidth` allows ≥ ~50vw (cap with a generous pixel ceiling e.g. 1200)

- [ ] **Step 1: Failing tests** for clamp allowing values like 800 when previously max 480

- [ ] **Step 2: RED**

- [ ] **Step 3: Implement**

```ts
export const SIDEBAR_WIDTH_MAX = 1200 // hard ceiling
export function clampSidebarWidth(width: number, viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200): number {
  const max = Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.floor(viewportWidth * 0.5)))
  return Math.min(max, Math.max(SIDEBAR_WIDTH_MIN, width))
}
```

Ensure tree `.file-name` / folder labels use `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` and parent flex children have `min-width: 0`.

- [ ] **Step 4: GREEN**

---

### Task 3: Unknown files open as scrollable plaintext

**Files:**
- Modify: `src/client/utils/fileType.ts`
- Modify: `src/client/components/ContentArea.tsx`
- Modify: `src/client/styles/layout.css` (`.code-only-view` overflow)
- Test: `src/client/utils/fileType.test.ts` (create/extend)
- Optional e2e later

**Interfaces:**
- Produces: `getFileType` returns `'text'` for unknown extensions (client); binary still `'unsupported'` only after content sniff if you add it — **minimal path:** treat unknown extensions as `'text'` for editor routing; server already returns bytes as text for non-image/video. If content has `\u0000`, show unsupported empty state in ContentArea.

- [ ] **Step 1: Failing test** — unknown ext maps to editable text path; ContentArea code-only container scrolls (CSS assertion or component note)

- [ ] **Step 2: RED**

- [ ] **Step 3: Implement**

- Map unknown extensions to `'text'` instead of `'unsupported'` in `getFileType`.
- Keep images/videos detection first.
- In ContentArea when loading text, if `content.includes('\0')`, show unsupported.
- Fix `.code-only-view` / `.editor-wrapper` to `overflow: auto` / flex min-height 0 so CodeMirror host scrolls.

- [ ] **Step 4: GREEN**

---

### Task 4: ST JSONL detect/parse module

**Files:**
- Create: `src/client/utils/stJsonl.ts`
- Create: `src/client/utils/stJsonl.test.ts`
- Fixture reads: repo-root `demo.jsonl`, `demo1.jsonl`

**Interfaces:**
- Produces:

```ts
export type StHeader = { user_name: unknown; character_name: unknown; chat_metadata: object }
export type StMessage = {
  name: string
  is_user: boolean
  mes: string
  send_date: string
  extra: Record<string, unknown>
}
export type StParseOk = {
  ok: true
  header: StHeader | null
  messages: StMessage[]
  characterName: string | null  // first !is_user name
  userName: string | null       // first is_user name
}
export type StParseResult = StParseOk | { ok: false; reason: string }

export function parseStJsonl(text: string): StParseResult
export function escapeHtmlForMarkdown(mes: string): string  // strip/escape tags + CRLF → LF
```

- [ ] **Step 1: Write failing tests**

- `demo.jsonl` and `demo1.jsonl` → `ok: true`, header non-null, messages.length ≥ 1
- Missing `mes` on a message line → `ok: false`
- Pure array of `{a:1}` lines → `ok: false`
- `escapeHtmlForMarkdown('<div>x</div>')` does not retain raw tags

- [ ] **Step 2: RED**

- [ ] **Step 3: Implement** per design §2

- [ ] **Step 4: GREEN**

---

### Task 5: Preview components + ContentArea wiring

**Files:**
- Create: `src/client/components/StChatPreview.tsx`
- Create: `src/client/components/JsonlLinePreview.tsx`
- Modify: `src/client/components/ContentArea.tsx`
- Modify: `src/client/utils/fileType.ts` / `editorLang.ts` / server exts — add `.jsonl`
- Modify: `src/client/utils/prefs.ts` — `jsonlPreviewMode: 'st' | 'jsonl'`
- Modify: `src/client/styles/components.css` — bubbles + line cards
- Modify: `src/client/utils/nodeIcon.ts` — jsonl icon if needed
- Test: prefs + optional Playwright in `tests/e2e/ui-batch1.spec.ts` or new `jsonl-preview.spec.ts`

**Interfaces:**
- Consumes: `parseStJsonl`, `usePref('jsonlPreviewMode')`
- Produces: toolbar toggle only when `parseStJsonl(content).ok`

- [ ] **Step 1: Failing e2e or unit**

E2E sketch: serve fixture dir containing `demo.jsonl`; open file; expect `[data-testid="st-chat-preview"]`; click toggle; expect `[data-testid="jsonl-line-preview"]`.

- [ ] **Step 2: RED**

- [ ] **Step 3: Implement components**

`StChatPreview`: map messages to bubbles; reuse markdown rendering (extract small helper or render via existing MarkdownPreview with preprocessed mes). If `extra.reasoning` is a non-empty string, render a `<details>` (or equivalent) block default-closed, labeled e.g. 「思考过程」, with the same Markdown+escape pipeline as `mes`.

`JsonlLinePreview`: split lines; try JSON.parse; pretty print; error rows keep raw text.

`ContentArea`: if path ends with `.jsonl` and viewMode preview → choose ST vs lines based on detect + pref.

- [ ] **Step 4: GREEN + `bun run build`**

---

### Task 6: Update `st_jsonl.md` + regression pass

**Files:**
- Modify: `st_jsonl.md`
- Run: `bun test`, focused Playwright, `bun run build`

- [ ] **Step 1: Rewrite schema sections** to match design (optional header; required message fields; optional swipes/title)

- [ ] **Step 2: Full unit suite green**

- [ ] **Step 3: Manual check list** — directory with only jsonl visible; open demo as chat; toggle to lines; drag sidebar past old 480; open `.xyz` text file scrolls

- [ ] **Step 4: Do not commit** unless user asks

---

## Self-review checklist

- [x] Spec coverage: ST detect, dual preview, toggle+pref, directory, unknown text, sidebar, doc update
- [x] No placeholders
- [x] Types consistent (`StParseResult`, pref key)
- [x] Demos are the positive fixtures
