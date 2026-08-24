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

test('列视图钻入图片目录后出现瀑布流按钮', async ({ page }) => {
  await page.goto('/')
  // 根目录本身无媒体文件，不应显示瀑布流
  await page.click('.sidebar-root-row')
  await expect(page.locator('[data-testid="folder-view"]')).toBeVisible()
  await expect(page.locator('[data-testid="view-btn-masonry"]')).toHaveCount(0)

  await page.click('[data-testid="view-btn-column"]')
  await page.click('.folder-column-row:has-text("images")')
  // 当前列是 images（含图）→ 应出现瀑布流入口
  await expect(page.locator('[data-testid="view-btn-masonry"]')).toBeVisible()
})

test('masonry → click image → lightbox → arrow next → Esc', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-images"]')
  await page.click('[data-testid="view-btn-masonry"]')
  await expect(page.locator('[data-testid="folder-masonry"]')).toBeVisible()

  await page.locator('[data-testid="folder-masonry"] .masonry-tile').first().click()
  await expect(page.locator('[data-testid="media-lightbox"]')).toBeVisible()

  const nameBefore = await page.locator('.media-lightbox-toolbar-name').textContent()
  await page.locator('.media-lightbox-toolbar [data-testid="media-lightbox-next"]').click()
  await expect(page.locator('.media-lightbox-toolbar-name')).not.toHaveText(nameBefore || '')
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('.media-lightbox-toolbar-name')).toHaveText(nameBefore || '')

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
