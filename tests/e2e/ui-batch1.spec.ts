import { test, expect } from '@playwright/test'

test('2a: folder skeleton shows during lazy children load, then folder-view replaces it; switching away from a file preview leaves no stale markdown-preview', async ({ page }) => {
  await page.goto('/')

  // notes/sub's own children are NOT included in the initial root fetch (depth=1
  // only resolves one level down from root). Selecting "notes" triggers a
  // depth=1 fetch *of notes* which, as a side effect, also patches in sub's
  // children — so we must hold both requests to keep sub's children genuinely
  // unresolved long enough to observe the skeleton branch specifically.
  const lazyFetchMatcher = (url: URL) => {
    if (url.pathname !== '/api/files') return false
    const path = url.searchParams.get('path')
    return path === 'notes' || path === 'notes/sub'
  }

  let releaseGate: () => void
  const gate = new Promise<void>((resolve) => { releaseGate = resolve })
  await page.route(lazyFetchMatcher, async (route) => {
    await gate
    await route.continue()
  })

  await page.click('[data-testid="tree-node-notes"]')
  await expect(page.locator('[data-testid="tree-node-notes-sub"]')).toBeVisible()

  // Click into notes/sub while its children fetch is held: must show the
  // skeleton, not a stale/empty FolderView (this is the actual 2a fix under test).
  await page.click('[data-testid="tree-node-notes-sub"]')
  await expect(page.locator('[data-testid="folder-skeleton"]')).toBeVisible()
  await expect(page.locator('[data-testid="folder-view"]')).not.toBeVisible()
  await expect(page.locator('[data-testid="markdown-preview"]')).not.toBeVisible()

  // Release the delayed response: skeleton should be replaced by the real FolderView.
  releaseGate!()
  await expect(page.locator('[data-testid="folder-view"]')).toBeVisible()
  await expect(page.locator('[data-testid="folder-skeleton"]')).not.toBeVisible()
  await expect(page.locator('.folder-breadcrumb')).toContainText('sub')

  // Open a file, then switch back to the (already-loaded) parent folder: the
  // previous markdown preview must not linger behind/instead of the folder view.
  await page.click('.folder-list-row:has-text("deep.md")')
  await expect(page.locator('[data-testid="markdown-preview"]')).toBeVisible()

  await page.click('[data-testid="tree-node-notes"]')
  await expect(page.locator('[data-testid="folder-view"], [data-testid="folder-skeleton"]')).toBeVisible()
  await expect(page.locator('[data-testid="markdown-preview"]')).not.toBeVisible()
  await expect(page.locator('.folder-breadcrumb, .current-file').first()).toContainText('notes')
})

test('2a-failure: a failed folder children load shows an error with retry, not an endless skeleton', async ({ page }) => {
  // notes/sub 的 children 只能通过 path=notes（或 path=notes/sub）的请求拿到，
  // 两个都打掉就能造出"懒加载失败"的状态。
  let blocked = true
  await page.route(
    (url) => url.pathname === '/api/files' && ['notes', 'notes/sub'].includes(url.searchParams.get('path') ?? ''),
    async (route) => (blocked ? route.abort('failed') : route.continue()),
  )

  await page.goto('/')
  await page.click('[data-testid="tree-node-notes"]')
  await page.click('[data-testid="tree-node-notes-sub"]')

  await expect(page.locator('[data-testid="folder-load-retry"]')).toBeVisible()
  await expect(page.locator('[data-testid="folder-skeleton"]')).not.toBeVisible()

  blocked = false
  await page.click('[data-testid="folder-load-retry"]')
  await expect(page.locator('[data-testid="folder-view"]')).toBeVisible()
  await expect(page.locator('[data-testid="folder-load-retry"]')).toHaveCount(0)
})

test('2h: deep link to image opens ImageViewer', async ({ page }) => {
  await page.goto('/images/photo.png')
  await expect(page.locator('.image-viewer img, [data-testid="image-viewer"]').first()).toBeVisible({ timeout: 10000 })
  await expect(page.locator('[data-testid="markdown-preview"]')).toHaveCount(0)
})

test('2e: sort preference survives reload', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="tree-node-notes"]')
  await expect(page.locator('[data-testid="folder-list"]')).toBeVisible()

  // Default sort field is 'name' — switch to 'size' so persistence is actually
  // observable after reload (reverting to the default would also show "sorted"
  // on name, so we deliberately pick a non-default field).
  await page.click('[data-sort="size"]')
  await expect(page.locator('[data-sort="size"]')).toHaveClass(/sorted/)
  await expect(page.locator('[data-sort="name"]')).not.toHaveClass(/sorted/)

  await page.reload()
  await page.click('[data-testid="tree-node-notes"]')
  await expect(page.locator('[data-sort="size"]')).toHaveClass(/sorted/)
})

test('2f: hidden files toggle', async ({ page }) => {
  await page.goto('/')

  // Hidden by default.
  await expect(page.locator('[data-testid="tree-node-.hidden-note.md"]')).toHaveCount(0)

  await page.click('[data-testid="toggle-hidden-files"]')
  await expect(page.locator('[data-testid="tree-node-.hidden-note.md"]')).toBeVisible()

  // Toggle preference persists across reload.
  await page.reload()
  await expect(page.locator('[data-testid="tree-node-.hidden-note.md"]')).toBeVisible()

  // Toggling back off hides it again (both in sidebar tree and folder view).
  await page.click('[data-testid="toggle-hidden-files"]')
  await expect(page.locator('[data-testid="tree-node-.hidden-note.md"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="folder-list"]')).not.toContainText('.hidden-note.md')
})

test('2f-server: the API itself hides dotfiles unless showHidden=1', async ({ request }) => {
  // 客户端过滤不算数：默认响应里根本不能出现点路径，否则任何客户端
  // （curl / 老版本前端）都能拿到 .docker/config.json 之类的文件。
  const listing = await request.get('/api/files?path=&depth=3')
  expect(listing.ok()).toBeTruthy()
  const listingText = await listing.text()
  expect(listingText).not.toContain('.hidden-note.md')
  expect(listingText).not.toContain('.private')
  expect(listingText).toContain('README.md')

  expect((await request.get('/api/files?path=.private&depth=1')).status()).toBe(404)
  expect((await request.get('/api/file/.hidden-note.md')).status()).toBe(404)
  expect((await request.get('/api/file/.private/plain-name.md')).status()).toBe(404)
  expect(await (await request.get('/api/search?q=plain-name&type=name')).json()).toEqual([])

  // 显式开启后同样的请求可用
  const shownListing = await request.get('/api/files?path=&depth=3&showHidden=1')
  expect(await shownListing.text()).toContain('.hidden-note.md')
  expect((await request.get('/api/file/.private/plain-name.md?showHidden=1')).status()).toBe(200)
  const shownSearch = await request.get('/api/search?q=plain-name&type=name&showHidden=1')
  expect((await shownSearch.json() as unknown[]).length).toBeGreaterThan(0)
})

test('2f-server: opening a hidden file still works once the toggle is on', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="toggle-hidden-files"]')

  // 树是重新从服务端拉的（不是本地过滤），点开后内容请求也必须带上 showHidden=1
  await page.click('[data-testid="tree-node-.hidden-note.md"]')
  await expect(page.locator('[data-testid="markdown-preview"]')).toContainText('Hidden Note')
})

test('2f-bugfix: name search does not leak a plain-named file nested inside a dot-directory', async ({ page }) => {
  await page.goto('/')

  // "plain-name.md" itself is not a dotfile, but its parent ".private/" is —
  // with hidden files off, the search must not silently count this as a match
  // (previously the sidebar only checked isDotfile(fileName), leaking it).
  await page.fill('.search-input', 'plain-name')
  await expect(page.getByText('无匹配结果')).toBeVisible()

  // Enabling "show hidden" surfaces the match again.
  await page.click('[data-testid="toggle-hidden-files"]')
  await expect(page.getByText('无匹配结果')).not.toBeVisible()
})
