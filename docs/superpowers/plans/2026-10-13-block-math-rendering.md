# Block Math Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render multiline display math delimited by standalone `$$ ... $$` or `\[ ... \]` without regressing inline math or fenced code.

**Architecture:** A Marked block extension will preserve display-math source as escaped, contiguous text instead of allowing `breaks: true` to insert `<br>` elements. The existing KaTeX auto-render pass will render that preserved text and gain the `\[ ... \]` delimiter pair.

**Tech Stack:** TypeScript, Marked 12, Preact 10, KaTeX 0.16, Bun test, happy-dom

## Global Constraints

- Display delimiters must be on standalone lines.
- Existing `$ ... $` inline math behavior must remain unchanged.
- Math-like text inside fenced code blocks must remain code.
- Unclosed display-math delimiters must remain ordinary Markdown text.
- KaTeX must continue using `throwOnError: false`.
- Add no new runtime dependencies.

---

### Task 1: Preserve Display-Math Blocks During Markdown Parsing

**Files:**
- Modify: `src/client/utils/parseMarkdownPreview.ts:139-232`
- Test: `src/client/utils/parseMarkdownPreview.test.ts`

**Interfaces:**
- Consumes: `Marked` extension API and the existing `escapeAttr(code: string): string`.
- Produces: a `displayMath` block token whose renderer returns `<div class="math-display">...</div>` with escaped, contiguous delimiter text.

- [ ] **Step 1: Write the failing parser regression tests**

Append these tests to `src/client/utils/parseMarkdownPreview.test.ts`:

```typescript
test('preserves multiline dollar display math as contiguous escaped text', () => {
  const markdown = String.raw`$$
cross(\vec{CD}, \vec{CA}) \times cross(\vec{CD}, \vec{CB}) < 0
$$`

  const html = parseMarkdownPreview(markdown)

  expect(html).toContain('<div class="math-display">$$\n')
  expect(html).toContain(String.raw`cross(\vec{CD}, \vec{CA}) \times cross(\vec{CD}, \vec{CB}) &lt; 0`)
  expect(html).toContain('\n$$</div>')
  expect(html).not.toContain('<br>')
})

test('preserves multiline bracket display math as contiguous escaped text', () => {
  const html = parseMarkdownPreview(String.raw`\[
x < y
\]`)

  expect(html).toContain('<div class="math-display">\\[\nx &lt; y\n\\]</div>')
  expect(html).not.toContain('<br>')
})

test('leaves inline math and unclosed display delimiters to normal markdown parsing', () => {
  const inline = parseMarkdownPreview('inline $x < y$')
  const unclosed = parseMarkdownPreview('$$\nx < y')

  expect(inline).toContain('inline $x &lt; y$')
  expect(inline).not.toContain('math-display')
  expect(unclosed).not.toContain('math-display')
})

test('does not treat display delimiters inside fenced code as math', () => {
  const html = parseMarkdownPreview(String.raw`\`\`\`text
$$
x < y
$$
\`\`\``.replaceAll('\\`', '`'))

  expect(html).toContain('<pre>')
  expect(html).toContain('language-text')
  expect(html).not.toContain('math-display')
})
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
bun test src/client/utils/parseMarkdownPreview.test.ts
```

Expected: the two preservation tests fail because current output contains `<br>` and no `.math-display` wrapper.

- [ ] **Step 3: Add the minimal Marked block extension**

In `src/client/utils/parseMarkdownPreview.ts`, add a block extension with two anchored patterns:

```typescript
import { Marked, type Renderer, type TokenizerAndRendererExtension, type Tokens } from 'marked'

type DisplayMathToken = Tokens.Generic & {
  type: 'displayMath'
  raw: string
  delimiter: '$$' | '\\['
  text: string
}

const dollarDisplayMath = /^(?: {0,3})\$\$[ \t]*\n([\s\S]*?)\n(?: {0,3})\$\$[ \t]*(?:\n|$)/
const bracketDisplayMath = /^(?: {0,3})\\\[[ \t]*\n([\s\S]*?)\n(?: {0,3})\\\][ \t]*(?:\n|$)/

const displayMathExtension: TokenizerAndRendererExtension = {
  name: 'displayMath',
  level: 'block',
  tokenizer(src) {
    const dollarMatch = dollarDisplayMath.exec(src)
    const bracketMatch = dollarMatch ? null : bracketDisplayMath.exec(src)
    const match = dollarMatch || bracketMatch
    if (!match) return

    return {
      type: 'displayMath',
      raw: match[0],
      delimiter: dollarMatch ? '$$' : '\\[',
      text: match[1],
    } satisfies DisplayMathToken
  },
  renderer(token) {
    const math = token as DisplayMathToken
    const closingDelimiter = math.delimiter === '$$' ? '$$' : '\\]'
    return `<div class="math-display">${math.delimiter}\n${escapeAttr(math.text)}\n${closingDelimiter}</div>\n`
  },
}
```

Register it on the isolated parser:

```typescript
const instance = new Marked({
  renderer,
  gfm: true,
  breaks: true,
  extensions: [displayMathExtension],
})
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
bun test src/client/utils/parseMarkdownPreview.test.ts
```

Expected: all parser tests pass.

- [ ] **Step 5: Commit the parser change**

```bash
git add src/client/utils/parseMarkdownPreview.ts src/client/utils/parseMarkdownPreview.test.ts
git commit -m "fix: preserve multiline display math"
```

### Task 2: Render Both Display-Math Syntaxes Through KaTeX

**Files:**
- Create: `src/client/components/MarkdownPreview.test.tsx`
- Modify: `src/client/components/MarkdownPreview.tsx:47-54`

**Interfaces:**
- Consumes: `.math-display` blocks emitted by `parseMarkdownPreview` and KaTeX's `renderMathInElement`.
- Produces: `.katex-display` DOM for both `$$ ... $$` and `\[ ... \]`.

- [ ] **Step 1: Write the failing component integration test**

Create `src/client/components/MarkdownPreview.test.tsx`:

```tsx
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { Window } from 'happy-dom'

const dom = new Window()
;(globalThis as unknown as { window: Window }).window = dom
;(globalThis as unknown as { document: Document }).document = dom.document as unknown as Document
;(globalThis as unknown as { navigator: Navigator }).navigator = dom.navigator as unknown as Navigator
;(globalThis as unknown as { Node: typeof Node }).Node = dom.Node as unknown as typeof Node
;(globalThis as unknown as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame =
  (callback) => setTimeout(() => callback(Date.now()), 0) as unknown as number

const { default: MarkdownPreview } = await import('./MarkdownPreview.js')

let container: HTMLElement

beforeEach(() => {
  container = dom.document.createElement('div') as unknown as HTMLElement
  dom.document.body.appendChild(container)
})

afterEach(() => {
  act(() => render(null, container))
  container.remove()
})

afterAll(() => {
  dom.close()
})

test('renders dollar and bracket display math through KaTeX', () => {
  const markdown = String.raw`$$
x < y
$$

\[
a \times b
\]`

  act(() => render(h(MarkdownPreview, { markdown }), container))

  expect(container.querySelectorAll('.katex-display')).toHaveLength(2)
})
```

- [ ] **Step 2: Run the component test and verify RED**

Run:

```bash
bun test src/client/components/MarkdownPreview.test.tsx
```

Expected: FAIL with one `.katex-display`; `$$ ... $$` renders, but `\[ ... \]` remains text.

- [ ] **Step 3: Add the bracket delimiter to KaTeX**

Update the delimiter list in `src/client/components/MarkdownPreview.tsx`:

```typescript
delimiters: [
  { left: '$$', right: '$$', display: true },
  { left: '\\[', right: '\\]', display: true },
  { left: '$', right: '$', display: false },
],
```

Keep `throwOnError: false` unchanged.

- [ ] **Step 4: Run the component and parser tests**

Run:

```bash
bun test src/client/components/MarkdownPreview.test.tsx src/client/utils/parseMarkdownPreview.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 5: Commit the KaTeX integration**

```bash
git add src/client/components/MarkdownPreview.tsx src/client/components/MarkdownPreview.test.tsx
git commit -m "test: cover display math rendering"
```

### Task 3: Full Verification

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: completed parser and KaTeX integration.
- Produces: verified unit-test and production-build results.

- [ ] **Step 1: Run the full unit suite**

```bash
bun test
```

Expected: all tests pass with no new errors.

- [ ] **Step 2: Run the required production build**

```bash
bun run build
```

Expected: Vite client and Bun server builds complete successfully.

- [ ] **Step 3: Inspect the final diff and repository state**

```bash
git diff --check
git status --short --branch
```

Expected: no whitespace errors; implementation files are committed and the branch is ahead only by intentional commits.
