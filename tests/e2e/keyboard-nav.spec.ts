import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('vmd_folder_view_mode')
    localStorage.removeItem('vmd_expanded_folders')
  })
})

test('sidebar tree j/k moves selection among visible rows', async ({ page }) => {
  await page.goto('/')
  const files = page.locator('.file-list .file-row')
  await expect(files.first()).toBeVisible({ timeout: 15000 })
  await files.first().click()
  await expect(files.first()).toHaveClass(/active/)

  const before = await page.locator('.file-list .file-row.active, .file-list .folder-row.active').count()
  expect(before).toBeGreaterThan(0)

  await page.keyboard.press('j')
  // 下一可见项被选中（可能是文件或文件夹）
  await expect(page.locator('.file-list .file-row.active, .file-list .folder-row.active')).toHaveCount(1)

  await page.keyboard.press('k')
  await expect(page.locator('.file-list .file-row.active, .file-list .folder-row.active')).toHaveCount(1)
})

test('sidebar tree: Space toggles expand; left collapses and moves to parent', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-notes"]')
  await expect(page.locator('[data-testid="folder-view"]')).toBeVisible({ timeout: 15000 })
  await page.evaluate(() => {
    ;(window as unknown as { __VMD_SET_NAV_FOCUS__: (f: string) => void }).__VMD_SET_NAV_FOCUS__('tree')
  })

  const notesToggle = page.locator('[data-testid="tree-node-notes"] .folder-toggle')
  // 点击行只选中不展开；点三角或空格才展开
  await expect(notesToggle).not.toHaveClass(/expanded/)

  await page.keyboard.press('Space')
  await expect(notesToggle).toHaveClass(/expanded/)
  // UI 必须真正露出子项（不只是内部 expanded 状态）
  await expect(page.locator('.file-list [data-path="notes/daily.md"]')).toBeVisible()
  await page.keyboard.press('Space')
  await expect(notesToggle).not.toHaveClass(/expanded/)
  await expect(page.locator('.file-list [data-path="notes/daily.md"]')).toHaveCount(0)

  // 再展开后进入子项，← 一次即折叠 notes 且光标停在 notes（不慢一拍）
  await page.keyboard.press('Space')
  await expect(notesToggle).toHaveClass(/expanded/)
  await expect(page.locator('.file-list [data-path="notes/daily.md"]')).toBeVisible()
  await page.locator('[data-testid="tree-node-notes-daily.md"]').click()
  await expect(page.locator('[data-testid="tree-node-notes-daily.md"]')).toHaveClass(/active/)
  await page.evaluate(() => {
    ;(window as unknown as { __VMD_SET_NAV_FOCUS__: (f: string) => void }).__VMD_SET_NAV_FOCUS__('tree')
  })
  await page.keyboard.press('ArrowLeft')
  await expect(notesToggle).not.toHaveClass(/expanded/)
  await expect(page.locator('[data-testid="tree-node-notes"]')).toHaveClass(/active/)
  await expect(page.locator('.file-list [data-path="notes/daily.md"]')).toHaveCount(0)

  // 在已展开的 notes 上再 ←：折叠并回到根行
  await page.keyboard.press('Space')
  await expect(notesToggle).toHaveClass(/expanded/)
  await page.keyboard.press('ArrowLeft')
  await expect(notesToggle).not.toHaveClass(/expanded/)
  await expect(page.locator('.sidebar-root-row')).toHaveClass(/active/)
  await expect(page.locator('[data-testid="tree-node-notes"]')).not.toHaveClass(/active/)
})

test('sidebar tree: Enter opens folder column view on first item', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-notes"]')
  await expect(page.locator('[data-testid="folder-view"]')).toBeVisible({ timeout: 15000 })
  await page.click('[data-testid="view-btn-column"]')
  await expect(page.locator('.folder-columns-outer')).toBeVisible()

  // 回到树焦点后 →（与 Enter 相同）：选中第一列第一项
  await page.click('[data-testid="tree-node-notes"]')
  await page.evaluate(() => {
    ;(window as unknown as { __VMD_SET_NAV_FOCUS__: (f: string) => void }).__VMD_SET_NAV_FOCUS__('tree')
  })
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.folder-column').first().locator('.folder-column-row.active')).toHaveCount(1)
  await expect(page.evaluate(() =>
    (window as unknown as { __VMD_GET_NAV_FOCUS__: () => string }).__VMD_GET_NAV_FOCUS__()
  )).resolves.toBe('folder')
})

test('folder grid: j moves focus without opening; Enter opens', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-notes"]')
  await expect(page.locator('[data-testid="folder-view"]')).toBeVisible({ timeout: 15000 })

  await page.click('[data-testid="view-btn-grid"]')
  await expect(page.locator('[data-testid="folder-grid"]')).toBeVisible()
  // 点面包屑区域挪走工具栏焦点，避免点到卡片 checkbox
  await page.locator('.folder-breadcrumb').click({ position: { x: 8, y: 8 } })

  const cards = page.locator('.folder-card')
  await expect(cards.first()).toBeVisible()
  test.skip((await cards.count()) < 2, 'need at least 2 items')

  await page.keyboard.press('j')
  await expect(page.locator('.folder-card.kb-focus')).toHaveCount(1)
  await expect(page.locator('[data-testid="folder-view"]')).toBeVisible()

  // 移到 daily.md（文件）再 Enter 打开
  for (let i = 0; i < 6; i++) {
    const path = await page.locator('.folder-card.kb-focus').getAttribute('data-path')
    if (path?.endsWith('daily.md')) break
    await page.keyboard.press('ArrowRight')
  }
  await expect(page.locator('.folder-card.kb-focus[data-path="notes/daily.md"]')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.locator('.content-header')).toContainText('daily.md')
  await expect(page.locator('[data-testid="folder-view"]')).toHaveCount(0)
})

test('folder grid: ArrowRight moves cursor only; single highlight', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-notes"]')
  await expect(page.locator('[data-testid="folder-view"]')).toBeVisible({ timeout: 15000 })
  await page.click('[data-testid="view-btn-grid"]')
  await expect(page.locator('[data-testid="folder-grid"]')).toBeVisible()
  await page.locator('.folder-breadcrumb').click({ position: { x: 8, y: 8 } })

  await page.keyboard.press('j')
  await expect(page.locator('.folder-card.kb-focus')).toHaveCount(1)
  const first = await page.locator('.folder-card.kb-focus').getAttribute('data-path')

  // → 不应进入子目录离开网格
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-testid="folder-grid"]')).toBeVisible()
  await expect(page.locator('.folder-card.kb-focus')).toHaveCount(1)
  const second = await page.locator('.folder-card.kb-focus').getAttribute('data-path')
  expect(second).not.toBe(first)
  // 不应同时出现 active + kb-focus 双高亮
  await expect(page.locator('.folder-card.active')).toHaveCount(0)
})

test('folder blank context menu has no rename', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-notes"]')
  await expect(page.locator('[data-testid="folder-view"]')).toBeVisible({ timeout: 15000 })
  await page.click('[data-testid="view-btn-grid"]')

  await page.locator('.folder-grid-wrap').click({ button: 'right', position: { x: 8, y: 8 } })
  await expect(page.locator('.ctx-menu')).toBeVisible()
  await expect(page.locator('.ctx-menu')).toContainText('新建文件夹')
  await expect(page.locator('.ctx-menu')).not.toContainText('重命名')
})

test('ctrl multi-select and re-right-click moves custom menu', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-notes"]')
  await expect(page.locator('[data-testid="folder-view"]')).toBeVisible({ timeout: 15000 })
  await page.click('[data-testid="view-btn-grid"]')

  const cards = page.locator('.folder-card')
  await expect(cards.first()).toBeVisible()
  test.skip((await cards.count()) < 2, 'need at least 2 items')

  const paths = await cards.evaluateAll((els) => els.slice(0, 2).map((el) => el.getAttribute('data-path')))
  for (const path of paths) {
    await page.locator(`.folder-card[data-path="${path}"]`).dispatchEvent('click', {
      ctrlKey: true,
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
  }
  await expect(page.locator('.folder-card.selected')).toHaveCount(2)
  await expect(page.locator('.folder-selection-bar')).toBeVisible()

  await cards.nth(0).click({ button: 'right' })
  await expect(page.locator('.ctx-menu')).toBeVisible()
  await expect(page.locator('.ctx-menu')).toContainText('2 项')

  // 菜单遮罩上再右键到网格空白 → 定制菜单挪到新位置
  const grid = page.locator('.folder-grid-wrap')
  const box = await grid.boundingBox()
  expect(box).toBeTruthy()
  await page.mouse.click(box!.x + 10, box!.y + 10, { button: 'right' })
  await expect(page.locator('.ctx-menu')).toBeVisible()
  await expect(page.locator('.ctx-menu')).toContainText('新建文件夹')
})

test('column view: left on leftmost column returns focus to tree on current folder', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-notes"]')
  await expect(page.locator('[data-testid="folder-view"]')).toBeVisible({ timeout: 15000 })
  await page.click('[data-testid="view-btn-column"]')
  await expect(page.locator('.folder-columns-outer')).toBeVisible()

  // 点选一项后再 ← 回树，应清除列内光标
  await page.locator('.folder-column-row[data-path="notes/sub"]').click()
  await expect(page.locator('.folder-column-row.active')).toHaveCount(1)

  await page.keyboard.press('h')
  await expect(page.locator('[data-testid="tree-node-notes"]')).toHaveClass(/active/)
  await expect(page.locator('.content-header')).toContainText('notes')
  await expect(page.locator('.folder-column-row.active')).toHaveCount(0)

  // 焦点已在树：j 应移动侧栏选中项，而不是列视图行
  await page.keyboard.press('j')
  await expect(page.locator('[data-testid="tree-node-notes"]')).not.toHaveClass(/active/)
})

test('column view: right enters first subdirectory even when files sort first', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-notes"]')
  await expect(page.locator('[data-testid="folder-view"]')).toBeVisible({ timeout: 15000 })
  await page.click('[data-testid="view-btn-column"]')
  await expect(page.locator('.folder-columns-outer')).toBeVisible()

  await page.locator('.folder-columns-outer').click({ position: { x: 8, y: 40 } })
  // notes 下 daily.md 会排在 sub/ 前；→ 应进入 sub 而不是打开 md
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.folder-column')).toHaveCount(2)
  await expect(page.locator('.folder-column').nth(1).locator('.folder-column-header')).toContainText('sub')
  // 并选中下一列首项（sub 下只有 deep.md）
  await expect(page.locator('.folder-column-row.active[data-path="notes/sub/deep.md"]')).toBeVisible()
})

test('column view: right on open folder moves selection into next column', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-notes"]')
  await expect(page.locator('[data-testid="folder-view"]')).toBeVisible({ timeout: 15000 })
  await page.click('[data-testid="view-btn-column"]')
  await expect(page.locator('.folder-columns-outer')).toBeVisible()

  // 点击 sub：右侧列已展开，但下一列尚无选中（与图示 mcp-server→src 相同）
  await page.locator('.folder-column-row[data-path="notes/sub"]').click()
  await expect(page.locator('.folder-column')).toHaveCount(2)
  await expect(page.locator('.folder-column').nth(1).locator('.folder-column-row.active')).toHaveCount(0)

  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.folder-column-row.active[data-path="notes/sub/deep.md"]')).toBeVisible()
})
