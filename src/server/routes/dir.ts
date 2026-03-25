import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import { readdirSync, statSync, readFileSync, writeFileSync, realpathSync } from 'fs'
import { promises as fsp } from 'node:fs'
import { join, relative, basename, extname, dirname, resolve, sep } from 'path'
import type { FileNode, SearchResult, AuthConfig } from '../../types.js'
import { createDirWatcher } from '../watcher.js'
import { createAuthMiddleware, createAuthRoutes } from '../auth.js'
import { ShareStore, createShareApiRoutes, createSharePageRoutes } from '../share.js'

const IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.DS_Store'])

const MD_EXTS    = new Set(['.md', '.markdown'])
const CODE_EXTS  = new Set(['.js', '.jsx', '.ts', '.tsx', '.css', '.html', '.htm', '.py', '.json',
  '.sh', '.bash', '.zsh', '.yaml', '.yml', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp',
  '.cs', '.php', '.rb', '.swift', '.kt', '.vue', '.svelte', '.sql', '.toml', '.ini', '.conf', '.env'])
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp'])
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.ogg', '.mov', '.avi'])
const TEXT_EXTS  = new Set(['.txt', '.log', '.csv', '.tsv', '.xml'])
const BINARY_EXTS = new Set([...IMAGE_EXTS, ...VIDEO_EXTS])
const SUPPORTED_EXTS = new Set([...MD_EXTS, ...CODE_EXTS, ...IMAGE_EXTS, ...VIDEO_EXTS, ...TEXT_EXTS])

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}K`
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)}M`
  return `${(bytes / 1073741824).toFixed(1)}G`
}

function buildTree(dir: string, base: string): FileNode[] {
  let entries: string[]
  try {
    entries = readdirSync(dir).sort()
  } catch {
    return []
  }

  const folders: FileNode[] = []
  const files: FileNode[] = []

  for (const name of entries) {
    if (name.startsWith('.')) continue
    const fullPath = join(dir, name)
    let stat
    try {
      stat = statSync(fullPath)
    } catch {
      continue
    }

    if (stat.isDirectory()) {
      if (IGNORE_DIRS.has(name)) continue
      const children = buildTree(fullPath, base)
      if (children.length > 0) {
        folders.push({
          name,
          type: 'folder',
          path: relative(base, fullPath),
          children,
        })
      }
    } else if (stat.isFile() && SUPPORTED_EXTS.has(extname(name).toLowerCase())) {
      files.push({
        name,
        type: 'file',
        path: relative(base, fullPath),
        size: formatSize(stat.size),
      })
    }
  }

  return [...folders, ...files]
}

export function createDirRouter(basePath: string, distPath: string, authConfig: AuthConfig | null = null) {
  const app = new Hono()
  const watcher = createDirWatcher(basePath)
  const shareStore = new ShareStore(basePath)

  // CORS headers for all responses
  app.use('*', async (c, next) => {
    await next()
    c.header('Access-Control-Allow-Origin', '*')
    c.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    c.header('Access-Control-Allow-Headers', 'Content-Type')
  })

  app.options('*', (c) => c.text('', 204))

  // 分享页面路由必须在认证中间件之前注册（无需登录即可访问）
  createSharePageRoutes(app, basePath, distPath, shareStore)

  // 认证路由 + 中间件（在业务路由之前）
  if (authConfig) {
    createAuthRoutes(app, authConfig)
    app.use('*', createAuthMiddleware(authConfig))
  }

  // GET /api/files - 递归文件树
  app.get('/api/files', (c) => {
    const tree = buildTree(basePath, basePath)
    return c.json(tree)
  })

  // GET /api/file/:path - 读取文件内容
  app.get('/api/file/*', (c) => {
    const relPath = c.req.path.replace('/api/file/', '')
    const filePath = join(basePath, decodeURIComponent(relPath))

    try {
      const realBase = realpathSync(basePath)
      const realFile = realpathSync(filePath)
      if (!realFile.startsWith(realBase)) {
        return c.json({ error: 'Forbidden' }, 403)
      }
      const content = readFileSync(filePath, 'utf-8')
      return c.text(content)
    } catch {
      return c.json({ error: 'File not found' }, 404)
    }
  })

  // POST /api/save/:path - 保存文件
  app.post('/api/save/*', async (c) => {
    const relPath = c.req.path.replace('/api/save/', '')
    const filePath = join(basePath, decodeURIComponent(relPath))

    const ext = extname(decodeURIComponent(relPath)).toLowerCase()
    if (BINARY_EXTS.has(ext)) {
      return c.json({ error: 'Binary files cannot be saved' }, 400)
    }

    try {
      const realBase = realpathSync(basePath)
      let realFile: string
      try {
        realFile = realpathSync(filePath)
      } catch {
        // 文件不存在时，验证父目录
        realFile = join(realpathSync(join(filePath, '..')), basename(filePath))
      }
      if (!realFile.startsWith(realBase)) {
        return c.json({ error: 'Forbidden' }, 403)
      }
      
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

  // GET /api/search - 全文搜索
  app.get('/api/search', async (c) => {
    const q = c.req.query('q') || ''
    const type = c.req.query('type') || 'name'

    if (!q.trim()) return c.json([])

    const results: SearchResult[] = []

    if (type === 'name') {
      // 文件名过滤（从树结构中提取）
      function searchTree(nodes: FileNode[]) {
        for (const node of nodes) {
          if (node.type === 'file' && node.name.toLowerCase().includes(q.toLowerCase())) {
            results.push({ filePath: node.path, fileName: node.name, matches: [] })
          } else if (node.type === 'folder' && node.children) {
            searchTree(node.children)
          }
        }
      }
      searchTree(buildTree(basePath, basePath))
    } else {
      // 全文搜索：调用系统 grep
      try {
        const proc = Bun.spawn(
          ['grep', '-r', '-i', '-n',
            '--include=*.md', '--include=*.markdown',
            '--include=*.txt', '--include=*.js', '--include=*.ts',
            '--include=*.py', '--include=*.json', '--include=*.yaml',
            '--include=*.yml', '--include=*.sh', '--include=*.css',
            '--include=*.html', '--include=*.go', '--include=*.rs',
            q, basePath],
          { stdout: 'pipe', stderr: 'pipe' }
        )
        const output = await new Response(proc.stdout).text()
        await proc.exited

        // 解析 grep 输出：filepath:linenum:content
        const fileMatches: Map<string, SearchResult> = new Map()
        for (const line of output.split('\n')) {
          if (!line.trim()) continue
          const match = line.match(/^(.+?):(\d+):(.*)$/)
          if (!match) continue
          const [, filePath, lineNumStr, lineContent] = match
          const relPath = relative(basePath, filePath)
          const fileName = basename(filePath)
          if (!fileMatches.has(relPath)) {
            fileMatches.set(relPath, { filePath: relPath, fileName, matches: [] })
          }
          const entry = fileMatches.get(relPath)!
          if (entry.matches.length < 3) {
            entry.matches.push({
              lineNumber: parseInt(lineNumStr),
              lineContent: lineContent.trim().slice(0, 120),
            })
          }
        }
        results.push(...fileMatches.values())
      } catch {
        return c.json({ error: 'Search failed' }, 500)
      }
    }

    return c.json(results)
  })

  // GET /api/asset/* - 提供 markdown 所在目录的相对资源（图片、文件等）
  app.get('/api/asset/*', (c) => {
    const relPath = c.req.path.replace('/api/asset/', '')
    const filePath = join(basePath, decodeURIComponent(relPath))

    try {
      const realBase = realpathSync(basePath)
      const realFile = realpathSync(filePath)
      if (!realFile.startsWith(realBase)) {
        return c.json({ error: 'Forbidden' }, 403)
      }
      const content = readFileSync(filePath)
      const ext = extname(filePath).toLowerCase()
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
        '.pdf': 'application/pdf',
        '.zip': 'application/zip',
      }
      c.header('Content-Type', mimeTypes[ext] || 'application/octet-stream')
      c.header('Cache-Control', 'public, max-age=3600')
      return c.body(content)
    } catch {
      return c.json({ error: 'File not found' }, 404)
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
      // 初始连接确认
      await s.write(`data: {"type":"ping"}\n\n`)
      // 等待连接关闭
      await new Promise<void>((resolve) => {
        s.onAbort(() => {
          watcher.removeClient(writer)
          resolve()
        })
      })
    })
  })

  // 静态文件服务
  // 文件管理 API
  // ===========================================================

  /** 路径安全检查：确保 target 解析后不超出 base 目录 */
  function assertSafe(target: string, base: string): string {
    const realBase = resolve(base)
    const abs = resolve(base, target)
    if (abs !== realBase && !abs.startsWith(realBase + sep)) {
      throw new Error('Path out of bounds')
    }
    return abs
  }

  /** 对重名目标追加 _1 / _2 后缀，返回不冲突的路径 */
  async function uniqueDest(destAbs: string): Promise<string> {
    let candidate = destAbs
    let i = 1
    while (true) {
      try {
        await fsp.access(candidate)
        // 文件已存在：分离 ext，加后缀
        const ext = extname(destAbs)
        const base2 = destAbs.slice(0, destAbs.length - ext.length)
        candidate = `${base2}_${i}${ext}`
        i++
      } catch {
        return candidate
      }
    }
  }

  // DELETE /api/fs/delete — 删除文件/文件夹（支持批量）
  app.delete('/api/fs/delete', async (c) => {
    try {
      const { paths } = await c.req.json() as { paths: string[] }
      if (!Array.isArray(paths) || paths.length === 0) {
        return c.json({ ok: false, error: 'paths required' }, 400)
      }
      let deleted = 0
      for (const p of paths) {
        const abs = assertSafe(p, basePath)
        await fsp.rm(abs, { recursive: true, force: true })
        deleted++
      }
      return c.json({ ok: true, deleted })
    } catch (e: unknown) {
      return c.json({ ok: false, error: String(e) }, 400)
    }
  })

  // POST /api/fs/rename — 重命名
  app.post('/api/fs/rename', async (c) => {
    try {
      const { path: p, newName } = await c.req.json() as { path: string; newName: string }
      if (!p || !newName) return c.json({ ok: false, error: 'path and newName required' }, 400)
      // 安全：newName 不允许路径分隔符或 ..
      if (/[/\\]|\.\.\./.test(newName)) {
        return c.json({ ok: false, error: 'Invalid name' }, 400)
      }
      const abs = assertSafe(p, basePath)
      const newAbs = join(dirname(abs), newName)
      // 确保 newAbs 也在 basePath 内
      assertSafe(relative(basePath, newAbs), basePath)
      await fsp.rename(abs, newAbs)
      return c.json({ ok: true, newPath: relative(basePath, newAbs) })
    } catch (e: unknown) {
      return c.json({ ok: false, error: String(e) }, 400)
    }
  })

  // POST /api/fs/move — 移动文件/文件夹到目标目录
  app.post('/api/fs/move', async (c) => {
    try {
      const { paths, dest } = await c.req.json() as { paths: string[]; dest: string }
      if (!Array.isArray(paths) || !dest) {
        return c.json({ ok: false, error: 'paths and dest required' }, 400)
      }
      const destAbs = assertSafe(dest, basePath)
      // 确保目标目录存在
      await fsp.mkdir(destAbs, { recursive: true })
      let moved = 0
      for (const p of paths) {
        const abs = assertSafe(p, basePath)
        const targetAbs = join(destAbs, basename(abs))
        try {
          await fsp.rename(abs, targetAbs)
        } catch (e: unknown) {
          // 跨设备（EXDEV）时 fallback 到 copy + delete
          const err = e as NodeJS.ErrnoException
          if (err.code === 'EXDEV') {
            await fsp.cp(abs, targetAbs, { recursive: true })
            await fsp.rm(abs, { recursive: true, force: true })
          } else {
            throw e
          }
        }
        moved++
      }
      return c.json({ ok: true, moved })
    } catch (e: unknown) {
      return c.json({ ok: false, error: String(e) }, 400)
    }
  })

  // POST /api/fs/copy — 复制文件/文件夹到目标目录
  app.post('/api/fs/copy', async (c) => {
    try {
      const { paths, dest } = await c.req.json() as { paths: string[]; dest: string }
      if (!Array.isArray(paths) || !dest) {
        return c.json({ ok: false, error: 'paths and dest required' }, 400)
      }
      const destAbs = assertSafe(dest, basePath)
      await fsp.mkdir(destAbs, { recursive: true })
      let copied = 0
      for (const p of paths) {
        const abs = assertSafe(p, basePath)
        const raw = join(destAbs, basename(abs))
        const targetAbs = await uniqueDest(raw)
        await fsp.cp(abs, targetAbs, { recursive: true })
        copied++
      }
      return c.json({ ok: true, copied })
    } catch (e: unknown) {
      return c.json({ ok: false, error: String(e) }, 400)
    }
  })

  // POST /api/fs/mkdir — 创建文件夹
  app.post('/api/fs/mkdir', async (c) => {
    try {
      const { path: p } = await c.req.json() as { path: string }
      if (!p) return c.json({ ok: false, error: 'path required' }, 400)
      const abs = assertSafe(p, basePath)
      await fsp.mkdir(abs, { recursive: true })
      return c.json({ ok: true })
    } catch (e: unknown) {
      return c.json({ ok: false, error: String(e) }, 400)
    }
  })

  // POST /api/fs/touch — 创建空文件（不覆盖已存在文件）
  app.post('/api/fs/touch', async (c) => {
    try {
      const { path: p } = await c.req.json() as { path: string }
      if (!p) return c.json({ ok: false, error: 'path required' }, 400)
      const abs = assertSafe(p, basePath)
      // 确保父目录存在
      await fsp.mkdir(dirname(abs), { recursive: true })
      // flag:'ax' = exclusive create，文件已存在时报错
      await fsp.writeFile(abs, '', { flag: 'ax' })
      return c.json({ ok: true })
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException
      if (err.code === 'EEXIST') {
        return c.json({ ok: false, error: '文件已存在' }, 400)
      }
      return c.json({ ok: false, error: String(e) }, 400)
    }
  })

  // 分享路由（管理 API + 页面路由，在静态文件服务之前注册）
  createShareApiRoutes(app, shareStore, authConfig)
  createSharePageRoutes(app, basePath, distPath, shareStore)

  // 静态文件服务
  // ===========================================================
  app.get('/*', (c) => {
    const path = c.req.path === '/' ? '/index.html' : c.req.path
    const filePath = join(distPath, path)
    try {
      const content = readFileSync(filePath)
      const ext = extname(filePath)
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
      // SPA fallback
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
