# Folder Upload Implementation Plan

> **For agentic workers:** Implement task-by-task. Spec: `docs/superpowers/specs/2026-09-03-folder-upload-design.md`

**Goal:** Folder-mode upload with drag/toolbar/context, chunked resume for large files, collapsible BR status panel.

**Architecture:** Server staging under `.vmd-upload/`; client upload manager + panel; FolderView wires entries.

**Tech Stack:** Hono, Bun fs, Preact hooks

## File map

| File | Role |
|------|------|
| `src/server/upload-sessions.ts` | Session/chunk helpers |
| `src/server/routes/dir.ts` | HTTP routes + ignore `.vmd-upload` |
| `src/server/routes/dir.upload.test.ts` | Server tests |
| `src/client/utils/uploadPaths.ts` | Join/normalize/rename suggest |
| `src/client/utils/uploadManager.ts` | Queue, concurrency, retry |
| `src/client/utils/fsApi.ts` | Upload API methods |
| `src/client/components/UploadStatusPanel.tsx` | BR collapsible UI |
| `src/client/components/UploadConflictModal.tsx` | Skip/overwrite/rename |
| `src/client/components/FolderView.tsx` | Wire entries + drop zone |
| `src/client/styles/components.css` | Panel styles |

---

### Task 1: Server upload — DONE

- [x] `upload-sessions.ts` (init/chunk/complete/single/rename)
- [x] Routes on `dir.ts`; `.vmd-upload` in `IGNORE_DIRS`
- [x] `dir.upload.test.ts`

### Task 2: Client manager + paths — DONE

- [x] `uploadPaths.ts` + unit tests
- [x] `fsApi` upload methods
- [x] `uploadManager.ts` (concurrency 2, chunk resume, conflict handler)

### Task 3: Panel + conflict UI — DONE

- [x] `UploadStatusPanel.tsx`
- [x] `UploadConflictModal.tsx`
- [x] CSS

### Task 4: FolderView wiring — DONE

- [x] Drag-drop (folder-row target preferred)
- [x] Toolbar 上传 menu (files / folder)
- [x] Context: 上传到此处 / 上传到此文件夹
- [x] Refresh via `loadChildren(parent, true)` on file done

### Task 5: Verify

- [x] `bun test` (unit — upload paths + server upload)
- [x] `bun run build`
