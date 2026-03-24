import { watch } from 'fs'
import type { WatchEvent } from '../types.js'

type SSEWriter = (data: string) => void

export interface FileWatcher {
  addClient: (writer: SSEWriter) => void
  removeClient: (writer: SSEWriter) => void
  close: () => void
}

export function createWatcher(target: string): FileWatcher {
  const clients = new Set<SSEWriter>()

  function broadcast(event: WatchEvent) {
    const payload = `data: ${JSON.stringify(event)}\n\n`
    for (const writer of clients) {
      try {
        writer(payload)
      } catch {
        clients.delete(writer)
      }
    }
  }

  const watcher = watch(target, { recursive: false }, (_eventType, _filename) => {
    broadcast({ type: 'reload', mtime: Date.now() })
  })

  // 30s ping 防止连接超时
  const pingInterval = setInterval(() => {
    broadcast({ type: 'ping' })
  }, 30_000)

  return {
    addClient(writer: SSEWriter) {
      clients.add(writer)
    },
    removeClient(writer: SSEWriter) {
      clients.delete(writer)
    },
    close() {
      clearInterval(pingInterval)
      watcher.close()
      clients.clear()
    },
  }
}

export function createDirWatcher(basePath: string): FileWatcher {
  const clients = new Set<SSEWriter>()

  function broadcast(event: WatchEvent) {
    const payload = `data: ${JSON.stringify(event)}\n\n`
    for (const writer of clients) {
      try {
        writer(payload)
      } catch {
        clients.delete(writer)
      }
    }
  }

  // 目录监听：监听变化广播 tree-change 或 reload
  const watcher = watch(basePath, { recursive: true }, (eventType, filename) => {
    if (!filename) return
    if (filename.endsWith('.md') || filename.endsWith('.markdown')) {
      broadcast({ type: 'reload', mtime: Date.now() })
    } else {
      broadcast({ type: 'tree-change' })
    }
  })

  const pingInterval = setInterval(() => {
    broadcast({ type: 'ping' })
  }, 30_000)

  return {
    addClient(writer: SSEWriter) {
      clients.add(writer)
    },
    removeClient(writer: SSEWriter) {
      clients.delete(writer)
    },
    close() {
      clearInterval(pingInterval)
      watcher.close()
      clients.clear()
    },
  }
}
