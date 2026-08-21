# Gallery (2g) — Masonry + Lightbox Design

**Date:** 2026-08-21  
**Status:** Approved for implementation planning  
**Related:** Deferred item **2g** from `docs/superpowers/specs/2026-08-19-ui-optimization-design.md`

---

## 1. Goals & non-goals

### Goals

- Add a **瀑布流 (masonry)** folder view for browsing media-heavy directories.
- Show the masonry view toggle **dynamically** only when the current folder has images or videos.
- Provide a shared **Lightbox** (“橱窗”) for immersive viewing with **left/right** navigation across media in the same folder.
- From **list / grid / column / masonry**, opening an image or video enters the same Lightbox (not the old single-file-only `ImageViewer` path for in-folder browsing).
- Deep-link / single-file media open uses the same Lightbox shell (playlist length may be 1).

### Non-goals

- Server-side thumbnail generation or resizing.
- EXIF, albums, slideshow timer.
- Auto-switching into masonry when entering a folder.
- Separate filmstrip view as a primary mode (discussed historically; not selected).
- Changing list/grid/column **layout** semantics for non-media files.

---

## 2. View toolbar

Order: **列表 | 网格 | 列 | 瀑布流**

| Condition | Behavior |
| --- | --- |
| Current folder’s **visible** children include ≥1 image **or** video | Show「瀑布流」button |
| No image and no video among visible children | Hide「瀑布流」 |
| Preference is `masonry` but folder has no media | Fall back to **grid** for this folder (do not leave UI on a missing mode) |

Visibility uses the same hidden-file filter as the rest of the folder view (`showHidden`).

Media detection reuses `getFileType` → `'image' | 'video'`.

---

## 3. Masonry view

### Contents

| Shown | Hidden |
| --- | --- |
| Folders (drill-in) | Non-media files (`.md`, code, etc.) |
| Image files | |
| Video files | |

### Layout

- Multi-column masonry (uneven heights). Acceptable first cut: fixed column width + natural/aspect-aware tile height with `object-fit: cover` (or equivalent light layout).
- Folder tiles: icon/name; click → navigate into folder (existing `onSelect` folder behavior).
- Media tiles: thumbnail (images via existing `assetUrl`; videos: poster frame if cheap, else placeholder + play affordance).
- Click media → open Lightbox with playlist = all images+videos in this folder (same sort order as current folder sort).
- Keyboard (parity with grid): `j`/`k` or arrows move **weak focus**; `Enter` opens (folder navigate / media Lightbox). Selection mode / context menu behave like grid cards where applicable.

### Prefs

- Extend `folderView` (or equivalent pref) with `'masonry'`.
- Card size control: reuse grid card size prefs if practical; otherwise masonry uses one default density in v1.

---

## 4. Lightbox (左右选图)

### Shell

- Full-viewport overlay above folder UI.
- Center: `<img>` or `<video controls>` for current item.
- Optional chrome: filename, close control, prev/next affordances (keyboard is primary).

### Playlist

- Built from the **current folder’s** visible image + video nodes, in the active sort order.
- Opening from list/grid/column/masonry starts at the clicked/focused item index.
- Deep link to a single media file: playlist may be `[that file]` only unless the app already has folder context and can expand (v1: length 1 is OK).

### Controls

| Input | Action |
| --- | --- |
| `←` / `h` | Previous media |
| `→` / `l` | Next media |
| Optional: touch swipe | Same as prev/next |
| `Esc` / click backdrop | Close; return to the folder view that was underneath |
| While open | Block folder/tree keyboard nav (same class of “overlay blocking” as dialogs) |

### Integration

- Replace in-folder “open image/video → only `ImageViewer` in content area” with Lightbox for folder browsing.
- Keep or thin-wrap `ImageViewer`/`VideoViewer` if still useful inside Lightbox; avoid two divergent UIs long-term.

---

## 5. List / grid / column

- **Layouts unchanged** (all file types still listed as today).
- **Open image/video** → Lightbox with folder media playlist (not a one-off dead-end viewer without siblings).
- Open folder / non-media → existing behavior.

---

## 6. Testing

- Unit: “folder has media” helper; playlist ordering; masonry filter (folders+media only).
- E2E (happy path): folder with images → 瀑布流 button visible → enter masonry → click image → Lightbox → arrow to next → Esc back.
- Folder without media → no 瀑布流 button.
- List/grid/column click image → Lightbox with siblings when multiple media exist.

---

## 7. Implementation notes (non-binding)

- Likely touch points: `FolderView` toolbar + view switch, new `FolderMasonryView` (or grid variant), new `MediaLightbox`, `prefs`/`folderView` type, `ContentArea`/`App` open-media path, overlay blocking helpers in `keyboardNav`.
- YAGNI: no virtualized masonry required for v1 unless folders routinely exceed comfortable DOM size.

---

## 8. Decisions log

| Topic | Decision |
| --- | --- |
| Scope | Full 2g: masonry + lightbox |
| Masonry entry | Dynamic 4th toolbar button when folder has image **or** video |
| Auto masonry | No |
| Non-media in masonry | Hidden (folders + media only) |
| List/grid/column | Layout same; media open → shared Lightbox |
| Filmstrip mode | Not in this track |
