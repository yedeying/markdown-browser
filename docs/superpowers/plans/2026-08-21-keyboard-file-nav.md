# Keyboard File Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or execute inline. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Arrow keys + hjkl navigate/open files in sidebar tree and folder list/grid/column views.

**Architecture:** Shared `keyboardNav.ts` helpers; listeners in `FileTree` (level 0) and `FolderView` / `FolderColumnView`; grid uses focus-then-Enter. Skip when typing or overlays open; skip tree nav when `.folder-view` is mounted.

**Tech Stack:** Preact hooks, existing `onSelect` / column click semantics, Bun test, Playwright optional.

## Global Constraints

- Open on move except grid (Enter).
- Ignore input/textarea/contenteditable/CodeMirror and dialogs/menus/sheets.
- Disable when `selectionMode` in folder view.
- Do not commit unless user asks.
- Spec: `docs/superpowers/specs/2026-08-21-keyboard-file-nav-design.md`

---

### Task 1: `keyboardNav` utils + unit tests

**Files:** Create `src/client/utils/keyboardNav.ts`, `src/client/utils/keyboardNav.test.ts`

- [ ] Implement `isTypingTarget(target)`, `isOverlayBlocking()`, `normalizeNavKey(e) → 'up'|'down'|'left'|'right'|'enter'|null`, `clampIndex`, `flattenVisibleTree(nodes, expanded, opts)`, `parentPath(path)`, `scrollNavTarget(el)`
- [ ] Tests for flatten order (respect expanded + compact single-child chain), clamp, typing target, key normalize
- [ ] Do not commit

### Task 2: FileTree keyboard

**Files:** Modify `FileTree.tsx` (level === 0 effect only)

- [ ] Window keydown: skip if typing/overlay/folder-view present
- [ ] down/up: move in flattenVisibleTree, onSelect, scrollIntoView
- [ ] right: expand folder or select first child; left: collapse or select parent
- [ ] Include root path `''` only if Sidebar wires it — prefer navigating FileTree nodes only (root row optional; skip root for v1 if awkward)
- [ ] Do not commit

### Task 3: Folder list + grid + column

**Files:** `FolderView.tsx`, `FolderGridView.tsx`, `FolderCard.tsx` (focus class), `FolderColumnView.tsx`, CSS

- [ ] List: j/k open neighbor in `children`
- [ ] Grid: `focusPath` state; j/k/h/l move in 2D by column count from CSS/grid; Enter opens; style `.folder-card.kb-focus`
- [ ] Column: listener inside column view; j/k in active column; l/h column stack like click
- [ ] Skip if selectionMode / modal / ctxMenu / bottomSheet / typing
- [ ] E2E optional smoke; unit tests cover helpers
- [ ] Do not commit
