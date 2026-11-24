import { test, expect } from '@playwright/test'

/**
 * 内置通用 JSONL 预览插件（builtin.jsonl）E2E 测试
 *
 * 专用对话格式（如 SillyTavern .jsonl）已抽离为外部运行时插件；
 * 主仓库仅保留通用逐行 JSON 卡片预览与源码编辑切换。
 */

test('plain .jsonl renders line cards with JSON syntax highlighting and flags invalid lines', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-plain.jsonl"]')

  await expect(page.locator('[data-testid="jsonl-line-preview"]')).toBeVisible()
  await expect(page.locator('[data-testid="jsonl-line-card"]')).toHaveCount(3)
  await expect(page.locator('[data-testid="jsonl-line-card"]').first().locator('code.hljs.language-json .hljs-attr').first()).toBeVisible()

  const errorCard = page.locator('[data-testid="jsonl-line-card"].jsonl-line-error')
  await expect(errorCard).toHaveCount(1)
  await expect(errorCard).toContainText('not valid json at all')
})

test('empty .jsonl shows the JSONL empty state', async ({ page }) => {
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

test('.jsonl can switch between preview and source editor', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-plain.jsonl"]')

  await page.locator('[data-testid="plugin-mode-source"]').click()
  await expect(page.locator('.cm-editor')).toBeVisible()
  await expect(page.locator('[data-testid="jsonl-line-preview"]')).toHaveCount(0)

  await page.locator('[data-testid="plugin-mode-jsonl"]').click()
  await expect(page.locator('[data-testid="jsonl-line-preview"]')).toBeVisible()
})
