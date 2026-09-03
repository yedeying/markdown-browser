# Markdown print mode (browser print)

**Date:** 2026-09-03  
**Status:** Approved for implementation planning  
**Related:** `MarkdownPreview.tsx` (`data-testid="markdown-preview"`, `.markdown-body`), `ContentArea.tsx`, `layout.css` / `markdown.css`

---

## 1. Goals & non-goals

### Goals

- When the user prints via the **browser** (`Cmd/Ctrl+P` / system print), a **Markdown preview** page renders as:
  - **Pure white** page background
  - **Only** the rendered Markdown body (`.markdown-body[data-testid="markdown-preview"]`)
  - **No** app chrome: sidebar, content header, TOC, toolbars, editor panes, overlays, floating buttons, etc.
- Implementation: **`@media print` CSS only** (approach A) — no print button, no DOM surgery, no separate print window.

### Non-goals

- In-app「打印」button or custom print dialog
- Changing print behavior for non-Markdown views (folder, image, jsonl, editor-only) beyond “hide chrome; if no preview root, little/nothing useful prints”
- PDF export API, server-side rendering
- Multi-column newspaper layouts or custom page headers/footers (browser defaults OK)

---

## 2. Behavior

| Situation | Print result |
|-----------|----------------|
| Markdown **preview** visible (single-file or preview pane) | White page + `.markdown-body` only |
| Markdown **edit** dual-pane (source + preview) | Hide source pane / headers; keep preview body only if present |
| Folder / image / video / jsonl / login | Hide shell; no Markdown body → effectively empty or residual (acceptable) |

**Theme:** Force light print colors (`background: #fff`, dark text) regardless of `data-theme` / system dark mode (`print-color-adjust: exact` where needed so backgrounds stay white).

**Reading width:** Remove `max-width` / centering constraints on the preview root so the body uses the printable page width.

**Heading folds:** Hide `.md-fold-toggle`. **Expand** collapsed fold sections for print (CSS: override `.md-fold--collapsed` body `display` so collapsed content is visible on paper). Prefer CSS-only expand; if impossible without `!important` wars, a tiny `beforeprint`/`afterprint` class toggle on `documentElement` is allowed as a fallback — still no chrome DOM moves.

---

## 3. CSS strategy

Add a dedicated print block (prefer `src/client/styles/print.css` imported from the main stylesheet entry, or a clear `@media print` section at the end of `layout.css` / global entry).

### Hide chrome (non-exhaustive; implementer to match current DOM)

Examples already in the tree:

- `.sidebar`, `.sidebar-resize-handle`, `.sidebar-overlay`
- `.content-header`, `.header-actions`, `.hamburger-btn`
- `.toc-panel`
- `.editor-pane`, `.pane-header`, `.editor-view` chrome (keep preview subtree)
- `.folder-toolbar`, `.folder-selection-bar`, modals, `.ctx-menu`, `.bottom-sheet`, `.media-lightbox-overlay`, toasts, settings/share overlays

Pattern: either

1. **Hide-list:** `display: none !important` on chrome selectors; make ancestors of `.markdown-body` transparent/static so the body flows; or  
2. **Show-only:** hide everything under `body` then re-show `.markdown-body` and required ancestors (`visibility` / `display` trick).

Prefer the approach that reliably leaves a single continuous document flow without blank first pages.

### Body / page

```css
@page { margin: 12mm; }
@media print {
  html, body {
    background: #fff !important;
    color: #111 !important;
  }
  /* preview root: full width, white, no app chrome shadows */
}
```

---

## 4. Files (expected)

| File | Change |
|------|--------|
| `src/client/styles/print.css` (new) or global `@media print` | Print rules |
| Main CSS import (e.g. `main.tsx` / `styles/index`) | Import print stylesheet |
| Optional: `MarkdownPreview` / `App` | Only if fold-expand needs `beforeprint` class |

No e2e required for print media (hard in CI); optional unit/CSS smoke not required. Manual check: open an `.md` → Cmd+P → preview pane shows white body only.

---

## 5. Success criteria

- Printing an open Markdown preview: no sidebar/TOC/header in print preview; white background; readable dark text
- Folded headings’ content still appears on the printed page; fold chevrons do not
- PR/`main` CI unchanged; no new user-facing button

---

## 6. Out of scope / follow-ups

- Print button in UI
- “Print selection only”
- Per-file print CSS themes
