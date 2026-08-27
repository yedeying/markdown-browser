import { test, expect } from '@playwright/test'
import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

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
  // 骨架延迟 500ms 才出现；请求被 gate 住时应能等到
  await expect(page.locator('[data-testid="folder-skeleton"]')).toBeVisible({ timeout: 3000 })
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

test('2f: deep link into a dot-directory auto-enables show hidden and opens the file', async ({ page }) => {
  // 直链 .private/... 时不应因默认隐藏而 /api/stat 404；应打开开关并渲染内容
  await page.goto('/.private/plain-name.md')
  await expect(page.locator('[data-testid="toggle-hidden-files"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-testid="markdown-preview"]')).toContainText('Plain Name', { timeout: 15000 })
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

async function openShareDialog(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.click('[data-testid="tree-node-notes"]')
  await page.waitForSelector('[data-testid="folder-view"]')
  await page.locator('.folder-list-row:has-text("daily.md")').click({ button: 'right' })
  await page.click('.ctx-item:has-text("分享")')
  await page.waitForSelector('.share-dialog')
}

test('share dialog closes on ESC, matching ContextModal / BottomSheet / ContextMenu', async ({ page }) => {
  await openShareDialog(page)
  await page.locator('.share-ttl-btn:has-text("30 天")').click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.share-dialog')).toHaveCount(0)
})

test('controls without a .btn class still focus with the accent ring, not the browser blue', async ({ page }) => {
  await openShareDialog(page)

  // A control with no explicit focus style falls back to Chrome's blue focus ring,
  // which clashes with the orange accent. .share-ttl-btn carries no .btn class, so it
  // only gets a ring from the global :focus-visible rule in base.css.
  // Tab first to put the browser in keyboard modality — that is what makes Chrome
  // treat the subsequent focus as :focus-visible (the same reason the stray blue ring
  // appeared only after a key press).
  await page.keyboard.press('Tab')
  const btn = page.locator('.share-ttl-btn:has-text("30 天")')
  await btn.evaluate((el: HTMLElement) => el.focus())
  await expect(btn).toHaveCSS('outline-color', 'rgb(255, 123, 71)')
})

async function openSettings(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.locator('[data-testid="open-settings"]').click()
  return page.getByRole('dialog', { name: '设置' })
}

test('settings opens from the header and closes with Escape', async ({ page }) => {
  const dialog = await openSettings(page)
  await expect(dialog).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('settings applies theme, accent, and reading preferences immediately', async ({ page }) => {
  const dialog = await openSettings(page)

  await dialog.getByRole('radio', { name: '浅色' }).check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await dialog.getByRole('radio', { name: '蓝' }).check()
  await expect.poll(() => page.locator('html').evaluate((el) =>
    el.style.getPropertyValue('--accent'),
  )).toBe('#0969da')

  await dialog.getByLabel('内容宽度').selectOption('1140')
  await dialog.getByLabel('正文字号').selectOption('17')
  await dialog.getByLabel('行高').selectOption('1.9')
  await expect.poll(() => page.locator('html').evaluate((el) => ({
    width: el.style.getPropertyValue('--reading-width'),
    fontSize: el.style.getPropertyValue('--reading-font-size'),
    lineHeight: el.style.getPropertyValue('--reading-line-height'),
  }))).toEqual({ width: '1140px', fontSize: '17px', lineHeight: '1.9' })
})

test('settings synchronizes hidden files and the existing folder view without reload', async ({ page }) => {
  const dialog = await openSettings(page)
  await expect(page.locator('[data-testid="tree-node-.hidden-note.md"]')).toHaveCount(0)

  await dialog.getByLabel('显示隐藏文件').check()
  await expect(page.locator('[data-testid="tree-node-.hidden-note.md"]')).toBeVisible()

  await dialog.getByLabel('默认视图').selectOption('grid')
  await page.keyboard.press('Escape')
  await expect(page.locator('.folder-grid')).toBeVisible()
  await expect(page.locator('[data-testid="view-btn-grid"]')).toHaveClass(/active/)
})

test('settings keeps share as an icon-only accessible header action', async ({ page }) => {
  await page.goto('/')
  const share = page.getByRole('button', { name: '分享此文件夹' })
  await expect(share).toBeVisible()
  await expect(share).toHaveText('')
})

test('settings reset requires confirmation before clearing local preferences', async ({ page }) => {
  const dialog = await openSettings(page)
  await dialog.getByRole('radio', { name: '浅色' }).check()

  await dialog.getByRole('button', { name: '重置本地偏好' }).click()
  const confirmation = page.getByRole('alertdialog', { name: '确认重置本地偏好' })
  await expect(confirmation).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await confirmation.getByRole('button', { name: '取消' }).click()
  await expect(confirmation).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await dialog.getByRole('button', { name: '重置本地偏好' }).click()
  await confirmation.getByRole('button', { name: '确认重置' }).click()
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('[data-testid="open-settings"]')).toBeVisible()
})

test('settings reset confirmation traps Tab focus away from the underlying controls', async ({ page }) => {
  const dialog = await openSettings(page)
  const underlyingTheme = page.locator('.settings-dialog input[name="settings-theme"][value="light"]')

  await dialog.getByRole('button', { name: '重置本地偏好' }).click()
  const confirmation = page.getByRole('alertdialog', { name: '确认重置本地偏好' })
  const cancel = confirmation.getByRole('button', { name: '取消' })
  const confirm = confirmation.getByRole('button', { name: '确认重置' })
  await expect(cancel).toBeFocused()

  await page.keyboard.press('Shift+Tab')
  await expect(confirm).toBeFocused()
  await expect(underlyingTheme).not.toBeFocused()

  await page.keyboard.press('Tab')
  await expect(cancel).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(confirm).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(cancel).toBeFocused()
  await expect(underlyingTheme).not.toBeFocused()
})

test('settings reset confirmation restores focus to its trigger after Cancel and Escape', async ({ page }) => {
  const dialog = await openSettings(page)
  const reset = dialog.getByRole('button', { name: '重置本地偏好' })
  const confirmation = page.getByRole('alertdialog', { name: '确认重置本地偏好' })

  await reset.click()
  await expect(confirmation.getByRole('button', { name: '取消' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(confirmation).toHaveCount(0)
  await expect(reset).toBeFocused()

  await reset.click()
  await expect(confirmation).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(confirmation).toHaveCount(0)
  await expect(reset).toBeFocused()
})

test('settings reset confirmation ignores clicks on the shared backdrop', async ({ page }) => {
  const dialog = await openSettings(page)
  await dialog.getByRole('button', { name: '重置本地偏好' }).click()
  const confirmation = page.getByRole('alertdialog', { name: '确认重置本地偏好' })
  await expect(confirmation).toBeVisible()

  await page.locator('.settings-overlay').click({ position: { x: 4, y: 4 } })

  await expect(confirmation).toBeVisible()
  await expect(page.locator('.settings-dialog')).toBeAttached()
})

// The fixture server runs in dir mode against tests/fixtures/docs, so saving a
// startup mode writes a real .vmd-config.json there. That file decides the next
// launch's root, so leaving one behind would make every later run start in multi
// mode — hence the unconditional cleanup around these tests.
test.describe('settings mount mode', () => {
  // These tests write and remove one shared config file on one shared server, so
  // they cannot overlap: a parallel save would make the "no config yet" case see
  // mounts that another test had just persisted.
  test.describe.configure({ mode: 'serial' })

  const fixtureConfig = join(process.cwd(), 'tests/fixtures/docs/.vmd-config.json')
  const removeFixtureConfig = () => {
    try {
      unlinkSync(fixtureConfig)
    } catch {
      // already absent, which is the state we want
    }
  }

  test.beforeEach(removeFixtureConfig)
  test.afterEach(removeFixtureConfig)

  test('settings loads the startup mount mode without writing a config file', async ({ page }) => {
    const dialog = await openSettings(page)
    const mount = dialog.locator('.settings-mount')

    await expect(mount.getByTestId('mount-mode-current')).toHaveText('单目录模式')
    // Merely opening the dialog must not persist anything: a GET that created the
    // config would silently pin the next launch's root directory.
    expect(existsSync(fixtureConfig)).toBe(false)

    // No mounts exist yet, so single-directory startup has nothing to point at
    await expect(mount.getByTestId('mount-mode-no-mounts')).toBeVisible()
    await expect(mount.getByTestId('mount-mode-save')).toBeDisabled()
  })

  test('saving the multi startup mode reports that a restart is required', async ({ page }) => {
    const dialog = await openSettings(page)
    const mount = dialog.locator('.settings-mount')

    await mount.getByRole('radio', { name: '多挂载' }).check()
    await expect(mount.getByTestId('mount-mode-promote-hint')).toContainText('docs')

    await mount.getByTestId('mount-mode-save').click()
    await expect(mount.getByTestId('mount-mode-saved')).toContainText('重启服务后生效')
    expect(existsSync(fixtureConfig)).toBe(true)

    // The running process does not hot-switch its root, but the promoted
    // directory is now a mount that single-directory startup can select.
    await expect(mount.getByTestId('mount-mode-current')).toHaveText('单目录模式')
    await mount.getByRole('radio', { name: '单目录' }).check()
    await expect(mount.getByTestId('mount-mode-alias')).toBeVisible()
    await expect(mount.getByTestId('mount-mode-save')).toBeEnabled()
  })

  test('settings surfaces a save failure instead of claiming success', async ({ page }) => {
    const dialog = await openSettings(page)
    const mount = dialog.locator('.settings-mount')

    await page.route('**/api/admin/mount-mode', (route) => route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: '配置目录不存在' }),
    }))

    await mount.getByRole('radio', { name: '多挂载' }).check()
    await mount.getByTestId('mount-mode-save').click()

    await expect(mount.getByTestId('mount-mode-error')).toHaveText('配置目录不存在')
    await expect(mount.getByTestId('mount-mode-saved')).toHaveCount(0)
    expect(existsSync(fixtureConfig)).toBe(false)
  })

  test('an anonymous folder share never exposes the mount settings', async ({ page, request }) => {
    const created = await request.post('/api/share', {
      data: { path: '.', type: 'folder', ttl: null },
    })
    const { token } = await created.json() as { token: string }
    try {
      await page.goto(`/share/${token}/`)
      await page.locator('[data-testid="open-settings"]').click()

      const dialog = page.getByRole('dialog', { name: '设置' })
      await expect(dialog).toBeVisible()
      // Share visitors are anonymous: no mount paths, no startup mode switch
      await expect(dialog.locator('.settings-mount')).toHaveCount(0)
      await expect(dialog.getByText('外观')).toBeVisible()
    } finally {
      await request.delete(`/api/share/${token}`)
    }
  })
})
