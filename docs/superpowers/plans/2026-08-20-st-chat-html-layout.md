# ST Chat HTML + Centered Left Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render ST `mes`/`reasoning` HTML like Markdown preview, left-align all bubbles with accent for user, and center the chat column at reading width.

**Architecture:** Keep isolated `Marked` in `stMarkdown.ts`; stop escaping HTML tokens. Adjust `.st-chat-*` CSS only. Update unit/E2E expectations and `st_jsonl.md`. No schema or mode-toggle changes.

**Tech Stack:** Preact, marked, existing CSS variables (`--reading-width`, `--accent-soft`), Bun test, Playwright.

## Global Constraints

- HTML: pass through into DOM (same trust as `.md` preview); no DOMPurify.
- Links: keep scheme allowlist `http` / `https` / `mailto` / relative; escape `href` attrs; no inline event handlers.
- Layout: all bubbles `flex-start`; user still accent highlight; `.st-chat-preview` `max-width: var(--reading-width)` centered.
- Do **not** commit unless the user explicitly asks.
- Spec: `docs/superpowers/specs/2026-08-20-st-chat-html-layout-design.md` (parent: `2026-08-20-jsonl-st-preview-design.md`).

---

## File map

| File | Role |
| --- | --- |
| `src/client/utils/stMarkdown.ts` | Isolated Marked; remove HTML-escape renderer |
| `src/client/utils/stMarkdown.test.ts` | Expect raw HTML in output; keep link/code escaping tests |
| `src/client/utils/stJsonl.ts` | Remove unused `escapeHtmlForMarkdown` |
| `src/client/utils/stJsonl.test.ts` | Remove/replace tests for that helper |
| `src/client/styles/components.css` | Center column + left-align + full-width bubbles |
| `tests/e2e/jsonl-preview.spec.ts` | HTML + layout assertions |
| `st_jsonl.md` | Document HTML + left/accent layout |

---

### Task 1: Pass-through HTML in `renderStMarkdown`

**Files:**
- Modify: `src/client/utils/stMarkdown.ts`
- Modify: `src/client/utils/stMarkdown.test.ts`
- Modify: `src/client/utils/stJsonl.ts` (delete `escapeHtmlForMarkdown` if unused)
- Modify: `src/client/utils/stJsonl.test.ts`

**Interfaces:**
- Consumes: existing `renderStMarkdown(text: string): string`, `isSafeHref(rawHref: string): boolean`
- Produces: same signatures; HTML tokens preserved in output string

- [ ] **Step 1: Rewrite failing/updated unit tests for HTML pass-through**

In `stMarkdown.test.ts`, replace the “raw HTML escaped” test with:

```ts
test('raw HTML tags in mes are passed through into the output HTML', () => {
  const html = renderStMarkdown('<div class="x">hi</div> and <b>bold</b>')
  expect(html).toContain('<div class="x">hi</div>')
  expect(html).toContain('<b>bold</b>')
  expect(html).not.toContain('&lt;div')
})
```

Keep: code fence / codespan single-escape of `<`; `javascript:` links blocked; safe `https` links; isolation from global `marked`; reasoning-style sample still blocks `javascript:` links (update if it asserted escaped `<img>` — allow `<img>` through but still strip `javascript:` link).

Example update for the combined reasoning-style test:

```ts
test('reasoning text: raw HTML may pass; javascript: links still blocked', () => {
  const html = renderStMarkdown('<img src="x" alt="a"> plan: [go](javascript:alert(2))')
  expect(html).toContain('<img')
  expect(html).not.toContain('javascript:')
  expect(html).not.toContain('<a ')
})
```

In `stJsonl.test.ts`, delete tests that only cover `escapeHtmlForMarkdown`, or replace with a note that CRLF normalization (if still needed) lives elsewhere — today `StChatPreview` does not call that helper; prefer **delete** the helper and its tests.

- [ ] **Step 2: Run tests — expect HTML-escape test to fail (or fail after flipping assertion)**

Run: `bun test src/client/utils/stMarkdown.test.ts src/client/utils/stJsonl.test.ts`

Expected: failure on pass-through assertion until implementation; or green if only docs flipped after code — order is TDD: assert pass-through first while renderer still escapes → FAIL.

- [ ] **Step 3: Minimal implementation**

In `stMarkdown.ts` `createStMarked()` renderer:

- Remove the custom `html()` that calls `escapeHtml`, **or** set `html(token) { return typeof token === 'string' ? token : token.text }` matching marked’s default (prefer omitting `html` from `renderer` entirely so marked default passthrough applies).
- Remove unused `escapeHtml` helper if nothing else uses it.
- Keep `link` and `image` allowlist renderers.

In `stJsonl.ts`: delete `escapeHtmlForMarkdown` and its export; remove related tests.

- [ ] **Step 4: Re-run unit tests**

Run: `bun test src/client/utils/stMarkdown.test.ts src/client/utils/stJsonl.test.ts`  
Expected: PASS

- [ ] **Step 5: Do not commit** (unless user asked)

---

### Task 2: Layout CSS + E2E + `st_jsonl.md`

**Files:**
- Modify: `src/client/styles/components.css` (`.st-chat-preview`, `.st-bubble-row-*`, `.st-bubble`)
- Modify: `tests/e2e/jsonl-preview.spec.ts`
- Modify: `st_jsonl.md`

**Interfaces:**
- Consumes: Task 1 `renderStMarkdown` behavior; existing `StChatPreview` DOM (`st-bubble-row-user` / `st-bubble-row-char`, `st-chat-preview`)
- Produces: centered reading column; both rows left-aligned; E2E reflecting HTML + layout

- [ ] **Step 1: Update E2E expectations (will fail until CSS/HTML live)**

Adjust first ST test: raw `<script>` may appear in DOM like Markdown; assert no *executed* side effects is optional — prefer:

```ts
// HTML in mes is rendered (e.g. fixture tag becomes real element or visible markup per fixture)
await expect(page.locator('.st-bubble-mes')).toContainText(/* existing readable text */)
```

If fixture still has literal `<script>alert(1)</script>` in mes: after pass-through, `page.locator('.st-bubble-mes script')` may exist as a DOM node — **do not** assert it is escaped text. Change assertion to match Markdown parity (e.g. still assert no `javascript:` anchors).

Add layout checks:

```ts
test('ST bubbles are left-aligned and chat column uses reading width centering', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-chat.jsonl"]')
  const preview = page.locator('[data-testid="st-chat-preview"]')
  await expect(preview).toBeVisible()
  const userRow = page.locator('.st-bubble-row-user').first()
  const charRow = page.locator('.st-bubble-row-char').first()
  await expect(userRow).toHaveCSS('justify-content', 'flex-start')
  await expect(charRow).toHaveCSS('justify-content', 'flex-start')
  const style = await preview.evaluate((el) => getComputedStyle(el))
  expect(style.marginLeft).not.toBe('0px') // or compare offsetParent centering: el.offsetLeft > 0 when pane wider than reading-width
})
```

Prefer a robust centering check:

```ts
const box = await preview.boundingBox()
const parent = await preview.evaluate((el) => {
  const p = el.parentElement!
  return { width: p.getBoundingClientRect().width, left: p.getBoundingClientRect().left }
})
// When parent wider than reading-width, preview left > parent left
```

Skip fragile pixel asserts if viewport too narrow; at minimum assert both rows `flex-start` and user bubble still has accent class/styles.

- [ ] **Step 2: CSS**

```css
.st-chat-preview {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: var(--reading-width);
  width: 100%;
  margin-left: auto;
  margin-right: auto;
}

.st-bubble-row-user,
.st-bubble-row-char {
  justify-content: flex-start;
}

.st-bubble {
  width: 100%;
  max-width: 100%;
  /* keep existing padding, radius, border */
}

.st-bubble-row-user .st-bubble {
  background: var(--accent-soft);
  border-color: var(--accent);
}
```

Remove the old `.st-bubble-row-user { justify-content: flex-end; }` and `max-width: min(680px, 88%)`.

- [ ] **Step 3: Update `st_jsonl.md`**

Document: `mes`/reasoning Markdown with HTML rendered; UI left-aligned for all roles; user highlighted; no right-align chat.

- [ ] **Step 4: Verify**

```bash
bun test src/client/utils/stMarkdown.test.ts src/client/utils/stJsonl.test.ts
bunx playwright test tests/e2e/jsonl-preview.spec.ts
```

Expected: all pass. Note unrelated `folder-view` flakes separately.

- [ ] **Step 5: Do not commit** (unless user asked)

---

## Spec coverage checklist

| Spec item | Task |
| --- | --- |
| HTML pass-through | Task 1 |
| Keep link allowlist | Task 1 |
| Remove `escapeHtmlForMarkdown` | Task 1 |
| Center `--reading-width` | Task 2 |
| All left + accent user | Task 2 |
| Docs + E2E | Task 2 |
| No schema/mode/reasoning default change | (untouched) |
