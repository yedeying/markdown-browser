# TOC Heading Indent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give H1–H4 links in the right-side TOC a compact 6px-per-level visual indentation.

**Architecture:** Keep the existing `TableOfContents` markup and `.toc-h1`–`.toc-h4` classes. Change only their left padding in the component stylesheet, preserving the existing 8px base inset and all Markdown article styles.

**Tech Stack:** CSS, Preact, Vite, Bun

## Global Constraints

- Do not modify Markdown article heading styles.
- Do not change TOC component structure or heading extraction behavior.
- H1–H4 left padding must be `8px`, `14px`, `20px`, and `26px`.

---

### Task 1: Adjust TOC heading indentation

**Files:**
- Modify: `src/client/styles/components.css:401-404`

**Interfaces:**
- Consumes: Existing `.toc-h1`, `.toc-h2`, `.toc-h3`, and `.toc-h4` classes emitted by `TableOfContents`.
- Produces: A 6px visual indentation increment between adjacent TOC heading levels.

- [ ] **Step 1: Record the current style values**

Confirm the existing rules use `0`, `10px`, `20px`, and `30px`:

```css
.toc-h1 { padding-left: 0; font-weight: 600; }
.toc-h2 { padding-left: 10px; }
.toc-h3 { padding-left: 20px; }
.toc-h4 { padding-left: 30px; }
```

- [ ] **Step 2: Apply the compact indentation**

Replace those rules with:

```css
.toc-h1 { padding-left: 8px; font-weight: 600; }
.toc-h2 { padding-left: 14px; }
.toc-h3 { padding-left: 20px; }
.toc-h4 { padding-left: 26px; }
```

- [ ] **Step 3: Verify the production build**

Run: `bun run build`

Expected: Vite and Bun builds complete successfully with exit code 0.

- [ ] **Step 4: Review the diff**

Run: `git diff --check && git diff -- src/client/styles/components.css`

Expected: No whitespace errors; only the four TOC padding values differ.

- [ ] **Step 5: Commit**

```bash
git add src/client/styles/components.css
git commit -m "style: clarify toc heading hierarchy"
```
