import type { ServerConfig, AuthConfig } from '../types.js'
import { createDirRouter } from './routes/dir.js'
import { createSingleRouter } from './routes/single.js'
import { generateSigningKey } from './auth.js'
import { readFileSync, writeFileSync } from 'fs'
import { join, basename } from 'path'

async function findAvailablePort(startPort: number, maxPort = 9000, host = '0.0.0.0'): Promise<number> {
  for (let port = startPort; port <= maxPort; port++) {
    try {
      // 尝试在该端口启动临时服务器，若成功则端口可用
      const probe = Bun.serve({ port, hostname: host, fetch: () => new Response('') })
      probe.stop(true)
      return port
    } catch {
      // 端口被占用，继续尝试下一个
    }
  }
  throw new Error(`No available port found between ${startPort} and ${maxPort}`)
}

function openBrowser(url: string) {
  // 检查是否在 Docker/容器环境
  if (process.env.DOCKER_CONTAINER === 'true' || process.env.KUBERNETES_SERVICE_HOST) {
    return
  }
  
  // 检查是否在无 GUI 环境（检查 DISPLAY 和 WAYLAND_DISPLAY）
  if ((process.platform === 'linux') && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    return
  }

  const platform = process.platform
  if (platform === 'darwin') {
    Bun.spawn(['open', url])
  } else if (platform === 'linux') {
    Bun.spawn(['xdg-open', url])
  } else if (platform === 'win32') {
    Bun.spawn(['cmd', '/c', 'start', url])
  }
}

/**
 * 在 index.html 中注入运行时配置变量
 * window.__VMD_MODE__ 和 window.__VMD_DIR_NAME__
 */
function patchIndexHtml(distPath: string, config: ServerConfig) {
  const indexPath = join(distPath, 'index.html')
  try {
    let html = readFileSync(indexPath, 'utf-8')
    const dirName = config.mode === 'dir'
      ? basename(config.basePath)
      : basename(config.basePath)
    const script = `<script>window.__VMD_MODE__="${config.mode}";window.__VMD_DIR_NAME__=${JSON.stringify(dirName)};</script>`
    // 插入到 </head> 前
    if (!html.includes('__VMD_MODE__')) {
      html = html.replace('</head>', `${script}\n</head>`)
      writeFileSync(indexPath, html, 'utf-8')
    }
  } catch {
    // ignore - 开发模式下 index.html 由 Vite dev server 处理
  }
}

export async function startServer(config: ServerConfig) {
  const port = await findAvailablePort(config.port)

  // 注入模式变量到 index.html
  patchIndexHtml(config.distPath, config)

  // 认证配置（password 存在时启用）
  let authConfig: AuthConfig | null = null
  if (config.password) {
    authConfig = {
      password: config.password,
      signingKey: generateSigningKey(),
      maxAge: config.sessionMaxAge ?? 7 * 24 * 3600,
    }
  }

  let router: ReturnType<typeof createDirRouter> | ReturnType<typeof createSingleRouter>

  if (config.mode === 'dir') {
    router = createDirRouter(config.basePath, config.distPath, authConfig)
  } else {
    router = createSingleRouter(config.basePath, config.distPath, authConfig)
  }

  const server = Bun.serve({
    port,
    hostname: config.host,
    fetch: router.app.fetch,
  })

  const url = `http://localhost:${port}`
  console.log(`\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`)
  console.log(`\x1b[32m✓ vmd 服务器已启动\x1b[0m`)
  console.log(`\x1b[0m  URL: \x1b[34m${url}\x1b[0m`)
  if (config.mode === 'dir') {
    console.log(`\x1b[0m  目录: \x1b[33m${config.basePath}\x1b[0m`)
  } else {
    console.log(`\x1b[0m  文件: \x1b[33m${config.basePath}\x1b[0m`)
  }
  if (authConfig) {
    console.log(`\x1b[32m  认证: 已启用（密码保护）\x1b[0m`)
  }
  console.log(`\x1b[33m  提示: 按 Ctrl+C 停止服务器\x1b[0m`)
  console.log(`\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`)

  openBrowser(url)

  process.on('SIGINT', () => {
    console.log('\n\x1b[33m正在停止服务器...\x1b[0m')
    router.watcher.close()
    server.stop()
    console.log('\x1b[32m✓ 服务器已停止\x1b[0m')
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    router.watcher.close()
    server.stop()
    process.exit(0)
  })
}
