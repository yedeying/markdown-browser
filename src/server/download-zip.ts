/**
 * Collect files for multi-download zip and pack with fflate.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { basename, dirname, join } from 'path'
import { zipSync } from 'fflate'
import { hasReservedSegment, isReservedFilename } from './reserved-files.js'

export const MAX_ZIP_ENTRIES = 5000
export const MAX_ZIP_BYTES = 2 * 1024 * 1024 * 1024

const IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.DS_Store', '.vmd-upload'])

export interface ZipFileEntry {
  /** Path inside the zip (posix) */
  name: string
  data: Uint8Array
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/')
}

export function normalizeDownloadPath(raw: string): string {
  return toPosix(raw).replace(/^\/+/, '').replace(/\/+$/, '')
}

/** RFC 5987 Content-Disposition for attachment */
export function contentDispositionAttachment(filename: string): string {
  const safe = filename.replace(/["\\\r\n]/g, '_')
  const encoded = encodeURIComponent(filename)
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`
}

/** Longest common directory prefix of the selected roots' parent dirs */
export function commonParentDir(paths: string[]): string {
  const dirs = paths.map(p => {
    const n = normalizeDownloadPath(p)
    if (!n) return ''
    const d = dirname(n)
    return d === '.' ? '' : toPosix(d)
  })
  if (dirs.length === 0) return ''
  if (dirs.every(d => d === dirs[0])) return dirs[0]
  const parts = dirs.map(d => (d ? d.split('/') : []))
  const f0 = parts[0]
  let j = 0
  while (j < f0.length && parts.every(p => p[j] === f0[j])) j++
  return f0.slice(0, j).join('/')
}

export function zipEntryName(fileRel: string, sharedParent: string): string {
  const file = normalizeDownloadPath(fileRel)
  if (sharedParent) {
    const prefix = sharedParent + '/'
    if (file.startsWith(prefix)) return file.slice(prefix.length)
    if (file === sharedParent) return basename(file)
  }
  return file
}

function shouldSkipName(name: string): boolean {
  return IGNORE_DIRS.has(name) || isReservedFilename(name)
}

/** Walk one root (file or directory) into flat file list */
export function walkDownloadRoot(
  basePath: string,
  rootRel: string,
): { abs: string; rel: string }[] {
  const root = normalizeDownloadPath(rootRel)
  if (!root || root.includes('..') || hasReservedSegment(root)) {
    throw Object.assign(new Error('非法路径'), { code: 'BAD_PATH' as const })
  }
  const absRoot = join(basePath, root)
  if (!existsSync(absRoot)) {
    throw Object.assign(new Error(`不存在: ${root}`), { code: 'NOT_FOUND' as const })
  }
  const st = statSync(absRoot)
  const out: { abs: string; rel: string }[] = []

  if (st.isFile()) {
    if (isReservedFilename(basename(absRoot))) {
      throw Object.assign(new Error('不可下载'), { code: 'RESERVED' as const })
    }
    out.push({ abs: absRoot, rel: root })
    return out
  }

  if (!st.isDirectory()) return out

  const walk = (dirAbs: string, dirRel: string) => {
    for (const name of readdirSync(dirAbs)) {
      if (shouldSkipName(name)) continue
      const childAbs = join(dirAbs, name)
      const childRel = dirRel ? `${dirRel}/${name}` : name
      if (hasReservedSegment(childRel)) continue
      let cst
      try {
        cst = statSync(childAbs)
      } catch {
        continue
      }
      if (cst.isDirectory()) walk(childAbs, childRel)
      else if (cst.isFile()) out.push({ abs: childAbs, rel: toPosix(childRel) })
    }
  }
  walk(absRoot, root)
  return out
}

export function collectZipFiles(
  basePath: string,
  paths: string[],
): { files: ZipFileEntry[]; zipName: string } {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw Object.assign(new Error('paths required'), { code: 'BAD_REQUEST' as const })
  }
  const roots = [...new Set(paths.map(normalizeDownloadPath).filter(Boolean))]
  if (roots.length === 0) {
    throw Object.assign(new Error('paths required'), { code: 'BAD_REQUEST' as const })
  }

  const sharedParent = commonParentDir(roots)
  const files: ZipFileEntry[] = []
  let totalBytes = 0
  const seen = new Set<string>()

  for (const root of roots) {
    const walked = walkDownloadRoot(basePath, root)
    for (const item of walked) {
      const name = zipEntryName(item.rel, sharedParent)
      if (!name || seen.has(name)) continue
      const data = new Uint8Array(readFileSync(item.abs))
      totalBytes += data.byteLength
      if (files.length + 1 > MAX_ZIP_ENTRIES) {
        throw Object.assign(new Error(`文件过多（最多 ${MAX_ZIP_ENTRIES} 个）`), { code: 'TOO_MANY' as const })
      }
      if (totalBytes > MAX_ZIP_BYTES) {
        throw Object.assign(new Error('体积过大（超过 2GB）'), { code: 'TOO_LARGE' as const })
      }
      seen.add(name)
      files.push({ name, data })
    }
  }

  if (files.length === 0) {
    throw Object.assign(new Error('没有可下载的文件'), { code: 'EMPTY' as const })
  }

  let zipName = 'download.zip'
  if (roots.length === 1) {
    zipName = `${basename(roots[0])}.zip`
  }

  return { files, zipName }
}

export function buildZipBuffer(files: ZipFileEntry[]): Uint8Array {
  const record: Record<string, Uint8Array> = {}
  for (const f of files) {
    record[f.name] = f.data
  }
  return zipSync(record, { level: 6 })
}
