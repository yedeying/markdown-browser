# Markdown heading fold (preview-only) — Design

**Date:** 2026-08-27  
**Status:** Approved (user: preview-only, chevron toggle, sessionStorage, mobile-friendly)

## 1. Goals

- In markdown **preview**, each `h1–h6` can collapse its **section** (content until the next same-or-higher-level heading).
- Toggle via a **left chevron** only (heading click / TOC / anchors unchanged).
- Touch-friendly hit target (~44×44).
- Remember collapsed heading ids per file in **sessionStorage**.

## 2. Non-goals

- Editor / source folding syntax.
- Persistent localStorage across sessions.
- Changing TOC structure (TOC still lists all headings; jump into a collapsed section auto-expands ancestors).

## 3. Approach

Post-process DOM after `parseMarkdownPreview` (Approach A): wrap each heading + following siblings in a fold section. Do not change marked renderer nesting.

## 4. DOM shape

```html
<section class="md-fold" data-heading-id="{id}" data-level="{n}">
  <div class="md-fold-head">
    <button type="button" class="md-fold-toggle" aria-expanded="true" aria-label="折叠章节"></button>
    <h{n} id="{id}">…</h{n}>
  </div>
  <div class="md-fold-body">…</div>
</section>
```

Collapsed: add `md-fold--collapsed` on section, `aria-expanded="false"`, hide `.md-fold-body`.

## 5. Persistence

- Key: `vmd_md_fold:{filePath}` → JSON array of collapsed heading ids.
- No `filePath`: skip persistence (still allow ephemeral toggle).
- On re-render: apply saved ids after wrap.

## 6. Mobile

- Toggle is a real `<button>`; min touch target 44×44 via padding; does not capture pan on body.
- Visible chevron ~12–14px, centered in hit area.

## 7. Integration

- `MarkdownPreview` after `innerHTML = parse…`, call wrap + restore + click handler on `.md-fold-toggle`.
- Hash / TOC navigate: if target heading is inside collapsed folds, expand those sections before scroll.
