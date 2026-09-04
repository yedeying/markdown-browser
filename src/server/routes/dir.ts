import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import { readdirSync, statSync, readFileSync, writeFileSync, realpathSync, existsSync } from 'fs'
import { promises as fsp } from 'node:fs'
import { join, relative, basename, extname, dirname, resolve, sep } from 'path'
import type { FileNode, SearchResult, AuthConfig } from '../../types.js'
import { createDirWatcher } from '../watcher.js'
import { createAuthMiddleware, createAuthRoutes } from '../auth.js'
import { ShareStore, createShareApiRoutes, createSharePageRoutes } from '../share.js'
import { treeCache } from '../tree-cache.js'
import { hasReservedSegment, isReservedFilename } from '../reserved-files.js'
import { decodeTextBuffer } from '../decodeText.js'
import { nowMs, perfLog, perfLogTimed } from '../perfLog.js'
import {
  CHUNK_SIZE,
  MAX_FILE_SIZE,
  completeUploadSession,
  deleteUploadSession,
  initUploadSession,
  isUploadStagingPath,
  writeSingleUpload,
  writeUploadChunk,
} from '../upload-sessions.js'

const IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.DS_Store', '.vmd-upload'])

// 服务端托管文件（.vmd-config.json 等）决定启动根目录和分享令牌，
// 一旦能经通用文件接口改写，客户端就能改写服务端行为。
const RESERVED_ERROR = '服务端托管文件不可通过文件接口访问'

/** 任意一个路径命中服务端托管文件 */
function anyReserved(...paths: Array<string | undefined | null>): boolean {
  return paths.some(p => typeof p === 'string' && hasReservedSegment(p))
}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp'])
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.ogg', '.mov', '.avi'])
const BINARY_EXTS = new Set([...IMAGE_EXTS, ...VIDEO_EXTS])

// 搜索约束
const GREP_TIMEOUT_MS = 8_000
const GREP_MAX_BYTES = 2 * 1024 * 1024  // 2MB
const GREP_MAX_FILES = 200

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}K`
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)}M`
  return `${(bytes / 1073741824).toFixed(1)}G`
}

/** 请求是否显式要求包含点文件：仅 ?showHidden=1，其它一切取值都按“不显示”处理 */
export function wantsHidden(showHiddenParam: string | undefined): boolean {
  return showHiddenParam === '1'
}

/** 相对路径中是否存在点开头的分段（.private/plain-name.md 也算隐藏） */
export function hasHiddenSegment(relPath: string): boolean {
  return relPath.replace(/\\/g, '/').split('/').some(seg => seg !== '' && seg.startsWith('.'))
}

/**
 * 读取单层目录（不递归）
 * 返回的 FileNode.path 是相对于 base 的路径
 */
function listDir(dir: string, base: string, showHidden: boolean): FileNode[] {
  const t0 = nowMs()
  let entries: string[]
  try {
    entries = readdirSync(dir).sort()
  } catch {
    return []
  }

  const folders: FileNode[] = []
  const files: FileNode[] = []
  let skippedHidden = 0
  let skippedIgnore = 0
  let skippedStat = 0

  for (const name of entries) {
    // 服务端托管文件不属于用户内容，showHidden 也不该把它露出来
    if (isReservedFilename(name)) continue
    // 默认不返回点文件/点文件夹：客户端必须显式带 ?showHidden=1 才能看到，
    // 否则 ~/.docker/config.json 之类的敏感文件会对所有客户端可见（且可经 /api/file 读取）。
    if (!showHidden && name.startsWith('.')) {
      skippedHidden++
      continue
    }
    const fullPath = join(dir, name)
    let stat
    try {
      stat = statSync(fullPath)
    } catch {
      skippedStat++
      continue
    }

    if (stat.isDirectory()) {
      if (IGNORE_DIRS.has(name)) {
        skippedIgnore++
        continue
      }
      folders.push({
        name,
        type: 'folder',
        path: relative(base, fullPath),
      })
    } else if (stat.isFile()) {
      // 白名单内外都列入树：未知扩展名文件仍需可见，才能按 4.2 的纯文本回落打开。
      files.push({
        name,
        type: 'file',
        path: relative(base, fullPath),
        size: formatSize(stat.size),
      })
    }
  }

  const result = [...folders, ...files]
  perfLogTimed('listDir', nowMs() - t0, {
    dir: relative(base, dir) || '(root)',
    entries: entries.length,
    out: result.length,
    folders: folders.length,
    files: files.length,
    skippedHidden,
    skippedIgnore,
    skippedStat,
  })
  return result
}

/**
 * 懒加载单层列表（带缓存）
 */
function listDirCached(scope: string, dir: string, base: string, relPath: string, showHidden: boolean): FileNode[] {
  const cached = treeCache.get(scope, relPath)
  if (cached) {
    perfLog('listDir:cache-hit', { relPath: relPath || '(root)', nodes: cached.length })
    return cached
  }
  const nodes = listDir(dir, base, showHidden)
  treeCache.set(scope, relPath, nodes)
  return nodes
}

/**
 * 递归构建树（到指定深度）
 * depth = 0 相当于只返回当前目录一层（子节点不含 children）
 * depth = Infinity 表示全量
 */
function buildTree(scope: string, dir: string, base: string, relPath = '', depth = Infinity, showHidden = false): FileNode[] {
  const t0 = nowMs()
  const nodes = listDirCached(scope, dir, base, relPath, showHidden)
  if (depth <= 0) {
    perfLogTimed('buildTree', nowMs() - t0, { relPath: relPath || '(root)', depth, nodes: nodes.length, leaf: true })
    return nodes
  }

  let childListCalls = 0
  const result: FileNode[] = []
  for (const node of nodes) {
    if (node.type === 'folder') {
      const childRel = node.path
      const childAbs = join(base, childRel)
      // 磁盘上是否还有子项（文件或子目录）。递归结果可能把空叶子剪掉，
      // 但不能因此把「只含空子目录」的父目录也丢掉。
      childListCalls++
      const children = buildTree(scope, childAbs, base, childRel, depth - 1, showHidden)
      // 空文件夹也要出现在列表里，否则 mkdir 后「创建成功但看不见」
      result.push({ ...node, children })
    } else {
      result.push(node)
    }
  }
  perfLogTimed('buildTree', nowMs() - t0, {
    relPath: relPath || '(root)',
    depth,
    nodes: nodes.length,
    foldersListed: childListCalls,
    out: result.length,
  })
  return result
}

export function createDirRouter(basePath: string, distPath: string, authConfig: AuthConfig | null = null) {
  const app = new Hono()
  const watcher = createDirWatcher(basePath)
  const shareStore = new ShareStore(basePath)
  const cacheScope = `dir:${basePath}`
  // 含点文件的列表单独缓存，避免 showHidden=1 的响应污染默认（不含点文件）的缓存
  const hiddenCacheScope = `${cacheScope}#hidden`
  const scopeFor = (showHidden: boolean) => (showHidden ? hiddenCacheScope : cacheScope)

  // watcher 事件触发时失效缓存
  watcher.onEvent((e) => {
    if (e.type === 'tree-change') {
      if (e.affectedPath !== undefined) {
        treeCache.invalidatePath(cacheScope, e.affectedPath)
        treeCache.invalidatePath(hiddenCacheScope, e.affectedPath)
      } else {
        treeCache.invalidateScope(cacheScope)
        treeCache.invalidateScope(hiddenCacheScope)
      }
    }
  })

  const normalizeRel = (p: string) => p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  const parentRel = (p: string) => {
    const n = normalizeRel(p)
    const i = n.lastIndexOf('/')
    return i === -1 ? '' : n.slice(0, i)
  }

  /**
   * 写盘成功后立刻失效缓存并推 SSE。
   * paths：被增删改的节点（会失效自身+祖先，并通知该节点的所有祖先目录）
   * dirs：子项集合变化的目录（直接通知该目录）
   * 不依赖 OS watcher，避免删改后列表仍命中旧缓存。
   *
   * 必须通知全部祖先：上传 `docs/a/b.txt` 时会 mkdir 中间目录，
   * 若只通知 `docs/a`，正在浏览 `docs` 的客户端不会刷新到新文件夹 `a`。
   */
  function afterTreeMutation(opts: { paths?: string[]; dirs?: string[] }) {
    const notifyDirs = new Set<string>()
    const addAncestors = (dir: string) => {
      let cur = dir
      while (true) {
        notifyDirs.add(cur)
        if (!cur) break
        const i = cur.lastIndexOf('/')
        cur = i === -1 ? '' : cur.slice(0, i)
      }
    }
    for (const raw of opts.paths ?? []) {
      if (typeof raw !== 'string') continue
      const n = normalizeRel(raw)
      treeCache.invalidatePath(cacheScope, n)
      treeCache.invalidatePath(hiddenCacheScope, n)
      addAncestors(parentRel(n))
    }
    for (const raw of opts.dirs ?? []) {
      if (typeof raw !== 'string') continue
      const n = normalizeRel(raw)
      treeCache.invalidatePath(cacheScope, n)
      treeCache.invalidatePath(hiddenCacheScope, n)
      addAncestors(n)
    }
    for (const d of notifyDirs) {
      watcher.notifyTreeChange(d)
    }
  }

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

  // GET /api/files - 文件树
  // 兼容两种模式：
  //   1. 无参数 / depth 省略  → 兼容老客户端，返回最大深度 3 层
  //   2. ?path=<rel>&depth=1 → 懒加载单层
  // 点文件仅在 ?showHidden=1 时列出（默认既不列出也不向下递归）
  app.get('/api/files', (c) => {
    const t0 = nowMs()
    const relPath = (c.req.query('path') || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
    const depthParam = c.req.query('depth')
    const hasLazyParams = c.req.query('path') !== undefined || depthParam !== undefined
    const showHidden = wantsHidden(c.req.query('showHidden'))

    // 未开启显示隐藏文件时，连点目录本身也不可列举
    if (!showHidden && hasHiddenSegment(relPath)) {
      return c.json({ error: 'Not found' }, 404)
    }

    // 路径越界检查
    const targetDir = relPath ? join(basePath, relPath) : basePath
    try {
      const realBase = realpathSync(basePath)
      const realTarget = realpathSync(targetDir)
      if (!realTarget.startsWith(realBase)) {
        return c.json({ error: 'Forbidden' }, 403)
      }
    } catch {
      return c.json({ error: 'Not found' }, 404)
    }

    if (hasLazyParams) {
      const depth = depthParam ? Math.max(0, Math.min(10, parseInt(depthParam) || 0)) : 1
      const tree = buildTree(scopeFor(showHidden), targetDir, basePath, relPath, depth, showHidden)
      perfLogTimed('GET /api/files', nowMs() - t0, {
        path: relPath || '(root)',
        depth,
        lazy: true,
        nodes: tree.length,
        base: basePath,
      })
      return c.json(tree)
    }

    // 旧行为兼容：默认返回根目录（深度 3，避免超大树一次性返回）
    const tree = buildTree(scopeFor(showHidden), basePath, basePath, '', 3, showHidden)
    perfLogTimed('GET /api/files', nowMs() - t0, {
      path: '(root)',
      depth: 3,
      lazy: false,
      nodes: tree.length,
      base: basePath,
    })
    return c.json(tree)
  })

  // GET /api/stat?path= — 判断路径是文件还是目录（深链用，避免把目录当文件读）
  app.get('/api/stat', (c) => {
    const relPath = (c.req.query('path') || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
    const showHidden = wantsHidden(c.req.query('showHidden'))

    if (!relPath) {
      return c.json({ type: 'folder', path: '', name: basename(basePath) })
    }
    if (hasReservedSegment(relPath)) {
      return c.json({ error: 'Not found' }, 404)
    }
    if (!showHidden && hasHiddenSegment(relPath)) {
      return c.json({ error: 'Not found' }, 404)
    }

    const target = join(basePath, relPath)
    try {
      const realBase = realpathSync(basePath)
      const realTarget = realpathSync(target)
      if (!realTarget.startsWith(realBase)) {
        return c.json({ error: 'Forbidden' }, 403)
      }
      const st = statSync(target)
      if (st.isDirectory()) {
        return c.json({ type: 'folder', path: relPath, name: basename(relPath) })
      }
      if (st.isFile()) {
        return c.json({
          type: 'file',
          path: relPath,
          name: basename(relPath),
          size: formatSize(st.size),
        })
      }
      return c.json({ error: 'Not found' }, 404)
    } catch {
      return c.json({ error: 'Not found' }, 404)
    }
  })

  // GET /api/file/:path - 读取文件内容
  app.get('/api/file/*', (c) => {
    const t0 = nowMs()
    const relPath = c.req.path.replace('/api/file/', '')
    const decoded = decodeURIComponent(relPath)
    const filePath = join(basePath, decoded)

    // 挂载点路径和分享令牌本身就是敏感信息：当作不存在
    if (hasReservedSegment(decoded)) {
      return c.json({ error: 'File not found' }, 404)
    }

    // 纵深防御：列表/搜索默认不返回点路径，直接猜路径也读不到
    if (!wantsHidden(c.req.query('showHidden')) && hasHiddenSegment(decoded)) {
      return c.json({ error: 'File not found' }, 404)
    }

    try {
      const realBase = realpathSync(basePath)
      const realFile = realpathSync(filePath)
      if (!realFile.startsWith(realBase)) {
        return c.json({ error: 'Forbidden' }, 403)
      }
      const st = statSync(filePath)
      if (st.isDirectory()) {
        perfLogTimed('GET /api/file', nowMs() - t0, {
          path: decoded,
          kind: 'directory',
          error: 'is-directory',
        })
        return c.json({ error: 'File not found', reason: 'is-directory' }, 404)
      }
      const buf = readFileSync(filePath)
      perfLogTimed('GET /api/file', nowMs() - t0, {
        path: decoded,
        kind: 'file',
        bytes: buf.length,
      })
      return c.text(decodeTextBuffer(buf))
    } catch (e) {
      perfLogTimed('GET /api/file', nowMs() - t0, {
        path: decoded,
        error: String(e),
      })
      return c.json({ error: 'File not found' }, 404)
    }
  })

  // POST /api/save/:path - 保存文件
  app.post('/api/save/*', async (c) => {
    const relPath = c.req.path.replace('/api/save/', '')
    const filePath = join(basePath, decodeURIComponent(relPath))

    if (hasReservedSegment(decodeURIComponent(relPath))) {
      return c.json({ error: RESERVED_ERROR }, 403)
    }

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

  // GET /api/search - 搜索（name / content）
  app.get('/api/search', async (c) => {
    const q = c.req.query('q') || ''
    const type = c.req.query('type') || 'name'
    const showHidden = wantsHidden(c.req.query('showHidden'))

    if (!q.trim()) return c.json([])

    const results: SearchResult[] = []

    if (type === 'name') {
      // 文件名搜索：全量遍历（经缓存；大目录首次有代价，后续查询快）
      const full = buildTree(scopeFor(showHidden), basePath, basePath, '', Infinity, showHidden)
      const lowerQ = q.toLowerCase()
      function walk(nodes: FileNode[]) {
        for (const node of nodes) {
          if (results.length >= GREP_MAX_FILES) return
          if (node.type === 'file' && node.name.toLowerCase().includes(lowerQ)) {
            results.push({ filePath: node.path, fileName: node.name, matches: [] })
          } else if (node.type === 'folder' && node.children) {
            walk(node.children)
          }
        }
      }
      walk(full)
      return c.json(results)
    }

    // 全文搜索：grep + 超时 + 结果上限
    try {
      const proc = Bun.spawn(
        ['grep', '-r', '-i', '-n',
          '--exclude-dir=.git', '--exclude-dir=node_modules', '--exclude-dir=dist',
          '--include=*.md', '--include=*.markdown',
          '--include=*.txt', '--include=*.jsonl', '--include=*.js', '--include=*.ts',
          '--include=*.py', '--include=*.json', '--include=*.yaml',
          '--include=*.yml', '--include=*.sh', '--include=*.css',
          '--include=*.html', '--include=*.go', '--include=*.rs',
          q, basePath],
        { stdout: 'pipe', stderr: 'pipe' }
      )

      // 超时保护
      const killTimer = setTimeout(() => {
        try { proc.kill() } catch { /* ignore */ }
      }, GREP_TIMEOUT_MS)

      // 读取限定字节数
      const chunks: Uint8Array[] = []
      let total = 0
      const reader = proc.stdout.getReader()
      while (total < GREP_MAX_BYTES) {
        const { value, done } = await reader.read()
        if (done) break
        chunks.push(value)
        total += value.length
      }
      try { reader.releaseLock() } catch { /* ignore */ }
      try { proc.kill() } catch { /* ignore */ }
      clearTimeout(killTimer)

      // 拼接并解析
      const buf = new Uint8Array(total)
      let offset = 0
      for (const ch of chunks) { buf.set(ch, offset); offset += ch.length }
      const output = new TextDecoder().decode(buf)

      const fileMatches: Map<string, SearchResult> = new Map()
      for (const line of output.split('\n')) {
        if (!line.trim()) continue
        if (fileMatches.size >= GREP_MAX_FILES) break
        const match = line.match(/^(.+?):(\d+):(.*)$/)
        if (!match) continue
        const [, filePath, lineNumStr, lineContent] = match
        const relPath = relative(basePath, filePath)
        // grep 的 --include=*.json 会命中服务端托管文件，内容不能外泄
        if (hasReservedSegment(relPath)) continue
        // grep 会进入点目录：默认不显示隐藏文件时在此剔除
        if (!showHidden && hasHiddenSegment(relPath)) continue
        const fileName = basename(filePath)
        if (!fileMatches.has(relPath)) {
          if (fileMatches.size >= GREP_MAX_FILES) break
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

    return c.json(results)
  })

  // GET /api/asset/* - 提供 markdown 所在目录的相对资源（图片、文件等）
  app.get('/api/asset/*', (c) => {
    const relPath = c.req.path.replace('/api/asset/', '')
    const filePath = join(basePath, decodeURIComponent(relPath))

    if (hasReservedSegment(decodeURIComponent(relPath))) {
      return c.json({ error: 'File not found' }, 404)
    }

    if (!wantsHidden(c.req.query('showHidden')) && hasHiddenSegment(decodeURIComponent(relPath))) {
      return c.json({ error: 'File not found' }, 404)
    }

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
      // 整批先校验再动手，避免拒绝之前已经删掉了前几个
      if (anyReserved(...paths)) {
        return c.json({ ok: false, error: RESERVED_ERROR }, 403)
      }
      let deleted = 0
      for (const p of paths) {
        const abs = assertSafe(p, basePath)
        await fsp.rm(abs, { recursive: true, force: true })
        deleted++
      }
      afterTreeMutation({ paths })
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
      // 改名两端都要挡：既不能把托管文件改走，也不能把普通文件改成托管文件名
      if (anyReserved(p, newName)) {
        return c.json({ ok: false, error: RESERVED_ERROR }, 403)
      }
      // 安全：newName 不允许路径分隔符或 ..
      if (/[/\\]|\.\.\./.test(newName)) {
        return c.json({ ok: false, error: 'Invalid name' }, 400)
      }
      const abs = assertSafe(p, basePath)
      const newAbs = join(dirname(abs), newName)
      // 确保 newAbs 也在 basePath 内
      assertSafe(relative(basePath, newAbs), basePath)
      await fsp.rename(abs, newAbs)
      const newPath = relative(basePath, newAbs)
      afterTreeMutation({ paths: [p, newPath] })
      return c.json({ ok: true, newPath })
    } catch (e: unknown) {
      return c.json({ ok: false, error: String(e) }, 400)
    }
  })

  // POST /api/fs/move — 移动文件/文件夹到目标目录
  app.post('/api/fs/move', async (c) => {
    try {
      const { paths, dest } = await c.req.json() as { paths: string[]; dest: string }
      // dest 允许 ''（根目录）
      if (!Array.isArray(paths) || typeof dest !== 'string') {
        return c.json({ ok: false, error: 'paths and dest required' }, 400)
      }
      // 目标文件名沿用源文件名，挡住源路径即挡住了目标
      if (anyReserved(...paths, dest)) {
        return c.json({ ok: false, error: RESERVED_ERROR }, 403)
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
      afterTreeMutation({ paths, dirs: [dest] })
      return c.json({ ok: true, moved })
    } catch (e: unknown) {
      return c.json({ ok: false, error: String(e) }, 400)
    }
  })

  // POST /api/fs/copy — 复制文件/文件夹到目标目录
  app.post('/api/fs/copy', async (c) => {
    try {
      const { paths, dest } = await c.req.json() as { paths: string[]; dest: string }
      // dest 允许 ''（根目录）
      if (!Array.isArray(paths) || typeof dest !== 'string') {
        return c.json({ ok: false, error: 'paths and dest required' }, 400)
      }
      if (anyReserved(...paths, dest)) {
        return c.json({ ok: false, error: RESERVED_ERROR }, 403)
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
      afterTreeMutation({ dirs: [dest] })
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
      if (anyReserved(p)) {
        return c.json({ ok: false, error: RESERVED_ERROR }, 403)
      }
      const abs = assertSafe(p, basePath)
      await fsp.mkdir(abs, { recursive: true })
      afterTreeMutation({ paths: [p] })
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
      if (anyReserved(p)) {
        return c.json({ ok: false, error: RESERVED_ERROR }, 403)
      }
      const abs = assertSafe(p, basePath)
      // 确保父目录存在
      await fsp.mkdir(dirname(abs), { recursive: true })
      // flag:'ax' = exclusive create，文件已存在时报错
      await fsp.writeFile(abs, '', { flag: 'ax' })
      afterTreeMutation({ paths: [p] })
      return c.json({ ok: true })
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException
      if (err.code === 'EEXIST') {
        return c.json({ ok: false, error: '文件已存在' }, 400)
      }
      return c.json({ ok: false, error: String(e) }, 400)
    }
  })

  function normalizeUploadPath(raw: string): string {
    return raw.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
  }

  // POST /api/fs/upload — 小文件整包上传
  app.post('/api/fs/upload', async (c) => {
    try {
      const rawPath = c.req.header('X-Vmd-Upload-Path') || ''
      const p = normalizeUploadPath(decodeURIComponent(rawPath))
      if (!p || p.includes('..')) return c.json({ ok: false, error: '非法路径', code: 'BAD_PATH' }, 400)
      if (anyReserved(p) || isUploadStagingPath(p)) {
        return c.json({ ok: false, error: RESERVED_ERROR, code: 'RESERVED' }, 403)
      }
      const overwrite = c.req.header('X-Vmd-Upload-Overwrite') === '1'
      assertSafe(p, basePath)
      const buf = new Uint8Array(await c.req.arrayBuffer())
      if (buf.byteLength > MAX_FILE_SIZE) {
        return c.json({ ok: false, error: `文件过大（最大 ${MAX_FILE_SIZE} 字节）` }, 400)
      }
      try {
        const path = writeSingleUpload(basePath, p, buf, overwrite)
        afterTreeMutation({ paths: [path] })
        return c.json({ ok: true, path })
      } catch (e: unknown) {
        const err = e as { code?: string; message?: string }
        if (err.code === 'EXISTS') {
          return c.json({ ok: false, error: '文件已存在', code: 'EXISTS' }, 409)
        }
        throw e
      }
    } catch (e: unknown) {
      return c.json({ ok: false, error: String(e) }, 400)
    }
  })

  // POST /api/fs/upload/init
  app.post('/api/fs/upload/init', async (c) => {
    try {
      const body = await c.req.json() as { path?: string; size?: number; overwrite?: boolean }
      const p = normalizeUploadPath(String(body.path || ''))
      const size = Number(body.size)
      if (!p || p.includes('..') || !Number.isFinite(size) || size < 0) {
        return c.json({ ok: false, error: '非法参数' }, 400)
      }
      if (anyReserved(p) || isUploadStagingPath(p)) {
        return c.json({ ok: false, error: RESERVED_ERROR, code: 'RESERVED' }, 403)
      }
      assertSafe(p, basePath)
      if (!body.overwrite && existsSync(join(basePath, p))) {
        return c.json({ ok: false, error: '文件已存在', code: 'EXISTS' }, 409)
      }
      const meta = initUploadSession(basePath, p, size, !!body.overwrite)
      return c.json({
        ok: true,
        uploadId: meta.uploadId,
        chunkSize: meta.chunkSize || CHUNK_SIZE,
        received: meta.received,
      })
    } catch (e: unknown) {
      return c.json({ ok: false, error: String(e) }, 400)
    }
  })

  // PUT /api/fs/upload/chunk
  app.put('/api/fs/upload/chunk', async (c) => {
    try {
      const uploadId = c.req.query('uploadId') || c.req.header('X-Vmd-Upload-Id') || ''
      const index = Number(c.req.query('index') ?? c.req.header('X-Vmd-Upload-Index'))
      if (!uploadId || !Number.isInteger(index)) {
        return c.json({ ok: false, error: '缺少 uploadId/index' }, 400)
      }
      const buf = new Uint8Array(await c.req.arrayBuffer())
      const meta = writeUploadChunk(basePath, uploadId, index, buf)
      return c.json({ ok: true, index, received: meta.received.length })
    } catch (e: unknown) {
      return c.json({ ok: false, error: String(e) }, 400)
    }
  })

  // POST /api/fs/upload/complete
  app.post('/api/fs/upload/complete', async (c) => {
    try {
      const body = await c.req.json() as { uploadId?: string }
      if (!body.uploadId) return c.json({ ok: false, error: 'uploadId required' }, 400)
      try {
        const path = completeUploadSession(basePath, body.uploadId)
        afterTreeMutation({ paths: [path] })
        return c.json({ ok: true, path })
      } catch (e: unknown) {
        const err = e as { code?: string; message?: string }
        if (err.code === 'EXISTS') {
          return c.json({ ok: false, error: '文件已存在', code: 'EXISTS' }, 409)
        }
        throw e
      }
    } catch (e: unknown) {
      return c.json({ ok: false, error: String(e) }, 400)
    }
  })

  // DELETE /api/fs/upload/session
  app.delete('/api/fs/upload/session', async (c) => {
    try {
      const body = await c.req.json() as { uploadId?: string }
      if (!body.uploadId) return c.json({ ok: false, error: 'uploadId required' }, 400)
      deleteUploadSession(basePath, body.uploadId)
      return c.json({ ok: true })
    } catch (e: unknown) {
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
