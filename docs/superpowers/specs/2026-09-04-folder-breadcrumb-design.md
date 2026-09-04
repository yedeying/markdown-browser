# Folder breadcrumb visual polish — Design

**Date:** 2026-09-04  
**Status:** Approved (approach A)  
**Scope:** Folder view breadcrumb only (`FolderBreadcrumb` + `.folder-breadcrumb*`). File-view breadcrumb unchanged.

## Goals

- Clearer hierarchy: ancestors vs current location
- Align with existing folder toolbar / list chrome (no new visual language)
- Keep current click/navigate behavior; no deep-path collapse

## Non-goals

- File preview breadcrumb restyle
- Middle-ellipsis overflow menu
- Drag-drop onto segments

## Design (approach A → arrow trail)

1. **Bar:** Secondary strip; horizontal scroll if path is long.
2. **Segments:** Chevron / arrow shapes via `clip-path` (notch left, tip right), slightly overlapped.
3. **Root:** Flat left edge + home icon; arrow tip on the right.
4. **Ancestors:** `var(--th-bg)` fill, muted text; hover darkens.
5. **Current:** Accent-soft fill, stronger text weight; keeps arrow tip.
6. **A11y:** Clickable ancestors are `<button>`; current is non-interactive with `aria-current="page"`.

## Success

- At root: only root label (emphasized), no fake separator
- Nested path: muted ancestors, strong current, clear hover affordance
- Light/dark themes both readable using existing CSS variables
