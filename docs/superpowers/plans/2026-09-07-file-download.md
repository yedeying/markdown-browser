# File Download Implementation Plan

> **For agentic workers:** Implement task-by-task. Spec: `docs/superpowers/specs/2026-09-07-file-download-design.md`

**Goal:** Single-file download + multi-path recursive zip from folder context menu and file preview UI.

**Architecture:** Dir-mode `GET /api/download/*` for single files; `POST /api/download/zip` streams a zip. Client uses existing `downloadUrl` for singles and blob download for zip.

**Tech Stack:** Hono, Bun/`fflate` or `archiver` for zip, Preact

## File map

| File | Role |
|------|------|
| `src/server/download-zip.ts` | Walk paths, build zip entries, limits |
| `src/server/routes/dir.ts` | GET download + POST zip routes |
| `src/server/routes/dir.download.test.ts` | Server tests |
| `src/client/utils/fsApi.ts` | `downloadZip(paths)` helper |
| `src/client/utils/download.ts` | Trigger `<a download>` / blob save |
| `src/client/components/FolderView.tsx` | Ctx menu 「下载」 |
| `src/client/components/ContentArea.tsx` | Header + more menu 「下载」 |

### Task 1: Server single + zip
### Task 2: Client helpers + FolderView
### Task 3: ContentArea preview entry
### Task 4: Verify `bun test` + build
