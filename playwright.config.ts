import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E 测试配置
 *
 * webServer 会自动 `bun run build` 并启动 fixtures 服务（见下方）。
 * 也可手动：bun run build && bun --env-file=/dev/null dist/cli.js tests/fixtures/docs --port 8899
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

  // 自动启动 vmd 服务（指向 fixtures）。使用 dist/cli.js（构建产物）而非 src/cli.ts 直跑：
  // 后者的 import.meta.dir 指向 src/，会把 distPath 解析成 src/client（源码目录，恰好存在，
  // existsSync 检查骗过去但里面是未打包的 TSX），导致服务"看起来启动成功"却输出坏页面 —— 这是
  // e2e 偶发失败的根因之一。先 build 再跑 dist/cli.js 才是构建产物应有的运行方式。
  // --env-file=/dev/null：bun 默认会自动加载仓库根目录的 .env，其中的 VMD_PASSWORD 会让
  // 测试服务器要求登录，导致每个用例都停在登录页。e2e 必须跑在无密码的干净环境里。
  webServer: {
    // 用 PATH 里的 bun（本地与 CI / setup-bun 都适用），避免写死 ~/.bun/bin。
    command: 'bun run build && bun --env-file=/dev/null dist/cli.js tests/fixtures/docs --port 8899',
    url: 'http://localhost:8899',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
