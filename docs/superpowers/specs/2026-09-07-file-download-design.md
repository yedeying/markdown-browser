# File download (single + multi zip) — Design

**Date:** 2026-09-07  
**Status:** Approved — implemented  
**Related:** `downloadUrl` / share `/api/download`, `FolderView` context menus, `ContentArea` header / more menu

---

## 1. Goals

- **Directory mode**: context-menu download for one or many selected items.
- **Multi-select / folders**: server builds a **zip** (folders included **recursively**).
- **File preview**: download entry in the top-right actions (desktop) and the “更多” menu (mobile).
- Reuse existing path safety (`assertSafe` / reserved guards / share prefix rules).

## 2. Non-goals

- Resume / chunked download UI
- Cloud offload
- Changing share-link download semantics beyond aligning disposition headers
- Client-side JSZip packing

## 3. Protocol

### 3.1 Single file

`GET /api/download/<relPath>`

- Same auth as other FS reads; mount / share prefixes via existing `getApiPrefix` / share routes.
- Response: raw bytes, `Content-Type` by extension (or octet-stream),  
  `Content-Disposition: attachment; filename="<basename>"` (RFC 5987 `filename*` when needed).
- Directories: **404** on this route (use zip API instead).
- Reserved / staging paths: same 403/404 as asset.

Also register (or keep) the share mirror: `GET /share/:token/api/download/*` (already exists — keep behavior consistent).

### 3.2 Multi-path zip

`POST /api/download/zip`

- Body JSON: `{ paths: string[] }` (1+ relative paths; files and/or folders).
- Server:
  - Normalize / reject `..` / reserved.
  - Expand folders recursively; skip ignored dirs (same IGNORE set as listing where sensible).
  - Stream a zip (`application/zip`) with `Content-Disposition: attachment; filename="download.zip"`  
    (or `vmd-<date>.zip` / first-name-based when a single top folder is selected).
  - Zip entry paths: relative to the common parent of selected roots (or each root’s basename when mixed).
- Soft limits (reject 400 with clear message): e.g. max **5000** entries or **2 GiB** uncompressed estimate — tune in impl constants.
- Share mode: only if share already allows the underlying reads; otherwise hide UI (same as write-gated features). Guests on read-only shares: allow download of shared tree only (token-scoped).

## 4. Client UX

| Entry | Behavior |
|-------|----------|
| Folder row / multi ctx menu 「下载」 | 1 file → `GET download`; else → `POST zip` then blob download |
| Blank ctx | no download (nothing selected) |
| File preview header | Desktop: 「下载」 button next to share/actions; Mobile more menu: 「下载」 |
| Selection bar (optional) | Same as ctx if selection non-empty — nice-to-have; not required v1 |

- Toast on zip start for large selections; error toast on failure.
- `downloadUrl(path)` already exists — wire single-file through it once dir route exists.
- Zip: `fetch` + blob URL + temporary `<a download>` (must send cookies for auth).

## 5. Server stack

- Prefer **streaming** zip (e.g. `archiver` or equivalent Bun-friendly lib) — do not buffer entire archive in memory.
- Unit tests: single download disposition; zip of file+folder; reserved path rejected; empty paths 400.

## 6. Success criteria

- Right-click one file → browser download with original name.
- Multi-select files + folders → one zip containing recursive folder contents.
- Preview header/more menu downloads current file.
- Auth / mount / share prefixes work; reserved config files not downloadable.

## 7. Out of scope / follow-ups

- Progress bar for huge zips  
- Password-protected zip  
- Folder-view toolbar bulk download button (can add later)
