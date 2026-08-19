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
