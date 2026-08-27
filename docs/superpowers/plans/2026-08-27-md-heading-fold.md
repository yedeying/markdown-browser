# Markdown heading fold — Implementation Plan

> **For agentic workers:** TDD. Each task = failing test → minimal impl → pass.

**Goal:** Preview-only heading section collapse with chevron + sessionStorage.

**Files:**
- Create `src/client/utils/mdHeadingFold.ts` + `mdHeadingFold.test.ts`
- Modify `src/client/components/MarkdownPreview.tsx`
- Modify `src/client/styles/markdown.css`

## Task 1: Pure wrap + section boundaries

**Test:** Given a container with `h2`, `p`, `h3`, `p`, `h2`, wrap so first h2’s body includes h3-section; second h2 is sibling.

**Impl:** `wrapMarkdownHeadingFolds(root: HTMLElement): void`

## Task 2: sessionStorage get/set

**Test:** save/load collapsed id set keyed by filePath; empty path no-ops.

## Task 3: applyCollapsed + toggle helpers

**Test:** apply ids adds `md-fold--collapsed`; toggle updates class + aria + storage.

## Task 4: Wire MarkdownPreview + CSS

Call wrap/restore after parse; delegate click on `.md-fold-toggle`; expand ancestors on hash if present.

## Task 5: Verify

`bun test src/client/utils/mdHeadingFold.test.ts` + `bun run build`
