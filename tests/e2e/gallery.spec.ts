import { test, expect } from '@playwright/test'

/**
 * Gallery (masonry + lightbox) E2E
 * Fixtures: tests/fixtures/docs/images/{photo,diagram}.png
 */

test('folder with images shows 瀑布流 button; without media hides it', async ({ page }) => {
  await page.goto('/')

  await page.click('[data-testid="tree-node-images"]')
  await expect(page.locator('[data-testid="folder-view"]')).toBeVisible()
  await expect(page.locator('[data-testid="view-btn-masonry"]')).toBeVisible()

  await page.click('[data-testid="tree-node-notes"]')
  await expect(page.locator('[data-testid="folder-view"]')).toBeVisible()
  await expect(page.locator('[data-testid="view-btn-masonry"]')).toHaveCount(0)
})

test('masonry → click image → lightbox → arrow next → Esc', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-images"]')
  await page.click('[data-testid="view-btn-masonry"]')
  await expect(page.locator('[data-testid="folder-masonry"]')).toBeVisible()

  await page.locator('[data-testid="folder-masonry"] .folder-card').first().click()
  await expect(page.locator('[data-testid="media-lightbox"]')).toBeVisible()

  const captionBefore = await page.locator('.media-lightbox-caption').textContent()
  await page.click('[data-testid="media-lightbox-next"]')
  await expect(page.locator('.media-lightbox-caption')).not.toHaveText(captionBefore || '')
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('.media-lightbox-caption')).toHaveText(captionBefore || '')

  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="media-lightbox"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="folder-masonry"]')).toBeVisible()
})

test('grid click image opens lightbox with siblings', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-images"]')
  await page.click('[data-testid="view-btn-grid"]')
  await expect(page.locator('[data-testid="folder-grid"]')).toBeVisible()

  await page.locator('[data-testid="folder-grid"] .folder-card').first().click()
  await expect(page.locator('[data-testid="media-lightbox"]')).toBeVisible()
  await expect(page.locator('[data-testid="media-lightbox-next"]')).toBeVisible()
})
