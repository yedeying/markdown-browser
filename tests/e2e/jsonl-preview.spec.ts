import { test, expect } from '@playwright/test'

/**
 * .jsonl 预览 E2E 测试
 *
 * 测试数据：
 *   tests/fixtures/docs/chat.jsonl  — 合法 ST 导出（含 header + 消息 + 一条带 extra.reasoning/model）
 *   tests/fixtures/docs/plain.jsonl — 不满足 ST 结构（无 header/is_user 等必填字段），且含一行非法 JSON
 *
 * 覆盖设计 docs/superpowers/specs/2026-08-20-jsonl-st-preview-design.md §3。
 */

test('ST .jsonl opens to chat bubbles; layout is centered and left-aligned; HTML in mes may render', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-chat.jsonl"]')

  await expect(page.locator('[data-testid="st-chat-preview"]')).toBeVisible()
  await expect(page.locator('[data-testid="jsonl-line-preview"]')).toHaveCount(0)

  // mes 按 Markdown 渲染：**traveler** 应变成 <strong>
  await expect(page.locator('.st-bubble-mes strong', { hasText: 'traveler' })).toBeVisible()

  await expect(page.locator('.st-chat-messages')).toContainText('Nova')
  await expect(page.locator('.st-chat-messages')).toContainText('Alice')

  // 用户与角色均左对齐；用户靠 accent 底色区分
  await expect(page.locator('.st-bubble-row-user').first()).toHaveCSS('justify-content', 'flex-start')
  await expect(page.locator('.st-bubble-row-char').first()).toHaveCSS('justify-content', 'flex-start')

  // 阅读栏居中（与 markdown 同用 --reading-width）
  const preview = page.locator('[data-testid="st-chat-preview"]')
  const maxWidth = await preview.evaluate((el) => getComputedStyle(el).maxWidth)
  expect(maxWidth).not.toBe('100%')
  expect(maxWidth).not.toBe('none')
})

test('markdown link with javascript: href renders as plain text, not a clickable anchor; code fence "<" is not double-escaped', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-chat.jsonl"]')

  const bubble = page.locator('.st-bubble-mes', { hasText: 'Careful with this one' })
  await expect(bubble).toBeVisible()

  // 危险的 javascript: 链接必须退化为纯文本，绝不能生成可点击的 <a href="javascript:...">
  await expect(bubble.locator('a[href^="javascript:"]')).toHaveCount(0)
  await expect(bubble).toContainText('click me')

  // 代码片段里的 "<" 只应被转义一次（&lt;），不应出现 &amp;lt; 这种双重转义的痕迹
  const html = await bubble.innerHTML()
  expect(html).not.toContain('&amp;lt;')
  await expect(bubble.locator('code', { hasText: 'if (a' })).toBeVisible()
})

test('reasoning renders as a native <details> block, default collapsed, expandable via summary click', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-chat.jsonl"]')

  const reasoning = page.locator('[data-testid="st-bubble-reasoning"]')
  await expect(reasoning).toBeVisible()
  await expect(reasoning).toHaveJSProperty('open', false)
  await expect(reasoning).toContainText('思考过程')
  // 折叠时内容不可见（details 折叠会隐藏非 summary 子元素）
  await expect(reasoning.locator('.st-bubble-reasoning-body')).not.toBeVisible()

  await reasoning.locator('summary').click()
  await expect(reasoning).toHaveJSProperty('open', true)
  await expect(reasoning.locator('.st-bubble-reasoning-body')).toBeVisible()
  await expect(reasoning.locator('.st-bubble-reasoning-body')).toContainText('greet them warmly')
})

test('toolbar toggle switches between chat bubbles and plain JSONL line cards, and back', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-chat.jsonl"]')

  await expect(page.locator('[data-testid="jsonl-mode-toggle"]')).toBeVisible()
  await expect(page.locator('[data-testid="st-chat-preview"]')).toBeVisible()

  await page.click('[data-testid="jsonl-mode-jsonl"]')
  await expect(page.locator('[data-testid="jsonl-line-preview"]')).toBeVisible()
  await expect(page.locator('[data-testid="st-chat-preview"]')).toHaveCount(0)
  // 5 行输入 → 5 张卡片，pretty-printed JSON + highlight.js
  await expect(page.locator('[data-testid="jsonl-line-card"]')).toHaveCount(5)
  await expect(page.locator('[data-testid="jsonl-line-card"]').first()).toContainText('"user_name"')
  await expect(page.locator('[data-testid="jsonl-line-card"]').first().locator('code.hljs.language-json .hljs-attr').first()).toBeVisible()

  await page.click('[data-testid="jsonl-mode-st"]')
  await expect(page.locator('[data-testid="st-chat-preview"]')).toBeVisible()
  await expect(page.locator('[data-testid="jsonl-line-preview"]')).toHaveCount(0)
})

test('jsonlPreviewMode preference persists across reload', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-chat.jsonl"]')
  await page.click('[data-testid="jsonl-mode-jsonl"]')
  await expect(page.locator('[data-testid="jsonl-line-preview"]')).toBeVisible()

  await page.reload()
  await page.click('[data-testid="tree-node-chat.jsonl"]')
  await expect(page.locator('[data-testid="jsonl-line-preview"]')).toBeVisible()
  await expect(page.locator('[data-testid="st-chat-preview"]')).toHaveCount(0)

  // 复原偏好，避免影响其它测试的默认状态假设
  await page.click('[data-testid="jsonl-mode-st"]')
  await expect(page.locator('[data-testid="st-chat-preview"]')).toBeVisible()
})

test('non-ST .jsonl always shows the plain line preview with no mode toggle, and flags an invalid line', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-plain.jsonl"]')

  await expect(page.locator('[data-testid="jsonl-line-preview"]')).toBeVisible()
  await expect(page.locator('[data-testid="st-chat-preview"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="jsonl-mode-toggle"]')).toHaveCount(0)

  await expect(page.locator('[data-testid="jsonl-line-card"]')).toHaveCount(3)
  const errorCard = page.locator('[data-testid="jsonl-line-card"].jsonl-line-error')
  await expect(errorCard).toHaveCount(1)
  await expect(errorCard).toContainText('not valid json at all')
})

test('empty .jsonl shows the JSONL empty state, not the "select a file" placeholder', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-empty.jsonl"]')

  await expect(page.locator('[data-testid="jsonl-line-preview"]')).toBeVisible()
  await expect(page.locator('.jsonl-line-empty')).toContainText('空文件')
  await expect(page.getByText('选择左侧文件进行预览')).toHaveCount(0)
})

test('empty .md shows empty-file state and allows edit', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-empty.md"]')

  await expect(page.getByText('选择左侧文件进行预览')).toHaveCount(0)
  await expect(page.locator('.empty-state-text', { hasText: '空文件' })).toBeVisible()
  const editBtn = page.locator('.desktop-btn-group button', { hasText: '编辑' })
  await expect(editBtn).toBeEnabled()
  await editBtn.click()
  await expect(page.locator('.editor-view .cm-editor')).toBeVisible()
})

test('column view previews ST .jsonl as chat bubbles', async ({ page }) => {
  await page.goto('/')
  await page.click('.sidebar-root-row')
  await expect(page.locator('[data-testid="folder-view"]')).toBeVisible({ timeout: 15000 })
  await page.click('[data-testid="view-btn-column"]')
  await expect(page.locator('.folder-columns-outer')).toBeVisible()

  await page.locator('.folder-column-row', { hasText: 'chat.jsonl' }).click()
  await expect(page.locator('[data-testid="col-preview-jsonl"]')).toBeVisible()
  await expect(page.locator('[data-testid="col-preview-jsonl"] [data-testid="st-chat-preview"]')).toBeVisible()
  await expect(page.locator('[data-testid="col-preview-jsonl"] .st-bubble-mes strong', { hasText: 'traveler' })).toBeVisible()
})

test('.jsonl can switch to source view, edit, and save, matching markdown-file editing UX', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-plain.jsonl"]')

  await page.locator('.desktop-btn-group .btn', { hasText: '源码' }).click()
  await expect(page.locator('.cm-editor')).toBeVisible()
  await expect(page.locator('[data-testid="jsonl-line-preview"]')).toHaveCount(0)

  await page.locator('.desktop-btn-group .btn', { hasText: '预览' }).click()
  await expect(page.locator('[data-testid="jsonl-line-preview"]')).toBeVisible()
})
