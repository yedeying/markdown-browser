/**
 * Chunked upload sessions — staging under `<mount>/.vmd-upload/<id>/`
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, renameSync, openSync, writeSync, closeSync, fstatSync } from 'fs'
import { join, dirname, basename } from 'path'
import { randomUUID } from 'crypto'

export const UPLOAD_STAGING_DIR = '.vmd-upload'
export const CHUNK_SIZE = 4 * 1024 * 1024
export const SMALL_FILE_MAX = 8 * 1024 * 1024
export const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024
export const SESSION_TTL_MS = 48 * 60 * 60 * 1000

export interface UploadSessionMeta {
  uploadId: string
  path: string
  size: number
  chunkSize: number
  overwrite: boolean
  received: number[]
  createdAt: number
}

function stagingRoot(basePath: string): string {
  return join(basePath, UPLOAD_STAGING_DIR)
}

function sessionDir(basePath: string, uploadId: string): string {
  return join(stagingRoot(basePath), uploadId)
}

function metaPath(basePath: string, uploadId: string): string {
  return join(sessionDir(basePath, uploadId), 'meta.json')
}

function partPath(basePath: string, uploadId: string, index: number): string {
  return join(sessionDir(basePath, uploadId), `part-${String(index).padStart(5, '0')}`)
}

function readMeta(basePath: string, uploadId: string): UploadSessionMeta | null {
  try {
    const raw = readFileSync(metaPath(basePath, uploadId), 'utf8')
    return JSON.parse(raw) as UploadSessionMeta
  } catch {
    return null
  }
}

function writeMeta(basePath: string, meta: UploadSessionMeta): void {
  writeFileSync(metaPath(basePath, meta.uploadId), JSON.stringify(meta), 'utf8')
}

/** Reject user destinations that target staging itself */
export function isUploadStagingPath(relPath: string): boolean {
  const n = relPath.replace(/\\/g, '/').replace(/^\/+/, '')
  return n === UPLOAD_STAGING_DIR || n.startsWith(`${UPLOAD_STAGING_DIR}/`)
}

export function expectedChunkCount(size: number, chunkSize = CHUNK_SIZE): number {
  if (size <= 0) return 1
  return Math.ceil(size / chunkSize)
}

function purgeExpiredSessions(basePath: string): void {
  const root = stagingRoot(basePath)
  if (!existsSync(root)) return
  const now = Date.now()
  for (const name of readdirSync(root)) {
    const meta = readMeta(basePath, name)
    if (!meta || now - meta.createdAt > SESSION_TTL_MS) {
      rmSync(join(root, name), { recursive: true, force: true })
    }
  }
}

function findResumable(basePath: string, path: string, size: number): UploadSessionMeta | null {
  const root = stagingRoot(basePath)
  if (!existsSync(root)) return null
  for (const name of readdirSync(root)) {
    const meta = readMeta(basePath, name)
    if (!meta) continue
    if (meta.path === path && meta.size === size && Date.now() - meta.createdAt <= SESSION_TTL_MS) {
      return meta
    }
  }
  return null
}

export function initUploadSession(
  basePath: string,
  path: string,
  size: number,
  overwrite: boolean,
): UploadSessionMeta {
  if (size < 0 || size > MAX_FILE_SIZE) {
    throw new Error(`文件大小超出限制（最大 ${MAX_FILE_SIZE} 字节）`)
  }
  purgeExpiredSessions(basePath)

  const existing = findResumable(basePath, path, size)
  if (existing) {
    existing.overwrite = overwrite
    writeMeta(basePath, existing)
    return existing
  }

  const uploadId = randomUUID()
  mkdirSync(sessionDir(basePath, uploadId), { recursive: true })
  const meta: UploadSessionMeta = {
    uploadId,
    path,
    size,
    chunkSize: CHUNK_SIZE,
    overwrite,
    received: [],
    createdAt: Date.now(),
  }
  writeMeta(basePath, meta)
  return meta
}

export function writeUploadChunk(
  basePath: string,
  uploadId: string,
  index: number,
  data: Uint8Array,
): UploadSessionMeta {
  const meta = readMeta(basePath, uploadId)
  if (!meta) throw new Error('上传会话不存在或已过期')
  const total = expectedChunkCount(meta.size, meta.chunkSize)
  if (index < 0 || index >= total) throw new Error('分片索引无效')

  const expectedLen = index === total - 1
    ? meta.size - meta.chunkSize * (total - 1)
    : meta.chunkSize
  // empty file: one chunk of length 0
  const want = meta.size === 0 ? 0 : expectedLen
  if (data.byteLength !== want) {
    throw new Error(`分片大小不匹配：期望 ${want}，收到 ${data.byteLength}`)
  }

  writeFileSync(partPath(basePath, uploadId, index), data)
  if (!meta.received.includes(index)) {
    meta.received.push(index)
    meta.received.sort((a, b) => a - b)
    writeMeta(basePath, meta)
  }
  return meta
}

export function completeUploadSession(basePath: string, uploadId: string): string {
  const meta = readMeta(basePath, uploadId)
  if (!meta) throw new Error('上传会话不存在或已过期')

  const total = expectedChunkCount(meta.size, meta.chunkSize)
  if (meta.received.length !== total) {
    throw new Error(`分片不完整：${meta.received.length}/${total}`)
  }
  for (let i = 0; i < total; i++) {
    if (!meta.received.includes(i)) throw new Error(`缺少分片 ${i}`)
  }

  const finalAbs = join(basePath, meta.path)
  if (existsSync(finalAbs) && !meta.overwrite) {
    throw Object.assign(new Error('文件已存在'), { code: 'EXISTS' as const })
  }

  mkdirSync(dirname(finalAbs), { recursive: true })
  const tmpAbs = `${finalAbs}.vmd-uploading`
  const fd = openSync(tmpAbs, 'w')
  try {
    for (let i = 0; i < total; i++) {
      const buf = readFileSync(partPath(basePath, uploadId, i))
      writeSync(fd, buf)
    }
    // ensure size
    const st = fstatSync(fd)
    if (st.size !== meta.size) {
      throw new Error(`组装后大小不符：期望 ${meta.size}，实际 ${st.size}`)
    }
  } finally {
    closeSync(fd)
  }

  if (existsSync(finalAbs)) rmSync(finalAbs, { recursive: true, force: true })
  renameSync(tmpAbs, finalAbs)
  rmSync(sessionDir(basePath, uploadId), { recursive: true, force: true })
  return meta.path
}

export function deleteUploadSession(basePath: string, uploadId: string): void {
  const dir = sessionDir(basePath, uploadId)
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
}

export function writeSingleUpload(
  basePath: string,
  relPath: string,
  data: Uint8Array,
  overwrite: boolean,
): string {
  if (data.byteLength > MAX_FILE_SIZE) {
    throw new Error(`文件大小超出限制（最大 ${MAX_FILE_SIZE} 字节）`)
  }
  const finalAbs = join(basePath, relPath)
  if (existsSync(finalAbs) && !overwrite) {
    throw Object.assign(new Error('文件已存在'), { code: 'EXISTS' as const })
  }
  mkdirSync(dirname(finalAbs), { recursive: true })
  const tmpAbs = `${finalAbs}.vmd-uploading`
  writeFileSync(tmpAbs, data)
  if (existsSync(finalAbs)) rmSync(finalAbs, { recursive: true, force: true })
  renameSync(tmpAbs, finalAbs)
  return relPath
}

export function suggestRename(relPath: string, exists: (p: string) => boolean): string {
  const dir = dirname(relPath)
  const base = basename(relPath)
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  const ext = dot > 0 ? base.slice(dot) : ''
  let n = 1
  while (n < 10000) {
    const name = `${stem} (${n})${ext}`
    const candidate = dir === '.' ? name : `${dir}/${name}`
    if (!exists(candidate)) return candidate.replace(/\\/g, '/')
    n++
  }
  throw new Error('无法生成可用文件名')
}
