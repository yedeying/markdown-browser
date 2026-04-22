import { watch } from 'fs'
import { dirname } from 'path'
import type { WatchEvent } from '../types.js'

type SSEWriter = (data: string) => void

export interface FileWatcher {
  addClient: (writer: SSEWriter) => void
  removeClient: (writer: SSEWriter) => void
  close: () => void
  /** 订阅内部事件（供缓存失效使用；不走 SSE 通道） */
  onEvent: (listener: (e: WatchEvent) => void) => () => void
}

const DEBOUNCE_MS = 200

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

  const watcher = watch(basePath, { recursive: true }, (_eventType, filename) => {
    if (!filename) return
    schedule(filename)
  })

  watcher.on('error', () => { /* ignore symlink / 权限问题 */ })

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
  }
}
