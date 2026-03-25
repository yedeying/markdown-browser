import { Hono } from 'hono'
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'fs'
import { promises as fsp } from 'node:fs'
import { join, relative, extname, basename, dirname, resolve, sep } from 'path'
import type { ShareToken, AuthConfig } from '../types.js'
import { createAuthMiddleware } from './auth.js'

const SHARES_FILE = '.vmd-shares.json'

// ============================================================
// ShareStore
// ============================================================

export class ShareStore {
  private filePath: string
  private data: Record<string, Omit<ShareToken, 'token'>> = {}

  constructor(basePath: string) {
    this.filePath = join(basePath, SHARES_FILE)
    this.load()
  }

  private load() {
    try {
      if (existsSync(this.filePath)) {
        this.data = JSON.parse(readFileSync(this.filePath, 'utf-8'))
      }
    } catch {
      this.data = {}
    }
  }

  private save() {
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8')
  }

  createShare(path: string, type: 'file' | 'folder', expiresAt: number | null): string {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    this.data[token] = { path, type, expiresAt, createdAt: Date.now() }
    this.save()
    return token
  }

  resolveShare(token: string): ShareToken | null {
    const entry = this.data[token]
    if (!entry) return null
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      // 过期自动清理
      delete this.data[token]
      this.save()
      return null
    }
    return { token, ...entry }
  }

  deleteShare(token: string): boolean {
    if (!this.data[token]) return false
    delete this.data[token]
    this.save()
    return true
  }

  listShares(): ShareToken[] {
    const now = Date.now()
    const result: ShareToken[] = []
    const expired: string[] = []
    for (const [token, entry] of Object.entries(this.data)) {
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        expired.push(token)
      } else {
        result.push({ token, ...entry })
      }
    }
    if (expired.length > 0) {
      for (const t of expired) delete this.data[t]
      this.save()
    }
    return result.sort((a, b) => b.createdAt - a.createdAt)
  }
}

// ============================================================
// 工具函数
// ============================================================

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp'])
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.ogg', '.mov', '.avi'])
const SUPPORTED_EXTS = new Set([
  '.md', '.markdown', '.txt', '.log', '.csv', '.tsv', '.xml',
  '.js', '.jsx', '.ts', '.tsx', '.css', '.html', '.htm', '.py', '.json',
  '.sh', '.bash', '.zsh', '.yaml', '.yml', '.go', '.rs', '.java',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.rb', '.swift', '.kt',
  '.vue', '.svelte', '.sql', '.toml', '.ini', '.conf', '.env',
  ...IMAGE_EXTS, ...VIDEO_EXTS,
])

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.pdf': 'application/pdf',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}K`
  return `${(bytes / 1048576).toFixed(1)}M`
}

function buildTree(dir: string, base: string) {
  const IGNORE = new Set(['.git', 'node_modules', 'dist', '.DS_Store'])
  let entries: string[]
  try { entries = readdirSync(dir).sort() } catch { return [] }
  const folders: ReturnType<typeof buildTree> = []
  const files: ReturnType<typeof buildTree> = []
  for (const name of entries) {
    if (name.startsWith('.')) continue
    const full = join(dir, name)
    let stat
    try { stat = statSync(full) } catch { continue }
    if (stat.isDirectory()) {
      if (IGNORE.has(name)) continue
      const children = buildTree(full, base)
      if (children.length > 0) folders.push({ name, type: 'folder', path: relative(base, full), children })
    } else if (stat.isFile() && SUPPORTED_EXTS.has(extname(name).toLowerCase())) {
      files.push({ name, type: 'file', path: relative(base, full), size: formatSize(stat.size) })
    }
  }
  return [...folders, ...files]
}

function assertInBase(target: string, base: string): string {
  const realBase = resolve(base)
  const abs = resolve(base, target)
  if (abs !== realBase && !abs.startsWith(realBase + sep)) throw new Error('Forbidden')
  return abs
}

// ============================================================
// 管理 API（需认证）
// POST /api/share          创建分享
// DELETE /api/share/:token 删除分享
// GET /api/share/list      列出分享
// ============================================================

export function createShareApiRoutes(
  app: Hono,
  store: ShareStore,
  authConfig: AuthConfig | null,
) {
  // 无密码模式：管理接口直接放行；有密码：复用认证中间件
  if (authConfig) {
    app.use('/api/share/*', createAuthMiddleware(authConfig))
    app.use('/api/share', createAuthMiddleware(authConfig))
  }

  // POST /api/share — 创建分享
  app.post('/api/share', async (c) => {
    try {
      const { path, type, ttl } = await c.req.json() as {
        path: string
        type: 'file' | 'folder'
        ttl: number | null  // 秒，null=永久
      }
      if (!path || !type) return c.json({ ok: false, error: 'path and type required' }, 400)
      const expiresAt = ttl ? Date.now() + ttl * 1000 : null
      const token = store.createShare(path, type, expiresAt)
      const origin = c.req.header('origin') || `${c.req.header('x-forwarded-proto') || 'http'}://${c.req.header('host')}`
      return c.json({ ok: true, token, url: `${origin}/share/${token}` })
    } catch (e) {
      return c.json({ ok: false, error: String(e) }, 500)
    }
  })

  // DELETE /api/share/:token — 删除分享
  app.delete('/api/share/:token', (c) => {
    const token = c.req.param('token')
    const ok = store.deleteShare(token)
    return c.json({ ok })
  })

  // GET /api/share/list — 列出所有分享
  app.get('/api/share/list', (c) => {
    return c.json(store.listShares())
  })
}

// ============================================================
// 分享页面路由（无需认证）
// GET /share/:token             分享页面（注入 token 的 index.html）
// GET /share/:token/api/files   文件夹树（仅分享文件夹内）
// GET /share/:token/api/file/*  文件内容（只读）
// GET /share/:token/api/asset/* 资源文件
// GET /share/:token/api/download/* 下载
// POST /share/:token/api/touch  新建文件（仅文件夹分享）
// ============================================================

export function createSharePageRoutes(
  app: Hono,
  basePath: string,
  distPath: string,
  store: ShareStore,
) {
  /** 解析 token，已过期返回 null */
  function getShare(token: string) {
    return store.resolveShare(token)
  }

  function expiredResponse(c: ReturnType<Hono['fetch']> extends Promise<Response> ? never : Parameters<Hono['fetch']>[0], hono: Hono) {
    return null
  }

  // GET /share/:token  → 返回注入了 token 的 index.html
  app.get('/share/:token', (c) => {
    const token = c.req.param('token')
    const share = getShare(token)
    if (!share) {
      return c.html(renderExpiredPage(), 410)
    }
    try {
      let html = readFileSync(join(distPath, 'index.html'), 'utf-8')
      // 注入分享上下文到 <head>
      const inject = `<script>window.__VMD_SHARE_TOKEN__="${token}";window.__VMD_SHARE_TYPE__="${share.type}";window.__VMD_SHARE_PATH__="${share.path.replace(/"/g, '\\"')}";</script>`
      html = html.replace('</head>', inject + '</head>')
      return c.html(html)
    } catch {
      return c.text('Not found', 404)
    }
  })

  // SPA 子路由（前端路由）也要返回同样的页面
  app.get('/share/:token/*', async (c, next) => {
    const path = c.req.path
    // API 路径：继续走后续路由
    if (path.includes('/api/')) return next()
    // 静态资源：尝试返回文件
    const suffix = path.replace(/^\/share\/[^/]+/, '')
    if (suffix && suffix !== '/') {
      try {
        const filePath = join(distPath, suffix)
        const content = readFileSync(filePath)
        c.header('Content-Type', MIME[extname(filePath)] || 'application/octet-stream')
        return c.body(content)
      } catch { /* fallthrough */ }
    }
    // SPA fallback：同样注入 token
    const token = c.req.param('token')
    const share = getShare(token)
    if (!share) return c.html(renderExpiredPage(), 410)
    try {
      let html = readFileSync(join(distPath, 'index.html'), 'utf-8')
      const inject = `<script>window.__VMD_SHARE_TOKEN__="${token}";window.__VMD_SHARE_TYPE__="${share.type}";window.__VMD_SHARE_PATH__="${share.path.replace(/"/g, '\\"')}";</script>`
      html = html.replace('</head>', inject + '</head>')
      return c.html(html)
    } catch {
      return c.text('Not found', 404)
    }
  })

  // GET /share/:token/api/search — 搜索（仅文件夹分享）
  app.get('/share/:token/api/search', async (c) => {
    const share = getShare(c.req.param('token'))
    if (!share) return c.json({ error: 'Share expired or not found' }, 410)
    if (share.type !== 'folder') return c.json({ error: 'Not a folder share' }, 400)

    const q = c.req.query('q') || ''
    const type = c.req.query('type') || 'name'
    if (!q.trim()) return c.json([])

    const shareDirAbs = join(basePath, share.path)

    if (type === 'name') {
      // 文件名搜索
      const results: { filePath: string; fileName: string; matches: never[] }[] = []
      function searchTree(nodes: ReturnType<typeof buildTree>) {
        for (const node of nodes) {
          if (node.type === 'file' && node.name.toLowerCase().includes(q.toLowerCase())) {
            results.push({ filePath: node.path, fileName: node.name, matches: [] })
          } else if (node.type === 'folder' && node.children) {
            searchTree(node.children as ReturnType<typeof buildTree>)
          }
        }
      }
      searchTree(buildTree(shareDirAbs, shareDirAbs))
      return c.json(results)
    }

    // 全文搜索 grep
    try {
      const proc = Bun.spawn(
        ['grep', '-r', '-i', '-n',
          '--include=*.md', '--include=*.markdown', '--include=*.txt',
          '--include=*.js', '--include=*.ts', '--include=*.py',
          '--include=*.json', '--include=*.yaml', '--include=*.yml',
          '--include=*.sh', '--include=*.css', '--include=*.html',
          q, shareDirAbs],
        { stdout: 'pipe', stderr: 'pipe' }
      )
      const output = await new Response(proc.stdout).text()
      await proc.exited
      const fileMatches = new Map<string, { filePath: string; fileName: string; matches: { lineNumber: number; lineContent: string }[] }>()
      for (const line of output.split('\n')) {
        if (!line.trim()) continue
        const match = line.match(/^(.+?):(\d+):(.*)$/)
        if (!match) continue
        const [, filePath, lineNumStr, lineContent] = match
        const relPath = relative(shareDirAbs, filePath)
        if (!fileMatches.has(relPath)) {
          fileMatches.set(relPath, { filePath: relPath, fileName: basename(filePath), matches: [] })
        }
        const entry = fileMatches.get(relPath)!
        if (entry.matches.length < 3) {
          entry.matches.push({ lineNumber: parseInt(lineNumStr), lineContent: lineContent.trim().slice(0, 120) })
        }
      }
      return c.json([...fileMatches.values()])
    } catch {
      return c.json({ error: 'Search failed' }, 500)
    }
  })

  // GET /share/:token/api/files — 文件夹树
  app.get('/share/:token/api/files', (c) => {
    const share = getShare(c.req.param('token'))
    if (!share) return c.json({ error: 'Share expired or not found' }, 410)
    if (share.type !== 'folder') return c.json({ error: 'Not a folder share' }, 400)
    const shareDirAbs = join(basePath, share.path)
    const tree = buildTree(shareDirAbs, shareDirAbs)
    return c.json(tree)
  })

  // GET /share/:token/api/file/* — 读取文件内容（只读）
  app.get('/share/:token/api/file/*', (c) => {
    const share = getShare(c.req.param('token'))
    if (!share) return c.json({ error: 'Share expired or not found' }, 410)

    const relPath = c.req.path.replace(/^\/share\/[^/]+\/api\/file\//, '')
    try {
      const shareBase = share.type === 'folder'
        ? join(basePath, share.path)
        : basePath
      const targetAbs = assertInBase(decodeURIComponent(relPath), shareBase)
      // 单文件分享：只允许访问该文件本身
      if (share.type === 'file') {
        const shareAbs = join(basePath, share.path)
        if (targetAbs !== resolve(shareAbs)) return c.json({ error: 'Forbidden' }, 403)
      }
      const content = readFileSync(targetAbs, 'utf-8')
      c.header('X-File-Name', encodeURIComponent(basename(targetAbs)))
      return c.text(content)
    } catch {
      return c.json({ error: 'File not found' }, 404)
    }
  })

  // GET /share/:token/api/asset/* — 资源文件
  app.get('/share/:token/api/asset/*', (c) => {
    const share = getShare(c.req.param('token'))
    if (!share) return c.json({ error: 'Share expired or not found' }, 410)

    const relPath = c.req.path.replace(/^\/share\/[^/]+\/api\/asset\//, '')
    try {
      const shareBase = share.type === 'folder'
        ? join(basePath, share.path)
        : join(basePath, dirname(share.path))
      const targetAbs = assertInBase(decodeURIComponent(relPath), shareBase)
      const content = readFileSync(targetAbs)
      c.header('Content-Type', MIME[extname(targetAbs).toLowerCase()] || 'application/octet-stream')
      c.header('Cache-Control', 'public, max-age=3600')
      return c.body(content)
    } catch {
      return c.json({ error: 'File not found' }, 404)
    }
  })

  // GET /share/:token/api/download/* — 下载文件（Content-Disposition: attachment）
  app.get('/share/:token/api/download/*', (c) => {
    const share = getShare(c.req.param('token'))
    if (!share) return c.json({ error: 'Share expired or not found' }, 410)

    const relPath = c.req.path.replace(/^\/share\/[^/]+\/api\/download\//, '')
    try {
      const shareBase = share.type === 'folder'
        ? join(basePath, share.path)
        : basePath
      const targetAbs = assertInBase(decodeURIComponent(relPath), shareBase)
      if (share.type === 'file') {
        const shareAbs = join(basePath, share.path)
        if (targetAbs !== resolve(shareAbs)) return c.json({ error: 'Forbidden' }, 403)
      }
      const content = readFileSync(targetAbs)
      const name = basename(targetAbs)
      c.header('Content-Type', MIME[extname(targetAbs).toLowerCase()] || 'application/octet-stream')
      c.header('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`)
      return c.body(content)
    } catch {
      return c.json({ error: 'File not found' }, 404)
    }
  })

  // POST /share/:token/api/touch — 在分享文件夹内新建文件（只允许文件夹分享）
  app.post('/share/:token/api/touch', async (c) => {
    const share = getShare(c.req.param('token'))
    if (!share) return c.json({ error: 'Share expired or not found' }, 410)
    if (share.type !== 'folder') return c.json({ error: 'Not a folder share' }, 403)

    try {
      const { path: p } = await c.req.json() as { path: string }
      if (!p) return c.json({ ok: false, error: 'path required' }, 400)
      const shareBase = join(basePath, share.path)
      const abs = assertInBase(p, shareBase)
      await fsp.mkdir(dirname(abs), { recursive: true })
      await fsp.writeFile(abs, '', { flag: 'ax' })
      return c.json({ ok: true })
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException
      if (err.code === 'EEXIST') return c.json({ ok: false, error: '文件已存在' }, 400)
      return c.json({ ok: false, error: String(e) }, 500)
    }
  })

  // POST /share/:token/api/save/* — 保存新建文件（仅允许文件夹分享）
  app.post('/share/:token/api/save/*', async (c) => {
    const share = getShare(c.req.param('token'))
    if (!share) return c.json({ error: 'Share expired or not found' }, 410)
    if (share.type !== 'folder') return c.json({ error: 'Not a folder share' }, 403)

    const relPath = c.req.path.replace(/^\/share\/[^/]+\/api\/save\//, '')
    try {
      const shareBase = join(basePath, share.path)
      const targetAbs = assertInBase(decodeURIComponent(relPath), shareBase)
      const contentType = c.req.header('Content-Type') || ''
      const content = contentType.includes('application/json')
        ? (await c.req.json() as { content?: string }).content ?? ''
        : await c.req.text()
      writeFileSync(targetAbs, content, 'utf-8')
      return c.json({ ok: true })
    } catch (e) {
      return c.json({ ok: false, error: String(e) }, 500)
    }
  })
}

// ============================================================
// 过期页面 HTML
// ============================================================

function renderExpiredPage(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>链接已过期 - vmd</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0d1117; color: #c9d1d9;
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
    }
    .box { text-align: center; padding: 40px; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 20px; margin-bottom: 8px; }
    p { color: #8b949e; font-size: 14px; }
  </style>
</head>
<body>
  <div class="box">
    <div class="icon">⏰</div>
    <h1>此分享链接已过期或不存在</h1>
    <p>请联系文件所有者重新生成分享链接</p>
  </div>
</body>
</html>`
}
