import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E 测试配置
 *
 * 使用前需要先启动 vmd 服务，指向 tests/fixtures/docs 目录：
 *   ~/.bun/bin/bun run src/cli.ts tests/fixtures/docs --port 8899
 *
 * 或使用 webServer 配置自动启动（见下方注释）
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:8899',
    trace: 'on-first-retry',
    // 开发时可打开浏览器查看
    // headless: false,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // 自动启动 vmd 服务（指向 fixtures）
  webServer: {
    command: `${process.env.HOME}/.bun/bin/bun run src/cli.ts tests/fixtures/docs --port 8899`,
    url: 'http://localhost:8899',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})
