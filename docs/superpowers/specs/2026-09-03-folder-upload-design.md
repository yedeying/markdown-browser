# Folder upload (chunked, resumable) — Design

**Date:** 2026-09-03  
**Status:** Approved for implementation planning  
**Related:** `FolderView.tsx` (toolbar / context menus), `fsApi.ts`, `src/server/routes/dir.ts` (`assertSafe`, reserved names), existing mkdir/touch/save write paths

---

## 1. Goals & non-goals

### Goals

- In **folder mode**, upload files into the **current folder** (or explicitly chosen target directory) with:
  - **Drag-and-drop** onto the folder view
  - **Toolbar** 「上传」button (file + directory picker)
  - **Context menu** 「上传到此处」on folder blank area (and optionally on a folder row → upload into that folder)
- Support **directory trees** (preserve relative paths under the drop/select root).
- **No extension / MIME restrictions** (binary allowed); still block reserved config names (`.vmd-config.json`, share store, etc.) via existing guards.
- **Large files (~1GB+)**: chunked upload + **resume after interrupt**; small files may use a single-shot path.
- **Name conflicts**: prompt **跳过 / 覆盖 / 重命名**, with “apply to all” for batches.
- **UI**: collapsible **bottom-right upload status panel** (summary when collapsed; per-file progress when expanded).

### Non-goals

- Peer-to-peer / cloud sync
- Virus scanning
- Changing `/api/save` text-editor semantics (upload uses dedicated FS upload APIs)
- Uploading outside the served mount (`assertSafe`)
- First-version draggable panel position

---

## 2. Entry points & target path

| Entry | Target directory |
|-------|------------------|
| Toolbar 「上传」 | Current folder view path (`node.path` / column browse path) |
| Blank-area context menu 「上传到此处」 | Same as current folder |
| Folder-row context menu 「上传到此文件夹」(optional but recommended) | That folder’s path |
| Drag-drop onto folder view | Current folder; if drop hits a folder row, prefer that folder as target |

Collect files:

- `<input type="file" multiple>` and `webkitdirectory` for folder pick
- `DataTransferItemList` + `webkitGetAsEntry()` for drag trees

Relative path for each file: `targetDir + '/' + relativePathFromPicker` (normalize `\` → `/`, reject `..`).

---

## 3. Transport protocol

### 3.1 Thresholds (defaults, tunable constants)

| Constant | Default | Meaning |
|----------|---------|---------|
| `SMALL_FILE_MAX` | 8 MiB | Below → single-shot upload |
| `CHUNK_SIZE` | 4 MiB | Chunk payload size |
| `MAX_FILE_SIZE` | 2 GiB | Soft cap (reject with clear error; disk may fail earlier) |
| `UPLOAD_CONCURRENCY` | 2 | Parallel file uploads |
| `CHUNK_RETRIES` | 3 | Per-chunk automatic retries with backoff |

### 3.2 Small file — single shot

`POST /api/fs/upload`

- Headers: `Content-Type: application/octet-stream`, `X-Vmd-Upload-Path: <relPath>`, optional `X-Vmd-Upload-Overwrite: 1`
- Body: raw bytes
- Response: `{ ok: true, path }` or conflict `{ ok: false, code: 'EXISTS' }`

### 3.3 Large file — chunked session

1. **`POST /api/fs/upload/init`**  
   Body JSON: `{ path, size, overwrite?: boolean }`  
   Response: `{ uploadId, chunkSize, received: number[] }`  
   - If a compatible incomplete session exists for the same `path`+`size`, **reuse** and return already-received chunk indexes (resume).

2. **`PUT /api/fs/upload/chunk`**  
   Query or headers: `uploadId`, `index` (0-based)  
   Body: chunk bytes  
   Response: `{ ok: true, index }`  
   Idempotent: re-PUT of an already-received index succeeds.

3. **`POST /api/fs/upload/complete`**  
   Body: `{ uploadId }`  
   Server verifies total size / chunk coverage, fsyncs, **rename** into final path (overwrite if flagged), deletes session.  
   Response: `{ ok: true, path }`

4. **`DELETE /api/fs/upload/session`** (optional)  
   Cancel / abandon: `{ uploadId }` — delete temp parts.

### 3.4 Server storage

- Staging under mount-scoped hidden dir, e.g. `.vmd-upload/<uploadId>/` with `meta.json` + `part-00000`…
- Never list `.vmd-upload` in normal tree listings (treat like reserved / ignore).
- On complete: write to `path.tmp` then rename to `path` (atomic where FS allows).
- TTL: abandon sessions older than e.g. 48h on next init or periodic cleanup.

### 3.5 Safety

- All paths through existing `assertSafe` / `anyReserved` / config-guard.
- Auth: same as other mutating FS routes (password cookie / share write token).
- No MIME/extension allowlist.

---

## 4. Conflict UX

When `EXISTS` and user has not chosen overwrite:

1. Modal: file relative path + **跳过 / 覆盖 / 重命名**  
2. Optional checkbox: **应用到其余冲突**  
3. Rename: suggest `name (1).ext` until free (client proposes, server still validates).

---

## 5. Client architecture

### 5.1 Upload manager (module)

- Queue of tasks: `{ id, relativePath, file, size, status, progress, error, uploadId? }`
- States: `queued | uploading | paused | done | error | cancelled | skipped`
- API: `enqueue(files, targetDir)`, `retry(id)`, `cancel(id)`, `clearFinished()`
- AbortController per in-flight request; cancel aborts fetch; resume via init `received[]`

### 5.2 Status panel (bottom-right)

- Fixed position, above safe area; z-index above folder chrome, below modal/lightbox if needed (or above everything except modal).
- **Collapsed**: one bar — `上传中 3/12 · 42%` or `2 失败` ; chevron to expand; close when idle.
- **Expanded**: scrollable list of tasks with progress bar; actions: 取消 / 重试 / 清除已完成.
- Appears when queue non-empty; on all-success auto-collapse; failures stay until cleared.
- No drag reposition in v1.

### 5.3 FolderView wiring

- Drop zone: `onDragOver` preventDefault + highlight; `onDrop` → enqueue
- Toolbar button next to 「+ 文件」
- `buildBgCtxMenuItems` / folder row menu: 「上传到此处」→ hidden file input click
- After successful uploads: `loadChildren(parent, true)` (and existing SSE refresh)

---

## 6. Share / multi-mount

- Use existing `getApiPrefix` so `/m/<alias>` and share prefixes work.
- Share links: only if share already allows writes (same as mkdir/save); otherwise hide upload UI.

---

## 7. Testing

- Unit: path join / rename suggestion / chunk index math / conflict apply-all
- Server: small upload; chunked init→chunk→complete; resume with partial `received`; reserved path rejected; overwrite
- E2E (smoke): folder view upload button creates a small fixture file (optional if file picker hard to automate — prefer API-level + unit)

---

## 8. Success criteria

- User can upload a nested folder of mixed binaries via drag, button, or context menu
- A ≥50MB file survives refresh mid-upload and can resume (same path+size session)
- Interrupt/retry works from the status panel
- Conflict modal offers skip/overwrite/rename (+ apply to all)
- Status panel collapses/expands; does not block primary navigation

---

## 9. Out of scope / follow-ups

- Parallel chunk uploads within one file
- Panel drag position
- Bandwidth throttling UI
- Streaming zip import
