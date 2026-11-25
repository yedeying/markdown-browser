import { watch } from 'fs'
import { dirname, join, relative } from 'path'
import { realpathSync } from 'fs'
import type { WatchEvent } from '../types.js'

type SSEWriter = (data: string) => void

export interface FileWatcher {
  addClient: (writer: SSEWriter, clientId?: string) => void
  removeClient: (writer: SSEWriter, clientId?: string) => void
  close: () => void
  /** 订阅内部事件（供缓存失效使用；不走 SSE 通道） */
  onEvent: (listener: (e: WatchEvent) => void) => () => void
  /**
   * 主动通知目录列表变化（文件 API 写成功后调用）。
   * 不依赖 OS watcher，避免删改后缓存/SSE 漏更新。
   */
  notifyTreeChange: (affectedPath: string) => void
  /**
   * 按需 watch：确保 relPath（挂载点相对路径，'' = 根）及其祖先链被监听。
   * 由 /api/files（展开/列目录）、/api/file（编辑器打开）、/api/stat 触发。
   */
  ensureWatched: (relPath: string) => void
  /** 显式释放对 relPath 及其不再被其他活跃路径覆盖的祖先的监听 */
  releasePath: (relPath: string) => void
  /** 按客户端会话显式同步其当前可视目录集合（服务端取所有活跃会话的并集） */
  syncWatched: (clientId: string, relPaths: string[]) => void
  /** 当前活跃（已 watch）目录数，供诊断 */
  activeCount: () => number
}

const DEBOUNCE_MS = 200
/** SSE 断开后的宽限期（ms）：覆盖页面刷新与短断线重连，避免 watch 被瞬间清空 */
const DEFAULT_DISCONNECT_GRACE_MS = 15_000
/** 单客户端最多同步的可视目录数 */
const MAX_CLIENT_SYNC_PATHS = 128

/** 活跃叶路径上限：超过后淘汰最久未触达的路径（LRU） */
const MAX_ACTIVE_PATHS = 512

/**
 * 家目录作 root 时，这些路径会疯狂写入（浏览器缓存等）。
 * watch 命中后若广播 tree-change，客户端会刷屏请求 /api/files。
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
    ensureWatched() { /* 单文件模式无目录树 */ },
    releasePath() { /* 单文件模式无目录树 */ },
    syncWatched() { /* 单文件模式无目录树 */ },
    activeCount() { return 0 },
  }
}

export interface DirWatcherOptions {
  /** SSE 断开后的清理宽限期（ms），默认 15s */
  graceMs?: number
}

/**
 * 目录模式 watcher —— 按需监听。
 *
 * 不做启动期全量 recursive watch：挂载点可能包含 50 万文件的 NAS 数据盘，
 * 任何「按目标计费」的实现（bun 1.3.11 每目标 ~2 fd、inotify 每目录一个
 * watch）都会把进程 fd 打满。改为：只有客户端实际展开/列出的目录（以及
 * 编辑器打开的文件所在目录）才注册 watch，路径的祖先链一并覆盖；支持多
 * 客户端显式 syncWatched（取并集）与断线宽限期（覆盖刷新/短断线重连）。
 */
export function createDirWatcher(basePath: string, options?: DirWatcherOptions): FileWatcher {
  const graceMs = options?.graceMs ?? DEFAULT_DISCONNECT_GRACE_MS
  const clients = new Set<SSEWriter>()
  const listeners = new Set<(e: WatchEvent) => void>()
  // 隐式活跃叶路径（由 /api/files 等触发）→ 最近触达时间。Map 迭代序 = 使用序（LRU）
  const activePaths = new Map<string, number>()
  // 显式按客户端会话维护的可视目录集合：clientId → Set<relPath>
  const clientPaths = new Map<string, Set<string>>()
  // 单客户端断线后的宽限清理定时器
  const clientGraceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  // 全部 SSE 断开后的全局宽限清理定时器
  let globalGraceTimer: ReturnType<typeof setTimeout> | null = null
  // 实际 watch 的目录（祖先闭包）→ FSWatcher
  const watchers = new Map<string, ReturnType<typeof watch>>()
  let sseCount = 0

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
  const pending = new Map<string, { timer: ReturnType<typeof setTimeout> }>()

  function schedule(filename: string) {
    const normalized = filename.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
    if (shouldIgnoreWatchPath(normalized)) return
    const existing = pending.get(normalized)
    if (existing) clearTimeout(existing.timer)
    const timer = setTimeout(() => {
      pending.delete(normalized)
      // 所有受监听文件变更均推送精准 reload(path)，由前端按 currentPath 决定是否重载
      if (normalized) {
        broadcast({ type: 'reload', mtime: Date.now(), path: normalized })
      }
      // tree-change 带上受影响目录（文件所在目录的相对路径）
      const affectedPath = dirname(normalized)
      broadcast({ type: 'tree-change', affectedPath: affectedPath === '.' ? '' : affectedPath })
    }, DEBOUNCE_MS)
    pending.set(normalized, { timer })
  }

  const normalizeRel = (p: string) => p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')

  /** 需要 watch 的目录集合 = 所有活跃叶路径 + 所有在线客户端订阅路径的祖先闭包 */
  function reconcile() {
    const need = new Set<string>()
    const addWithAncestors = (p: string) => {
      let cur = p
      while (true) {
        need.add(cur)
        if (!cur) break
        const i = cur.lastIndexOf('/')
        cur = i === -1 ? '' : cur.slice(0, i)
      }
    }
    for (const p of activePaths.keys()) addWithAncestors(p)
    for (const set of clientPaths.values()) {
      for (const p of set) addWithAncestors(p)
    }
    // 新增
    for (const rel of need) {
      const abs = rel ? join(basePath, rel) : basePath
      if (watchers.has(abs)) continue
      let w: ReturnType<typeof watch>
      try {
        w = watch(abs, { recursive: false }, (_eventType, filename) => {
          const name = typeof filename === 'string' ? filename : filename?.toString() ?? ''
          schedule(rel ? `${rel}/${name}` : name)
        })
      } catch {
        continue
      }
      w.on('error', () => { /* ignore symlink / 权限问题 */ })
      watchers.set(abs, w)
    }
    // 移除不再被覆盖的
    for (const [abs, w] of watchers) {
      const rel = abs === basePath ? '' : relative(basePath, abs)
      if (need.has(rel)) continue
      try { w.close() } catch { /* ignore */ }
      watchers.delete(abs)
    }
  }

  /** 路径越界防护：解析后必须仍在 basePath 内 */
  function assertInside(relPath: string): boolean {
    const abs = relPath ? join(basePath, relPath) : basePath
    try {
      const realBase = realpathSync(basePath)
      const realAbs = realpathSync(abs)
      return realAbs === realBase || realAbs.startsWith(realBase + '/')
    } catch {
      return false
    }
  }

  function touch(p: string) {
    if (activePaths.has(p)) activePaths.delete(p)
    activePaths.set(p, Date.now())
  }

  function ensureWatched(relPath: string) {
    const norm = normalizeRel(relPath)
    if (!assertInside(norm)) return
    touch(norm)
    // LRU：超出上限淘汰最久未触达
    while (activePaths.size > MAX_ACTIVE_PATHS) {
      const oldest = activePaths.keys().next().value
      if (oldest === undefined) break
      activePaths.delete(oldest)
    }
    reconcile()
  }

  function releasePath(relPath: string) {
    const norm = normalizeRel(relPath)
    activePaths.delete(norm)
    for (const set of clientPaths.values()) set.delete(norm)
    reconcile()
  }

  function syncWatched(clientId: string, relPaths: string[]) {
    if (!clientId) return
    const pendingTimer = clientGraceTimers.get(clientId)
    if (pendingTimer) {
      clearTimeout(pendingTimer)
      clientGraceTimers.delete(clientId)
    }
    if (globalGraceTimer) {
      clearTimeout(globalGraceTimer)
      globalGraceTimer = null
    }
    const next = new Set<string>()
    for (const raw of relPaths.slice(0, MAX_CLIENT_SYNC_PATHS)) {
      const norm = normalizeRel(raw)
      if (assertInside(norm)) next.add(norm)
    }
    if (next.size > 0) clientPaths.set(clientId, next)
    else clientPaths.delete(clientId)
    // 客户端已进入显式同步模式时，收敛旧隐式路径避免僵尸监听残留
    activePaths.clear()
    reconcile()
  }

  function clearActive() {
    activePaths.clear()
    clientPaths.clear()
    reconcile()
  }

  const pingInterval = setInterval(() => {
    broadcast({ type: 'ping' })
  }, 30_000)

  return {
    addClient(writer, clientId) {
      clients.add(writer)
      sseCount++
      if (globalGraceTimer) {
        clearTimeout(globalGraceTimer)
        globalGraceTimer = null
      }
      if (clientId) {
        const t = clientGraceTimers.get(clientId)
        if (t) {
          clearTimeout(t)
          clientGraceTimers.delete(clientId)
        }
      }
    },
    removeClient(writer, clientId) {
      clients.delete(writer)
      sseCount = Math.max(0, sseCount - 1)
      // 单客户端断开：宽限期后再移除其订阅，避免刷新/短断线抖动
      if (clientId && clientPaths.has(clientId)) {
        const prev = clientGraceTimers.get(clientId)
        if (prev) clearTimeout(prev)
        clientGraceTimers.set(clientId, setTimeout(() => {
          clientGraceTimers.delete(clientId)
          clientPaths.delete(clientId)
          reconcile()
        }, graceMs))
      }
      // 最后一个页面断开：宽限期后若仍无连接，释放全部监听
      if (sseCount === 0) {
        if (globalGraceTimer) clearTimeout(globalGraceTimer)
        globalGraceTimer = setTimeout(() => {
          globalGraceTimer = null
          if (sseCount === 0) clearActive()
        }, graceMs)
      }
    },
    close() {
      for (const { timer } of pending.values()) clearTimeout(timer)
      pending.clear()
      for (const t of clientGraceTimers.values()) clearTimeout(t)
      clientGraceTimers.clear()
      if (globalGraceTimer) {
        clearTimeout(globalGraceTimer)
        globalGraceTimer = null
      }
      clearInterval(pingInterval)
      clearActive()
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
    ensureWatched,
    releasePath,
    syncWatched,
    activeCount() { return watchers.size },
  }
}
