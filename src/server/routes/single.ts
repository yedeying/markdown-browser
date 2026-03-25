import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import { readFileSync, writeFileSync, realpathSync, statSync } from 'fs'
import { join, extname, basename, dirname } from 'path'
import { createWatcher } from '../watcher.js'
import type { AuthConfig } from '../../types.js'
import { createAuthMiddleware, createAuthRoutes } from '../auth.js'

export function createSingleRouter(filePath: string, distPath: string, authConfig: AuthConfig | null = null) {
  const app = new Hono()
  const watcher = createWatcher(filePath)

  // CORS
  app.use('*', async (c, next) => {
    await next()
    c.header('Access-Control-Allow-Origin', '*')
    c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    c.header('Access-Control-Allow-Headers', 'Content-Type')
  })

  app.options('*', (c) => c.text('', 204))

  // 认证路由 + 中间件（在业务路由之前）
  if (authConfig) {
    createAuthRoutes(app, authConfig)
    app.use('*', createAuthMiddleware(authConfig))
  }

  // GET /api/content - 读取文件内容
  app.get('/api/content', (c) => {
    try {
      const content = readFileSync(filePath, 'utf-8')
      const stat = statSync(filePath)
      c.header('X-File-Name', encodeURIComponent(basename(filePath)))
      c.header('X-File-Mtime', String(stat.mtimeMs))
      return c.text(content)
    } catch {
      return c.json({ error: 'File not found' }, 404)
    }
  })

  // POST /api/save - 保存文件
  app.post('/api/save', async (c) => {
    const ext = extname(filePath).toLowerCase()
    const BINARY_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp', '.mp4', '.webm', '.ogg', '.mov', '.avi'])
    if (BINARY_EXTS.has(ext)) {
      return c.json({ error: 'Binary files cannot be saved' }, 400)
    }
    try {
      // 解析请求体（支持纯文本和 JSON）
      const contentType = c.req.header('Content-Type') || ''
      let content: string
      
      if (contentType.includes('application/json')) {
        const body = await c.req.json()
        content = typeof body.content === 'string' ? body.content : JSON.stringify(body)
      } else {
        // 纯文本请求体
        content = await c.req.text()
      }
      
      writeFileSync(filePath, content, 'utf-8')
      return c.json({ ok: true })
    } catch (e) {
      return c.json({ error: String(e) }, 500)
    }
  })

  // GET /api/asset/* - 提供文件所在目录的相对资源
  app.get('/api/asset/*', (c) => {
    const relPath = c.req.path.replace('/api/asset/', '')
    const fileDir = dirname(filePath)
    const assetPath = join(fileDir, decodeURIComponent(relPath))

    try {
      const realBase = realpathSync(fileDir)
      let realAsset: string
      try {
        realAsset = realpathSync(assetPath)
      } catch {
        return c.json({ error: 'Not found' }, 404)
      }
      if (!realAsset.startsWith(realBase)) {
        return c.json({ error: 'Forbidden' }, 403)
      }
      const content = readFileSync(assetPath)
      const ext = extname(assetPath).toLowerCase()
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
        '.pdf': 'application/pdf',
      }
      c.header('Content-Type', mimeTypes[ext] || 'application/octet-stream')
      c.header('Cache-Control', 'public, max-age=3600')
      return c.body(content)
    } catch {
      return c.json({ error: 'Failed to read asset' }, 500)
    }
  })

  // GET /api/watch - SSE 文件变更监听
  app.get('/api/watch', (c) => {
    return stream(c, async (s) => {
      const writer = (data: string) => s.write(data)
      watcher.addClient(writer)
      c.header('Content-Type', 'text/event-stream')
      c.header('Cache-Control', 'no-cache')
      c.header('Connection', 'keep-alive')
      await s.write(`data: {"type":"ping"}\n\n`)
      await new Promise<void>((resolve) => {
        s.onAbort(() => {
          watcher.removeClient(writer)
          resolve()
        })
      })
    })
  })

  // 静态文件服务（SPA fallback）
  app.get('/*', (c) => {
    const path = c.req.path === '/' ? '/index.html' : c.req.path
    const staticFile = join(distPath, path)
    try {
      const content = readFileSync(staticFile)
      const ext = extname(staticFile)
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.ico': 'image/x-icon',
      }
      c.header('Content-Type', mimeTypes[ext] || 'application/octet-stream')
      return c.body(content)
    } catch {
      try {
        const indexContent = readFileSync(join(distPath, 'index.html'))
        c.header('Content-Type', 'text/html')
        return c.body(indexContent)
      } catch {
        return c.text('Not found', 404)
      }
    }
  })

  return { app, watcher }
}
