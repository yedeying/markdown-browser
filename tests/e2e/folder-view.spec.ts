import { test, expect } from '@playwright/test'

/**
 * 文件夹视图 E2E 测试
 *
 * 测试数据位于 tests/fixtures/docs/，结构：
 *   docs/
 *   ├── README.md
 *   ├── empty-folder/
 *   ├── images/
 *   │   ├── photo.png
 *   │   └── diagram.png
 *   └── notes/
 *       ├── daily.md
 *       └── sub/
 *           └── deep.md
 *
 * 前置条件：vmd 服务运行在 localhost:8899，指向 tests/fixtures/docs
 * （playwright.config.ts 中的 webServer 会自动启动）
 */

// ─── T1 文件夹点击基础行为 ────────────────────────────────────────────────────
test('T1: 点击文件夹 → 左树展开 + 右侧显示 FolderView', async ({ page }) => {
  await page.goto('/')

  // 点击 notes 文件夹节点
  await page.click('[data-testid="tree-node-notes"]')

  // 左树展开：notes 下的文件可见
  await expect(page.locator('[data-testid="tree-node-notes-daily.md"]')).toBeVisible()

  // 右侧 FolderView 出现
  await expect(page.locator('[data-testid="folder-view"]')).toBeVisible()

  // 面包屑包含 notes
  await expect(page.locator('.folder-breadcrumb')).toContainText('notes')
})

// ─── T2 列表视图：默认视图 + 排序 + 文件导航 ─────────────────────────────────
test('T2: 列表视图默认展示，点击文件导航到内容', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-notes"]')

  // 默认显示列表视图
  await expect(page.locator('[data-testid="folder-list"]')).toBeVisible()

  // 文件行显示名称
  const rows = page.locator('.folder-list-row')
  await expect(rows.first()).toBeVisible()

  // 点击列头排序（名称列）
  await page.click('[data-sort="name"]')
  // 排序状态：sorted class 出现
  await expect(page.locator('[data-sort="name"]')).toHaveClass(/sorted/)

  // 再次点击切换为降序
  await page.click('[data-sort="name"]')

  // 点击文件 daily.md 导航到预览
  await page.click('.folder-list-row:has-text("daily.md")')
  await expect(page.locator('[data-testid="markdown-preview"]')).toBeVisible()
  await expect(page.locator('[data-testid="folder-view"]')).not.toBeVisible()
})

// ─── T3 网格视图切换 ──────────────────────────────────────────────────────────
test('T3: 切换网格视图 → 卡片渲染', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-notes"]')

  // 切换到网格
  await page.click('[data-testid="view-btn-grid"]')
  await expect(page.locator('[data-testid="folder-grid"]')).toBeVisible()

  // 至少有一张卡片
  const cards = page.locator('.folder-card')
  await expect(cards).not.toHaveCount(0)

  // 切换按钮显示 active 状态
  await expect(page.locator('[data-testid="view-btn-grid"]')).toHaveClass(/active/)
})

// ─── T4 网格视图图片缩略图 ────────────────────────────────────────────────────
test('T4: 图片文件夹 → 卡片包含 img 缩略图', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-images"]')
  await page.click('[data-testid="view-btn-grid"]')

  // 等待卡片加载
  await expect(page.locator('.folder-card')).not.toHaveCount(0)

  // 至少一张卡片含有 img 标签（图片文件）
  const imgCard = page.locator('.folder-card').filter({ has: page.locator('img') }).first()
  await expect(imgCard).toBeVisible()

  // img src 指向 /api/asset/
  await expect(imgCard.locator('img')).toHaveAttribute('src', /\/api\/asset\//)
})

// ─── T5 卡片尺寸 S/M/L 切换 ──────────────────────────────────────────────────
test('T5: 卡片尺寸 S/M/L 按钮切换', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-notes"]')
  await page.click('[data-testid="view-btn-grid"]')

  // 切换到 L
  await page.click('[data-testid="card-size-l"]')
  await expect(page.locator('[data-testid="card-size-l"]')).toHaveClass(/active/)

  // 切换到 S
  await page.click('[data-testid="card-size-s"]')
  await expect(page.locator('[data-testid="card-size-s"]')).toHaveClass(/active/)
  await expect(page.locator('[data-testid="card-size-l"]')).not.toHaveClass(/active/)

  // 切换回 M
  await page.click('[data-testid="card-size-m"]')
  await expect(page.locator('[data-testid="card-size-m"]')).toHaveClass(/active/)
})

// ─── T6 列视图多列导航 ────────────────────────────────────────────────────────
test('T6: 列视图 → 点击子文件夹展开新列', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-notes"]')
  await page.click('[data-testid="view-btn-column"]')

  // 初始显示 1 列（notes 内容）
  await expect(page.locator('.folder-column')).toHaveCount(1)

  // 点击子文件夹 sub
  await page.click('.folder-column-row:has-text("sub")')

  // 展开第 2 列
  await expect(page.locator('.folder-column')).toHaveCount(2)

  // 第 2 列包含 deep.md
  await expect(page.locator('.folder-column').nth(1)).toContainText('deep.md')
})

// ─── T7 列视图点击文件打开预览 ────────────────────────────────────────────────
test('T7: 列视图 → 点击文件 → 预览内容，退出 FolderView', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-notes"]')
  await page.click('[data-testid="view-btn-column"]')

  // 点击 daily.md
  await page.click('.folder-column-row:has-text("daily.md")')

  // ContentArea 显示 MarkdownPreview
  await expect(page.locator('[data-testid="markdown-preview"]')).toBeVisible()
  await expect(page.locator('[data-testid="folder-view"]')).not.toBeVisible()
})

// ─── T8 面包屑导航 ────────────────────────────────────────────────────────────
test('T8: 面包屑点击父路径段跳转', async ({ page }) => {
  await page.goto('/')

  // 导航到 notes/sub（通过列视图）
  await page.click('[data-testid="tree-node-notes"]')
  await page.click('[data-testid="view-btn-column"]')
  await page.click('.folder-column-row:has-text("sub")')

  // 面包屑包含 notes 和 sub
  const breadcrumb = page.locator('.folder-breadcrumb')
  await expect(breadcrumb).toContainText('notes')
  await expect(breadcrumb).toContainText('sub')

  // 点击 notes 面包屑段，导航回 notes
  await breadcrumb.locator('.folder-breadcrumb-seg:has-text("notes")').click()

  // 仍在 FolderView，显示 notes 内容
  await expect(page.locator('[data-testid="folder-view"]')).toBeVisible()
  await expect(breadcrumb).not.toContainText('sub')
})

// ─── T9 localStorage 持久化 ───────────────────────────────────────────────────
test('T9: 视图模式跨页面刷新保持', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-notes"]')

  // 切换到网格视图 + L 尺寸
  await page.click('[data-testid="view-btn-grid"]')
  await page.click('[data-testid="card-size-l"]')

  // 刷新页面
  await page.reload()
  await page.click('[data-testid="tree-node-notes"]')

  // 仍是网格视图
  await expect(page.locator('[data-testid="folder-grid"]')).toBeVisible()

  // 尺寸仍是 L
  await expect(page.locator('[data-testid="card-size-l"]')).toHaveClass(/active/)
})

// ─── T10 URL 状态恢复 ─────────────────────────────────────────────────────────
test('T10: 直接访问文件夹 URL 恢复 FolderView', async ({ page }) => {
  // 直接访问文件夹路径
  await page.goto('/notes')

  // 等待 tree 加载，FolderView 出现
  await expect(page.locator('[data-testid="folder-view"]')).toBeVisible({ timeout: 10000 })

  // 面包屑包含 notes
  await expect(page.locator('.folder-breadcrumb')).toContainText('notes')
})

// ─── T11 图片加载失败降级 ─────────────────────────────────────────────────────
test('T11: 图片 404 时回退到文件图标', async ({ page }) => {
  // 拦截 /api/asset/ 请求，返回 404
  await page.route('/api/asset/**', route => route.fulfill({ status: 404, body: 'not found' }))

  await page.goto('/')
  await page.click('[data-testid="tree-node-images"]')
  await page.click('[data-testid="view-btn-grid"]')

  // 等待卡片渲染
  await expect(page.locator('.folder-card')).not.toHaveCount(0)

  // 图片加载失败后，图标可见
  const card = page.locator('.folder-card').first()
  await expect(card.locator('.folder-card-icon')).toBeVisible()
})

// ─── T12 空文件夹 ─────────────────────────────────────────────────────────────
test('T12: 空文件夹显示空状态', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-empty-folder"]')

  await expect(page.locator('[data-testid="folder-view"]')).toBeVisible()

  // 空状态提示
  await expect(page.locator('[data-testid="folder-empty"]')).toBeVisible()
  await expect(page.locator('[data-testid="folder-empty"]')).toContainText('空')
})
