import type { ServerConfig, AuthConfig, MountConfig } from '../types.js'
import { createDirRouter } from './routes/dir.js'
import { createSingleRouter } from './routes/single.js'
import { createAdminRoutes } from './routes/admin.js'
import { generateSigningKey } from './auth.js'
import { MountManager } from './mount-manager.js'
import { treeCache } from './tree-cache.js'
import { Hono } from 'hono'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, basename, extname } from 'path'

async function findAvailablePort(startPort: number, host = '0.0.0.0'): Promise<number> {
  const maxPort = Math.max(startPort + 100, 9000)
  for (let port = startPort; port <= maxPort; port++) {
    try {
      const probe = Bun.serve({ port, hostname: host, fetch: () => new Response('') })
      probe.stop(true)
      return port
    } catch {
      // 端口被占用，继续
    }
  }
  throw new Error(`No available port found between ${startPort} and ${maxPort}`)
}

function openBrowser(url: string) {
  if (process.env.DOCKER_CONTAINER === 'true' || process.env.KUBERNETES_SERVICE_HOST) {
    return
  }
  if ((process.platform === 'linux') && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    return
  }
  const platform = process.platform
  if (platform === 'darwin') Bun.spawn(['open', url])
  else if (platform === 'linux') Bun.spawn(['xdg-open', url])
  else if (platform === 'win32') Bun.spawn(['cmd', '/c', 'start', url])
}

/**
 * 在 index.html 中注入运行时配置变量
 * dir/single 模式：注入 __VMD_MODE__ 和 __VMD_DIR_NAME__（持久化写回磁盘，方便缓存）
 * multi 模式：不写磁盘，由服务端动态响应
 */
function patchIndexHtml(distPath: string, config: ServerConfig) {
  if (config.mode === 'multi') return
  const indexPath = join(distPath, 'index.html')
  try {
    let html = readFileSync(indexPath, 'utf-8')
    const dirName = config.basePath ? basename(config.basePath) : 'vmd'
    const script = `<script>window.__VMD_MODE__="${config.mode}";window.__VMD_DIR_NAME__=${JSON.stringify(dirName)};</script>`
    if (!html.includes('__VMD_MODE__')) {
      html = html.replace('</head>', `${script}\n</head>`)
      writeFileSync(indexPath, html, 'utf-8')
    }
  } catch {
    // ignore
  }
}

/**
 * 读取 index.html 模板并注入 multi 模式的运行时变量
 */
function renderMultiIndex(distPath: string, payload: {
  mountAlias?: string
  mounts: Array<{ alias: string; name: string }>
  adminEnabled: boolean
}): string | null {
  const indexPath = join(distPath, 'index.html')
  try {
    let html = readFileSync(indexPath, 'utf-8')
    // 移除旧注入（若此前跑过 dir/single 模式残留）
    html = html.replace(/<script>window\.__VMD_MODE__=.*?<\/script>\s*/g, '')
    const vars: string[] = [
      `window.__VMD_MODE__="multi"`,
      `window.__VMD_MOUNTS__=${JSON.stringify(payload.mounts)}`,
      `window.__VMD_ADMIN_ENABLED__=${payload.adminEnabled}`,
    ]
    if (payload.mountAlias) {
      vars.push(`window.__VMD_CURRENT_MOUNT__=${JSON.stringify(payload.mountAlias)}`)
      const m = payload.mounts.find(x => x.alias === payload.mountAlias)
      if (m) vars.push(`window.__VMD_DIR_NAME__=${JSON.stringify(m.name)}`)
    }
    const script = `<script>${vars.join(';')};</script>`
    return html.replace('</head>', `${script}\n</head>`)
  } catch {
    return null
  }
}

export async function startServer(config: ServerConfig) {
  const port = await findAvailablePort(config.port)

  // 注入模式变量（multi 模式跳过）
  patchIndexHtml(config.distPath, config)

  // 访问密码（全局）
  let authConfig: AuthConfig | null = null
  if (config.password) {
    authConfig = {
      password: config.password,
      signingKey: generateSigningKey(),
      maxAge: config.sessionMaxAge ?? 7 * 24 * 3600,
    }
  }

  if (config.mode === 'multi') {
    await startMultiServer(config, authConfig, port)
    return
  }

  // dir / single 模式：沿用旧逻辑
  let router: ReturnType<typeof createDirRouter> | ReturnType<typeof createSingleRouter>
  if (config.mode === 'dir') {
    router = createDirRouter(config.basePath!, config.distPath, authConfig)
  } else {
    router = createSingleRouter(config.basePath!, config.distPath, authConfig)
  }

  const server = Bun.serve({
    port,
    hostname: config.host,
    fetch: router.app.fetch,
  })

  printBanner(config, authConfig, port)
  openBrowser(`http://localhost:${port}`)

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

// ============================================================
// Multi 模式
// ============================================================

async function startMultiServer(config: ServerConfig, authConfig: AuthConfig | null, port: number) {
  const mountManager = new MountManager(config.workspace!, config.mounts || [])

  // 管理员密码（可选）
  let adminAuth: AuthConfig | null = null
  if (config.adminPassword) {
    adminAuth = {
      password: config.adminPassword,
      signingKey: generateSigningKey(),
      maxAge: config.sessionMaxAge ?? 7 * 24 * 3600,
    }
  }

  // 每个挂载点一个子 app 实例（带独立 watcher / shareStore）
  interface MountInstance {
    alias: string
    router: ReturnType<typeof createDirRouter>
  }
  const instances = new Map<string, MountInstance>()

  function rebuildMount(alias: string) {
    // 销毁旧 instance
    const old = instances.get(alias)
    if (old) {
      try { old.router.watcher.close() } catch { /* ignore */ }
      instances.delete(alias)
    }
    const m = mountManager.get(alias)
    if (!m) return
    // 每个 mount 独立路由（内部访问密码与根级共享：如果设置了访问密码，则子 app 也复用）
    const router = createDirRouter(m.path, config.distPath, authConfig)
    instances.set(alias, { alias, router })
  }

  for (const m of mountManager.list()) rebuildMount(m.alias)

  // 挂载点变更 → 重建 + 失效缓存
  mountManager.onChange((e) => {
    if (e.type === 'add' || e.type === 'update') {
      rebuildMount(e.alias!)
    } else if (e.type === 'delete') {
      const inst = instances.get(e.alias!)
      if (inst) {
        try { inst.router.watcher.close() } catch { /* ignore */ }
        instances.delete(e.alias!)
      }
    } else if (e.type === 'reload') {
      for (const inst of instances.values()) {
        try { inst.router.watcher.close() } catch { /* ignore */ }
      }
      instances.clear()
      for (const m of mountManager.list()) rebuildMount(m.alias)
    }
    treeCache.clear()
  })

  // 主 app
  const app = new Hono()

  app.use('*', async (c, next) => {
    await next()
    c.header('Access-Control-Allow-Origin', '*')
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    c.header('Access-Control-Allow-Headers', 'Content-Type')
  })
  app.options('*', (c) => c.text('', 204))

  // 认证（访问密码）路由；admin 自有鉴权
  if (authConfig) {
    const { createAuthRoutes, createAuthMiddleware } = await import('./auth.js')
    createAuthRoutes(app, authConfig)
    // 访问密码白名单：
    // - 公共挂载列表（landing 页需要）
    // - admin 自有鉴权的所有端点
    // - landing 页自身（/ 和 /admin）不强制登录，但挂载点内容仍需访问密码保护
    app.use('*', async (c, next) => {
      const p = c.req.path
      if (
        p === '/api/mounts' ||
        p.startsWith('/api/admin/') ||
        p === '/api/admin'
      ) return next()
      return createAuthMiddleware(authConfig!)(c, next)
    })
  }

  // 公共挂载点列表
  app.get('/api/mounts', (c) => {
    return c.json({
      mounts: mountManager.list().map(m => ({ alias: m.alias, name: m.name, readonly: !!m.readonly })),
    })
  })

  // 管理 API
  createAdminRoutes(app, mountManager, adminAuth)

  // /m/:alias/* → 分发到对应子 app
  app.all('/m/:alias/*', (c) => {
    const alias = c.req.param('alias')
    const inst = instances.get(alias)
    if (!inst) return c.json({ error: `Mount not found: ${alias}` }, 404)

    // 构造新 Request，去掉 /m/:alias 前缀
    const url = new URL(c.req.url)
    const strippedPath = url.pathname.replace(new RegExp(`^/m/${alias}`), '') || '/'
    const newUrl = new URL(strippedPath + url.search, url.origin)
    const newReq = new Request(newUrl, c.req.raw)
    return inst.router.app.fetch(newReq)
  })

  // /m/:alias 根（无尾部斜杠）
  app.all('/m/:alias', (c) => {
    const alias = c.req.param('alias')
    const inst = instances.get(alias)
    if (!inst) return c.json({ error: `Mount not found: ${alias}` }, 404)
    const url = new URL(c.req.url)
    const newUrl = new URL('/' + url.search, url.origin)
    const newReq = new Request(newUrl, c.req.raw)
    return inst.router.app.fetch(newReq)
  })

  // 静态资源 / landing 页（SPA 入口）
  app.get('/*', (c) => {
    const p = c.req.path === '/' ? '/index.html' : c.req.path
    const filePath = join(config.distPath, p)
    const ext = extname(filePath).toLowerCase()
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
    }

    // 非 html 静态资源直接返回
    if (ext && ext !== '.html' && existsSync(filePath)) {
      try {
        const content = readFileSync(filePath)
        c.header('Content-Type', mimeTypes[ext] || 'application/octet-stream')
        return c.body(content)
      } catch { /* fallthrough */ }
    }

    // SPA fallback：返回注入 multi 配置的 index.html
    const rendered = renderMultiIndex(config.distPath, {
      mounts: mountManager.list().map(m => ({ alias: m.alias, name: m.name })),
      adminEnabled: !!adminAuth,
    })
    if (rendered) {
      c.header('Content-Type', 'text/html; charset=utf-8')
      return c.body(rendered)
    }
    return c.text('Not found', 404)
  })

  const server = Bun.serve({
    port,
    hostname: config.host,
    fetch: app.fetch,
  })

  printBanner(config, authConfig, port, mountManager.list(), !!adminAuth)
  openBrowser(`http://localhost:${port}`)

  const shutdown = () => {
    console.log('\n\x1b[33m正在停止服务器...\x1b[0m')
    for (const inst of instances.values()) {
      try { inst.router.watcher.close() } catch { /* ignore */ }
    }
    server.stop()
    console.log('\x1b[32m✓ 服务器已停止\x1b[0m')
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

function printBanner(
  config: ServerConfig,
  authConfig: AuthConfig | null,
  port: number,
  mounts?: MountConfig[],
  adminEnabled?: boolean,
) {
  const url = `http://localhost:${port}`
  console.log(`\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`)
  console.log(`\x1b[32m✓ vmd 服务器已启动\x1b[0m`)
  console.log(`\x1b[0m  URL: \x1b[34m${url}\x1b[0m`)
  if (config.mode === 'multi') {
    console.log(`\x1b[0m  工作区: \x1b[33m${config.workspace}\x1b[0m`)
    if (mounts && mounts.length > 0) {
      console.log(`\x1b[0m  挂载点:\x1b[0m`)
      for (const m of mounts) {
        console.log(`    \x1b[36m${m.alias}\x1b[0m → ${m.path}`)
      }
    } else {
      console.log(`\x1b[33m  ⚠ 没有挂载点，请登录管理面板添加\x1b[0m`)
    }
    if (adminEnabled) {
      console.log(`\x1b[32m  管理: 已启用（/admin）\x1b[0m`)
    } else {
      console.log(`\x1b[33m  管理: 未启用（设置 VMD_ADMIN_PASSWORD 以启用在线编辑）\x1b[0m`)
    }
  } else if (config.mode === 'dir') {
    console.log(`\x1b[0m  目录: \x1b[33m${config.basePath}\x1b[0m`)
  } else {
    console.log(`\x1b[0m  文件: \x1b[33m${config.basePath}\x1b[0m`)
  }
  if (authConfig) {
    console.log(`\x1b[32m  认证: 已启用（密码保护）\x1b[0m`)
  }
  console.log(`\x1b[33m  提示: 按 Ctrl+C 停止服务器\x1b[0m`)
  console.log(`\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`)
}
