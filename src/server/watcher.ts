import { watch, readdirSync } from 'fs'
import { dirname, join } from 'path'
import type { WatchEvent } from '../types.js'

type SSEWriter = (data: string) => void

export interface FileWatcher {
  addClient: (writer: SSEWriter) => void
  removeClient: (writer: SSEWriter) => void
  close: () => void
  /** 订阅内部事件（供缓存失效使用；不走 SSE 通道） */
  onEvent: (listener: (e: WatchEvent) => void) => () => void
  /**
   * 主动通知目录列表变化（文件 API 写成功后调用）。
   * 不依赖 OS watcher，避免删改后缓存/SSE 漏更新。
   */
  notifyTreeChange: (affectedPath: string) => void
}

const DEBOUNCE_MS = 200

/**
 * 家目录作 root 时，这些路径会疯狂写入（浏览器缓存等）。
 * recursive watch 命中后若广播 tree-change，客户端会刷屏请求 /api/files。
 */
const WATCH_NOISE_PREFIXES = [
  'Library/',
  'Library',
  '.Trash/',
  '.Trash',
  '.cache/',
  '.cache',
  '.npm/',
  '.npm',
  '.bun/',
  '.bun',
  '.local/share/Trash/',
  'AppData/Local/',
  'AppData/Roaming/',
]

const WATCH_NOISE_SEGMENTS = new Set([
  'node_modules',
  '.git',
  'Cache',
  'Caches',
  'Cache_Data',
  'Code Cache',
  'GPUCache',
  'GrShaderCache',
  'ShaderCache',
  'Service Worker',
  'IndexedDB',
  'Local Storage',
  'Session Storage',
  'com.apple.bird',
])

/** 供测试与 watcher 共用：是否应忽略该相对路径上的 fs 事件 */
export function shouldIgnoreWatchPath(filename: string): boolean {
  const normalized = filename.replace(/\\/g, '/').replace(/^\.\//, '')
  if (!normalized || normalized === '.') return false
  for (const prefix of WATCH_NOISE_PREFIXES) {
    if (normalized === prefix.replace(/\/$/, '') || normalized.startsWith(prefix)) return true
  }
  return normalized.split('/').some((seg) => WATCH_NOISE_SEGMENTS.has(seg))
}

/**
 * 递归 watch 时必须剪掉的目录。
 *
 * 背景：`fs.watch(dir, { recursive: true })` 会为树里每个目标占资源 ——
 * bun 1.3.11 下每个文件/目录各占一个 fd，一个 50 万文件的挂载点（如 NAS 相册
 * 缩略图缓存）足以把 nofile 打满，进程随之卡死。这里在注册前剪枝：
 * node_modules / 各类缓存目录 / 相册缩略图索引一律不监听（它们也不该触发
 * tree-change 广播，WATCH_NOISE_SEGMENTS 已按同样思路过滤事件）。
 */
const WATCH_SKIP_DIRS = new Set([
  ...WATCH_NOISE_SEGMENTS,
  'dist', 'build', '.next', '.turbo',
  '@thumbnail', '@exif', '@media_cache', '@version_explorer_cache',
  '@search', '@tmp', '@appstore', '@ugvault', '@upload', '@FileManager',
  'lost+found',
])

/** 递归 watch 的最大深度（再深的目录不订阅，避免巨型树吃光 fd） */
const MAX_WATCH_DEPTH = 8

interface TreeWatch {
  close: () => void
}

/**
 * 逐层注册非递归 watch 代替 `recursive: true`：
 * 可以跳过巨型/噪声目录，并按深度上限截断。
 */
function watchTree(root: string, onFile: (relPath: string) => void): TreeWatch {
  const watchers: Array<ReturnType<typeof watch>> = []
  let closed = false

  const emit = (relDir: string, filename: string | Buffer | null) => {
    const name = typeof filename === 'string' ? filename : filename?.toString()
    if (!name) {
      if (relDir) onFile(relDir)
      return
    }
    onFile(relDir ? `${relDir}/${name}` : name)
  }

  const walk = (dir: string, relDir: string, depth: number) => {
    if (closed) return
    try {
      const w = watch(dir, { recursive: false }, (_eventType, filename) => emit(relDir, filename))
      w.on('error', () => { /* ignore symlink / 权限问题 */ })
      watchers.push(w)
    } catch {
      return
    }
    if (depth >= MAX_WATCH_DEPTH) return
    let entries: Array<{ name: string; isDir: boolean }>
    try {
      entries = readdirSync(dir, { withFileTypes: true }).map((d) => ({
        name: d.name,
        isDir: d.isDirectory(),
      }))
    } catch {
      return
    }
    for (const e of entries) {
      if (!e.isDir) continue
      // 点目录（.git/.cache/.npm…）与缓存目录一律不深入
      if (e.name.startsWith('.') || WATCH_SKIP_DIRS.has(e.name)) continue
      walk(join(dir, e.name), relDir ? `${relDir}/${e.name}` : e.name, depth + 1)
    }
  }

  walk(root, '', 0)

  return {
    close() {
      closed = true
      for (const w of watchers) {
        try { w.close() } catch { /* ignore */ }
      }
      watchers.length = 0
    },
  }
}

export function createWatcher(target: string): FileWatcher {
  const clients = new Set<SSEWriter>()
  const listeners = new Set<(e: WatchEvent) => void>()

  function broadcast(event: WatchEvent) {
    const payload = `data: ${JSON.stringify(event)}\n\n`
    for (const writer of clients) {
      try { writer(payload) } catch { clients.delete(writer) }
    }
    for (const l of listeners) {
      try { l(event) } catch { /* ignore */ }
    }
  }

  // 单文件场景：防抖 reload
  let timer: ReturnType<typeof setTimeout> | null = null
  const watcher = watch(target, { recursive: false }, () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => broadcast({ type: 'reload', mtime: Date.now() }), DEBOUNCE_MS)
  })

  watcher.on('error', () => { /* ignore */ })

  const pingInterval = setInterval(() => {
    broadcast({ type: 'ping' })
  }, 30_000)

  return {
    addClient(writer) { clients.add(writer) },
    removeClient(writer) { clients.delete(writer) },
    close() {
      if (timer) clearTimeout(timer)
      clearInterval(pingInterval)
      watcher.close()
      clients.clear()
      listeners.clear()
    },
    onEvent(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    notifyTreeChange() {
      /* 单文件模式无目录树 */
    },
  }
}

export function createDirWatcher(basePath: string): FileWatcher {
  const clients = new Set<SSEWriter>()
  const listeners = new Set<(e: WatchEvent) => void>()

  function broadcast(event: WatchEvent) {
    const payload = `data: ${JSON.stringify(event)}\n\n`
    for (const writer of clients) {
      try { writer(payload) } catch { clients.delete(writer) }
    }
    for (const l of listeners) {
      try { l(event) } catch { /* ignore */ }
    }
  }

  // 合并相近事件：每个 filename 最多在 DEBOUNCE_MS 内触发一次
  const pending = new Map<string, { isMarkdown: boolean; timer: ReturnType<typeof setTimeout> }>()

  function schedule(filename: string) {
    const normalized = filename.replace(/\\/g, '/')
    if (shouldIgnoreWatchPath(normalized)) return
    const isMarkdown = normalized.endsWith('.md') || normalized.endsWith('.markdown')
    const existing = pending.get(normalized)
    if (existing) clearTimeout(existing.timer)
    const timer = setTimeout(() => {
      pending.delete(normalized)
      if (isMarkdown) {
        broadcast({ type: 'reload', mtime: Date.now() })
      }
      // tree-change 带上受影响目录（文件所在目录的相对路径）
      const affectedPath = dirname(normalized)
      broadcast({ type: 'tree-change', affectedPath: affectedPath === '.' ? '' : affectedPath })
    }, DEBOUNCE_MS)
    pending.set(normalized, { isMarkdown, timer })
  }

  // 逐层 watch（非 recursive:true），跳过 node_modules / 相册缩略图等巨型目录，
  // 否则 50 万文件的挂载点会把进程 fd 打满（bun 1.3.11 的 recursive watch 每目标 1 fd）
  const watcher = watchTree(basePath, (filename) => {
    schedule(filename)
  })

  const pingInterval = setInterval(() => {
    broadcast({ type: 'ping' })
  }, 30_000)

  return {
    addClient(writer) { clients.add(writer) },
    removeClient(writer) { clients.delete(writer) },
    close() {
      for (const { timer } of pending.values()) clearTimeout(timer)
      pending.clear()
      clearInterval(pingInterval)
      watcher.close()
      clients.clear()
      listeners.clear()
    },
    onEvent(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    notifyTreeChange(affectedPath: string) {
      const normalized = affectedPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
      broadcast({ type: 'tree-change', affectedPath: normalized })
    },
  }
}
