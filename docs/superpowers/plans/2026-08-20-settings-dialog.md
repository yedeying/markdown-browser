# Settings Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent settings dialog for appearance, reading, file browsing, editor sizing, and restart-based mount mode switching.

**Architecture:** A typed local preference store owns browser settings and synchronizes mounted Preact components. Root CSS variables apply appearance settings without component coupling. Mount mode remains a server concern: `MountManager` persists startup intent and the CLI resolves it before starting the server.

**Tech Stack:** Preact, TypeScript, CSS custom properties, Hono, Bun tests, Playwright.

## Global Constraints

- Preserve all existing uncommitted Batch 1 UI work.
- Use Lucide SVG icons; do not add emoji UI.
- Local settings update immediately except mount mode, which applies after restart.
- Single-file preview does not expose mount or directory settings.
- Do not add an editor line-wrapping preference in this batch.
- Do not commit unless the user explicitly asks.

---

### Task 1: Typed local preference store

**Files:**
- Modify: `src/client/utils/prefs.ts`
- Create: `src/client/utils/prefs.test.ts`
- Create: `src/client/hooks/usePref.ts`

**Interfaces:**
- Produces: `PrefKey`, `PrefValues`, `getPref(key)`, `setPref(key, value)`, `subscribePref(key, listener)`, `resetLocalPrefs()`, and `usePref(key)`.
- Preserves: existing sidebar, sort, and hidden-file wrapper functions.

- [ ] **Step 1: Write failing tests**

Test typed defaults, stored-value validation, same-page subscriber notification, unsubscribe, and deletion of only `vmd_*` keys.

- [ ] **Step 2: Verify RED**

Run `bun test src/client/utils/prefs.test.ts`; expect missing exported functions.

- [ ] **Step 3: Implement the store**

Define values for theme, accent, reading width/font/line-height, folder view, sort, hidden files, and editor font size. Parse malformed storage safely and notify per-key listeners after successful writes.

- [ ] **Step 4: Verify GREEN**

Run `bun test src/client/utils/prefs.test.ts src/client/utils/fsApi.test.ts`; expect all pass.

### Task 2: Appearance bootstrap and reactive theme

**Files:**
- Create: `src/client/utils/appearance.ts`
- Create: `src/client/utils/appearance.test.ts`
- Modify: `src/client/main.tsx`
- Modify: `src/client/hooks/useTheme.ts`
- Modify: `src/client/styles/tokens.css`
- Modify: `src/client/styles/markdown.css`
- Modify: `src/client/styles/components.css`
- Modify: `src/client/components/Editor.tsx`

**Interfaces:**
- Consumes: preference APIs from Task 1.
- Produces: `resolveTheme`, `getAccentTokens`, `applyAppearancePrefs`, and `useTheme()` returning selected and resolved themes.

- [ ] **Step 1: Write failing tests**

Test system-theme resolution, preset token lookup, custom-color validation/darkening, contrast text selection, and CSS variable application.

- [ ] **Step 2: Verify RED**

Run `bun test src/client/utils/appearance.test.ts`; expect module-not-found failure.

- [ ] **Step 3: Implement appearance logic**

Apply preferences before Preact render; listen to system color-scheme changes when selected theme is `system`; map reading and editor values to root CSS variables.

- [ ] **Step 4: Wire CSS consumers**

Use `--reading-width`, `--reading-font-size`, `--reading-line-height`, and `--editor-font-size` in the markdown/content and CodeMirror styles.

- [ ] **Step 5: Verify GREEN**

Run the appearance and preference unit tests, then `bun run build`.

### Task 3: Settings dialog and header actions

**Files:**
- Create: `src/client/components/SettingsDialog.tsx`
- Modify: `src/client/components/ContentArea.tsx`
- Modify: `src/client/App.tsx`
- Modify: `src/client/components/ui/Icon.tsx`
- Modify: `src/client/styles/components.css`
- Modify: `tests/e2e/ui-batch1.spec.ts`

**Interfaces:**
- Consumes: `usePref`, `useTheme`, and appearance APIs.
- Produces: accessible settings modal and uniform theme/share/settings icon actions.

- [ ] **Step 1: Add failing Playwright coverage**

Assert settings opens from `[data-testid="open-settings"]`, Escape closes it, theme/accent/reading changes apply immediately, sharing uses an icon-only accessible button, hidden-file setting updates the tree, and reset requires confirmation.

- [ ] **Step 2: Verify RED**

Run the new tests with `bunx playwright test tests/e2e/ui-batch1.spec.ts --grep "settings"`; expect missing settings entry.

- [ ] **Step 3: Build the dialog**

Render semantic grouped controls, swatches plus color input, reset confirmation, and a mount-mode section placeholder populated in Task 5.

- [ ] **Step 4: Synchronize existing controls**

Move `DirModeApp`, `FolderView`, and relevant consumers to `usePref` so settings and existing controls share state without reload.

- [ ] **Step 5: Verify GREEN**

Run the targeted Playwright tests and `bun run build`.

### Task 4: Persistent startup mode

**Files:**
- Modify: `src/types.ts`
- Modify: `src/server/mount-manager.ts`
- Modify: `src/server/mount-manager.test.ts`
- Create: `src/server/startup-mode.ts`
- Create: `src/server/startup-mode.test.ts`
- Modify: `src/cli.ts`

**Interfaces:**
- Produces: `MountManager.getStartupSettings()`, `MountManager.setStartupSettings(...)`, and `resolveStartupMode(parsedInput, persistedConfig)`.

- [ ] **Step 1: Write failing unit tests**

Cover dir-to-multi persistence with an initial mount, multi-to-dir target selection, invalid target rejection, config backward compatibility, and CLI fallback when persisted paths disappear.

- [ ] **Step 2: Verify RED**

Run `bun test src/server/mount-manager.test.ts src/server/startup-mode.test.ts`; expect missing APIs.

- [ ] **Step 3: Extend config persistence**

Preserve `startupMode` and `singleMountAlias` through every mount save. Add validated setter methods with atomic writes.

- [ ] **Step 4: Resolve startup before server launch**

Have the CLI inspect `.vmd-config.json` for path and workspace invocations, select the persisted mount path for dir mode, or promote a directory invocation to multi mode.

- [ ] **Step 5: Verify GREEN**

Run server unit tests and `bun run build`.

### Task 5: Mount mode admin API and dialog integration

**Files:**
- Modify: `src/server/routes/admin.ts`
- Create: `src/server/routes/admin.settings.test.ts`
- Modify: `src/server/index.ts`
- Modify: `src/client/components/SettingsDialog.tsx`
- Modify: `src/client/App.tsx`
- Modify: `tests/e2e/ui-batch1.spec.ts`

**Interfaces:**
- Produces: `GET /api/admin/settings` and `POST /api/admin/mount-mode`.

- [ ] **Step 1: Write failing route tests**

Assert current mode/settings response, dir-to-multi initial mount creation, multi-to-dir alias validation, 400 errors, and `restartRequired: true`.

- [ ] **Step 2: Verify RED**

Run `bun test src/server/routes/admin.settings.test.ts`; expect 404 responses.

- [ ] **Step 3: Implement routes**

Pass current `ServerConfig` into admin route creation and delegate persistence to `MountManager`. Return structured errors without exposing stack traces.

- [ ] **Step 4: Connect the dialog**

Load mount settings on open, show current mode, require a mount selection for multi-to-dir, save explicitly, and render restart feedback.

- [ ] **Step 5: Verify GREEN**

Run route tests, targeted Playwright settings tests, and `bun run build`.

### Task 6: Regression verification

**Files:**
- Modify only files needed to fix regressions directly caused by Tasks 1–5.

- [ ] **Step 1: Run unit tests**

Run `bun test`; expect all unit suites to pass.

- [ ] **Step 2: Run focused E2E tests**

Run `bunx playwright test tests/e2e/ui-batch1.spec.ts`; expect all Batch 1 and settings tests to pass.

- [ ] **Step 3: Run build**

Run `bun run build`; expect TypeScript/Vite/Bun builds to complete without errors.

- [ ] **Step 4: Inspect final diff**

Run `git diff --check` and review `git diff --stat`; confirm no generated artifacts, secrets, or unrelated cleanup were added.
