/**
 * Upload queue manager — concurrency, chunked resume, conflict prompts.
 */
import { fsApi } from './fsApi.js'
import { joinUploadPath, suggestRename, type PickedFile } from './uploadPaths.js'

export const SMALL_FILE_MAX = 8 * 1024 * 1024
export const CHUNK_SIZE = 4 * 1024 * 1024
export const UPLOAD_CONCURRENCY = 2
export const CHUNK_RETRIES = 3

export type UploadTaskStatus =
  | 'queued'
  | 'uploading'
  | 'done'
  | 'error'
  | 'cancelled'
  | 'skipped'

export interface UploadTask {
  id: string
  relativePath: string
  file: File
  size: number
  /** Enqueue target directory — refresh this so nested folder uploads appear */
  targetDir: string
  status: UploadTaskStatus
  /** 0–1 */
  progress: number
  error?: string
  uploadId?: string
  overwrite?: boolean
}

export type ConflictAction = 'skip' | 'overwrite' | 'rename'

export interface ConflictDecision {
  action: ConflictAction
  /** When rename: full relative destination path */
  renameTo?: string
  applyAll?: boolean
}

export type ConflictHandler = (info: {
  path: string
  fileName: string
}) => Promise<ConflictDecision>

type Listener = () => void
export type DoneListener = (path: string, targetDir: string) => void

let idSeq = 0
function nextId(): string {
  idSeq += 1
  return `up-${Date.now()}-${idSeq}`
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

class UploadManager {
  private tasks: UploadTask[] = []
  private listeners = new Set<Listener>()
  private doneListeners = new Set<DoneListener>()
  private conflictHandler: ConflictHandler | null = null
  private applyAllAction: ConflictAction | null = null
  private active = 0
  private controllers = new Map<string, AbortController>()
  private knownPaths = new Set<string>()

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  onFileDone(fn: DoneListener): () => void {
    this.doneListeners.add(fn)
    return () => this.doneListeners.delete(fn)
  }

  setConflictHandler(handler: ConflictHandler | null): void {
    this.conflictHandler = handler
  }

  getTasks(): UploadTask[] {
    return this.tasks
  }

  getSummary(): {
    total: number
    done: number
    uploading: number
    failed: number
    queued: number
    skipped: number
    bytesDone: number
    bytesTotal: number
  } {
    let done = 0, uploading = 0, failed = 0, queued = 0, skipped = 0
    let bytesDone = 0, bytesTotal = 0
    for (const t of this.tasks) {
      bytesTotal += t.size
      bytesDone += t.size * (t.status === 'done' || t.status === 'skipped' ? 1 : t.progress)
      if (t.status === 'done') done++
      else if (t.status === 'uploading') uploading++
      else if (t.status === 'error') failed++
      else if (t.status === 'queued') queued++
      else if (t.status === 'skipped' || t.status === 'cancelled') skipped++
    }
    return {
      total: this.tasks.length,
      done,
      uploading,
      failed,
      queued,
      skipped,
      bytesDone,
      bytesTotal,
    }
  }

  private emit(): void {
    for (const fn of this.listeners) fn()
  }

  private patch(id: string, patch: Partial<UploadTask>): void {
    const i = this.tasks.findIndex(t => t.id === id)
    if (i < 0) return
    this.tasks[i] = { ...this.tasks[i], ...patch }
    this.emit()
  }

  enqueue(picked: PickedFile[], targetDir: string): number {
    const idle = !this.tasks.some(t => t.status === 'queued' || t.status === 'uploading')
    if (idle) this.applyAllAction = null

    let n = 0
    for (const p of picked) {
      const path = joinUploadPath(targetDir, p.relativePath)
      if (!path) continue
      const task: UploadTask = {
        id: nextId(),
        relativePath: path,
        file: p.file,
        size: p.file.size,
        targetDir,
        status: 'queued',
        progress: 0,
      }
      this.tasks = [...this.tasks, task]
      this.knownPaths.add(path)
      n++
    }
    if (n) {
      this.emit()
      this.pump()
    }
    return n
  }

  retry(id: string): void {
    const t = this.tasks.find(x => x.id === id)
    if (!t || (t.status !== 'error' && t.status !== 'cancelled')) return
    this.patch(id, { status: 'queued', progress: 0, error: undefined })
    this.pump()
  }

  cancel(id: string): void {
    const ctrl = this.controllers.get(id)
    if (ctrl) ctrl.abort()
    const t = this.tasks.find(x => x.id === id)
    if (!t) return
    if (t.status === 'queued') {
      this.patch(id, { status: 'cancelled', progress: 0 })
    }
    // in-flight: abort handler sets cancelled
    if (t.uploadId) {
      void fsApi.uploadCancelSession(t.uploadId)
    }
  }

  clearFinished(): void {
    this.tasks = this.tasks.filter(
      t => t.status !== 'done' && t.status !== 'skipped' && t.status !== 'cancelled',
    )
    this.emit()
  }

  private pump(): void {
    while (this.active < UPLOAD_CONCURRENCY) {
      const next = this.tasks.find(t => t.status === 'queued')
      if (!next) break
      this.active++
      this.patch(next.id, { status: 'uploading', progress: next.progress || 0 })
      void this.runTask(next.id).finally(() => {
        this.active--
        this.pump()
      })
    }
  }

  private async resolveConflict(path: string): Promise<ConflictDecision> {
    if (this.applyAllAction === 'skip') return { action: 'skip' }
    if (this.applyAllAction === 'overwrite') return { action: 'overwrite' }
    if (this.applyAllAction === 'rename') {
      const renameTo = suggestRename(path, p => this.knownPaths.has(p))
      this.knownPaths.add(renameTo)
      return { action: 'rename', renameTo }
    }
    if (!this.conflictHandler) return { action: 'skip' }
    const fileName = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path
    const decision = await this.conflictHandler({ path, fileName })
    if (decision.applyAll) this.applyAllAction = decision.action
    if (decision.action === 'rename') {
      const renameTo = decision.renameTo
        || suggestRename(path, p => this.knownPaths.has(p))
      this.knownPaths.add(renameTo)
      return { ...decision, renameTo }
    }
    return decision
  }

  private async runTask(id: string): Promise<void> {
    const ctrl = new AbortController()
    this.controllers.set(id, ctrl)
    try {
      let task = this.tasks.find(t => t.id === id)
      if (!task) return

      let path = task.relativePath
      let overwrite = !!task.overwrite

      const tryUpload = async (): Promise<'ok' | 'exists' | 'fail'> => {
        task = this.tasks.find(t => t.id === id)
        if (!task || task.status === 'cancelled') return 'fail'
        if (ctrl.signal.aborted) {
          this.patch(id, { status: 'cancelled' })
          return 'fail'
        }

        if (task.size <= SMALL_FILE_MAX) {
          const buf = await task.file.arrayBuffer()
          if (ctrl.signal.aborted) {
            this.patch(id, { status: 'cancelled' })
            return 'fail'
          }
          const res = await fsApi.upload(path, buf, { overwrite, signal: ctrl.signal })
          if (!res.ok) {
            if (res.code === 'EXISTS' || /已存在/.test(res.error)) {
              return 'exists'
            }
            this.patch(id, { status: 'error', error: res.error })
            return 'fail'
          }
          this.patch(id, { status: 'done', progress: 1, relativePath: res.path || path })
          for (const fn of this.doneListeners) fn(res.path || path, task.targetDir)
          return 'ok'
        }

        // chunked
        const init = await fsApi.uploadInit(path, task.size, overwrite)
        if (!init.ok) {
          if (init.code === 'EXISTS' || /已存在/.test(init.error)) {
            return 'exists'
          }
          this.patch(id, { status: 'error', error: init.error })
          return 'fail'
        }
        const { uploadId, chunkSize, received } = init
        this.patch(id, { uploadId })
        const totalChunks = task.size === 0 ? 1 : Math.ceil(task.size / chunkSize)
        const have = new Set(received)

        for (let index = 0; index < totalChunks; index++) {
          if (ctrl.signal.aborted) {
            this.patch(id, { status: 'cancelled' })
            return 'fail'
          }
          if (have.has(index)) {
            this.patch(id, { progress: (index + 1) / totalChunks })
            continue
          }
          const start = index * chunkSize
          const end = Math.min(start + chunkSize, task.size)
          const slice = task.file.slice(start, end)
          let lastErr = ''
          let ok = false
          for (let attempt = 0; attempt < CHUNK_RETRIES; attempt++) {
            const put = await fsApi.uploadChunk(uploadId, index, slice, ctrl.signal)
            if (put.ok) {
              ok = true
              break
            }
            lastErr = put.error
            if (ctrl.signal.aborted) break
            await sleep(200 * (attempt + 1))
          }
          if (!ok) {
            this.patch(id, {
              status: ctrl.signal.aborted ? 'cancelled' : 'error',
              error: lastErr || '分片上传失败',
            })
            return 'fail'
          }
          this.patch(id, { progress: (index + 1) / totalChunks })
        }

        const done = await fsApi.uploadComplete(uploadId)
        if (!done.ok) {
          if ((done as { code?: string }).code === 'EXISTS' || /已存在/.test(done.error)) {
            return 'exists'
          }
          this.patch(id, { status: 'error', error: done.error })
          return 'fail'
        }
        this.patch(id, { status: 'done', progress: 1, relativePath: done.path || path })
        for (const fn of this.doneListeners) fn(done.path || path, task.targetDir)
        return 'ok'
      }

      // conflict loop
      for (;;) {
        const result = await tryUpload()
        if (result === 'ok' || result === 'fail') return
        const decision = await this.resolveConflict(path)
        if (decision.action === 'skip') {
          this.patch(id, { status: 'skipped', progress: 1 })
          return
        }
        if (decision.action === 'overwrite') {
          overwrite = true
          this.patch(id, { overwrite: true })
          continue
        }
        // rename
        if (decision.renameTo) {
          path = decision.renameTo
          overwrite = false
          this.patch(id, { relativePath: path, overwrite: false })
          continue
        }
        this.patch(id, { status: 'skipped', progress: 1 })
        return
      }
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError'
      this.patch(id, {
        status: aborted ? 'cancelled' : 'error',
        error: aborted ? undefined : String(e),
      })
    } finally {
      this.controllers.delete(id)
    }
  }
}

export const uploadManager = new UploadManager()
