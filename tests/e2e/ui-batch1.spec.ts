import { test, expect } from '@playwright/test'

test('2a: switching folder updates breadcrumb and does not keep previous file preview', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-notes"]')
  await page.click('.folder-list-row:has-text("daily.md")')
  await expect(page.locator('[data-testid="markdown-preview"]')).toBeVisible()

  await page.click('[data-testid="tree-node-notes"]') // back to folder — or click notes in breadcrumb/tree
  await expect(page.locator('[data-testid="folder-view"], [data-testid="folder-skeleton"]')).toBeVisible()
  await expect(page.locator('[data-testid="markdown-preview"]')).not.toBeVisible()
  await expect(page.locator('.folder-breadcrumb, .current-file').first()).toContainText('notes')
})
