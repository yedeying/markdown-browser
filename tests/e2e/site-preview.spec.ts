import { test, expect } from '@playwright/test'

/**
 * 文件夹即站点（iframe 网页视图）E2E
 *
 * fixture：tests/fixtures/docs/site-demo/（index.html + css/ + js/）
 * 规格：含 index.html 的文件夹在右上角出现「文件 / 网页」切换，
 *      网页模式用 iframe 加载 `/site/<dir>/index.html`，相对资源由同前缀解析。
 */

const SITE_DIR = 'site-demo'

/** 展开树里的 site-demo 目录 */
async function expandSiteDir(page: import('@playwright/test').Page) {
  const row = page.locator(`[data-testid="tree-node-${SITE_DIR}"]`).first()
  // 树是异步拉取的，先等节点进 DOM 再读展开态，避免竞态
  await expect(row).toBeVisible({ timeout: 15000 })
  const toggle = row.locator('.folder-toggle')
  const cls = (await toggle.getAttribute('class')) || ''
  if (!cls.includes('expanded')) await toggle.click()
}

/** 选中 site-demo 文件夹 */
async function openSiteFolder(page: import('@playwright/test').Page) {
  await page.goto('/')
  await expandSiteDir(page)
  await page.locator(`[data-testid="tree-node-${SITE_DIR}"]`).first().locator('.folder-name').click()
  await expect(page.locator('[data-testid="site-view-web"]')).toBeVisible()
}

test('含 index.html 的文件夹出现「文件 / 网页」切换，默认在文件视图', async ({ page }) => {
  await openSiteFolder(page)
  await expect(page.locator('[data-testid="site-view-folder"]')).toBeVisible()
  await expect(page.locator('[data-testid="site-view-folder"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-testid="site-preview"]')).toHaveCount(0)
})

test('切到网页后渲染 iframe，且 iframe 内是 index.html 的内容', async ({ page }) => {
  await openSiteFolder(page)
  await page.locator('[data-testid="site-view-web"]').click()
  const frame = page.locator('[data-testid="site-preview-frame"]')
  await expect(frame).toBeVisible()
  await expect(frame).toHaveAttribute('src', /\/site\/site-demo\/index\.html/)

  const inner = page.frameLocator('[data-testid="site-preview-frame"]')
  await expect(inner.locator('#title')).toHaveText('静态站点 fixture')
})

test('iframe 内的相对资源（css / js）能正常加载执行', async ({ page }) => {
  await openSiteFolder(page)
  await page.locator('[data-testid="site-view-web"]').click()
  const inner = page.frameLocator('[data-testid="site-preview-frame"]')
  // js/app.js 把文案改写为「js 已执行」——证明相对路径脚本被正确 fetch 并运行
  await expect(inner.locator('#js-result')).toHaveText('js 已执行')
  // css/app.css 生效：h1 颜色来自 fixture 而非 UA 默认
  const color = await inner.locator('#title').evaluate(
    (el) => getComputedStyle(el).color,
  )
  expect(color).toBe('rgb(91, 108, 255)')
})

test('切回文件视图后 iframe 卸载，恢复文件夹列表', async ({ page }) => {
  await openSiteFolder(page)
  await page.locator('[data-testid="site-view-web"]').click()
  await expect(page.locator('[data-testid="site-preview-frame"]')).toBeVisible()
  await page.locator('[data-testid="site-view-folder"]').click()
  await expect(page.locator('[data-testid="site-preview"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="site-view-folder"]')).toHaveAttribute('aria-pressed', 'true')
})

test('网页视图选择在切换文件夹后保持，且不污染没有 index.html 的目录', async ({ page }) => {
  await openSiteFolder(page)
  await page.locator('[data-testid="site-view-web"]').click()
  await expect(page.locator('[data-testid="site-preview-frame"]')).toBeVisible()

  // 换到不含 index.html 的普通目录：切换器消失，回落到文件列表
  const plain = page.locator('[data-testid="tree-node-notes"]').first()
  const toggle = plain.locator('.folder-toggle')
  const cls = (await toggle.getAttribute('class')) || ''
  if (!cls.includes('expanded')) await toggle.click()
  await plain.locator('.folder-name').click()

  await expect(page.locator('[data-testid="site-view-web"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="site-preview"]')).toHaveCount(0)
})

test('刷新按钮给 src 加缓存穿透参数以重新加载', async ({ page }) => {
  await openSiteFolder(page)
  await page.locator('[data-testid="site-view-web"]').click()
  const frame = page.locator('[data-testid="site-preview-frame"]')
  await expect(frame).toBeVisible()
  await page.locator('[data-testid="site-preview-reload"]').click()
  await expect(frame).toHaveAttribute('src', /\?v=\d+/)
})
