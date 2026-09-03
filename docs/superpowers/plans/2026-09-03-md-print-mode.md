# Markdown print mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or implement inline.

**Goal:** `@media print` shows only Markdown `.markdown-body` on white background; hide all app chrome.

**Architecture:** New `src/client/styles/print.css` imported from `main.tsx`; hide-list + expand folds via CSS.

**Tech Stack:** CSS `@media print`, existing Preact DOM classes

## Global Constraints

- CSS-only preferred; `beforeprint` only if fold expand needs it
- No print button
- Force white background / dark text

---

### Task 1: Add print.css and import

**Files:**
- Create: `src/client/styles/print.css`
- Modify: `src/client/main.tsx` (import print.css)

- [ ] Write print rules (hide chrome, white page, expand folds, full width body)
- [ ] Import in main.tsx
- [ ] Commit

### Task 2: Spec/plan docs already exist — mark done; manual note in commit

No automated test for print media.
