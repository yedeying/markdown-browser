/**
 * 视频封面：浏览器对 HEVC/MOV 常截出黑帧，改为服务端取帧。
 * 优先 macOS qlmanage（系统自带），其次 PATH 里的 ffmpeg。
 */
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { spawn } from 'node:child_process'
import sharp from 'sharp'

export type VideoPosterResult = {
  data: Buffer
  contentType: string
  width: number
  height: number
}

type CacheEntry = { data: Buffer; contentType: string; width: number; height: number; mtimeMs: number }

const MAX_CACHE = 64
const cache = new Map<string, CacheEntry>()

function cacheGet(key: string, mtimeMs: number): CacheEntry | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (hit.mtimeMs !== mtimeMs) {
    cache.delete(key)
    return null
  }
  // LRU touch
  cache.delete(key)
  cache.set(key, hit)
  return hit
}

function cacheSet(key: string, entry: CacheEntry): void {
  if (cache.has(key)) cache.delete(key)
  cache.set(key, entry)
  while (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

function runCmd(
  cmd: string,
  args: string[],
  signal?: AbortSignal,
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    const onAbort = () => {
      child.kill('SIGTERM')
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    child.on('error', (err) => {
      signal?.removeEventListener('abort', onAbort)
      reject(err)
    })
    child.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort)
      resolve({ code: code ?? 1, stderr })
    })
  })
}

async function viaQlmanage(
  filePath: string,
  size: number,
  signal?: AbortSignal,
): Promise<Buffer | null> {
  if (process.platform !== 'darwin') return null
  const dir = await mkdtemp(join(tmpdir(), 'vmd-poster-'))
  try {
    const { code } = await runCmd('qlmanage', ['-t', '-s', String(size), '-o', dir, filePath], signal)
    if (code !== 0) return null
    const outName = `${basename(filePath)}.png`
    const outPath = join(dir, outName)
    try {
      return await readFile(outPath)
    } catch {
      // qlmanage 有时用完整路径改名；扫目录取首个 png
      const { readdirSync } = await import('node:fs')
      const png = readdirSync(dir).find((n) => n.toLowerCase().endsWith('.png'))
      if (!png) return null
      return await readFile(join(dir, png))
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

async function viaFfmpeg(
  filePath: string,
  size: number,
  signal?: AbortSignal,
): Promise<Buffer | null> {
  const dir = await mkdtemp(join(tmpdir(), 'vmd-poster-ff-'))
  const outPath = join(dir, 'poster.jpg')
  try {
    const { code } = await runCmd(
      'ffmpeg',
      [
        '-y',
        '-ss', '1',
        '-i', filePath,
        '-frames:v', '1',
        '-vf', `scale=${size}:-2`,
        '-q:v', '3',
        outPath,
      ],
      signal,
    )
    if (code !== 0) return null
    return await readFile(outPath)
  } catch {
    return null
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * 生成视频封面（webp）。无可用工具时返回 null。
 */
export async function extractVideoPoster(
  filePath: string,
  opts?: { maxWidth?: number; signal?: AbortSignal },
): Promise<VideoPosterResult | null> {
  const maxWidth = Math.max(64, Math.min(opts?.maxWidth ?? 400, 1280))
  const st = await stat(filePath)
  const key = `${filePath}|${maxWidth}`
  const hit = cacheGet(key, st.mtimeMs)
  if (hit) {
    return {
      data: hit.data,
      contentType: hit.contentType,
      width: hit.width,
      height: hit.height,
    }
  }

  let raw =
    (await viaQlmanage(filePath, maxWidth, opts?.signal))
    ?? (await viaFfmpeg(filePath, maxWidth, opts?.signal))
  if (!raw) return null

  const pipeline = sharp(raw).rotate().resize({
    width: maxWidth,
    height: maxWidth,
    fit: 'inside',
    withoutEnlargement: true,
  })
  const { data, info } = await pipeline.webp({ quality: 72 }).toBuffer({ resolveWithObject: true })
  const entry: CacheEntry = {
    data,
    contentType: 'image/webp',
    width: info.width,
    height: info.height,
    mtimeMs: st.mtimeMs,
  }
  cacheSet(key, entry)
  return {
    data: entry.data,
    contentType: entry.contentType,
    width: entry.width,
    height: entry.height,
  }
}

/** 测试用：清空封面缓存 */
export function clearVideoPosterCache(): void {
  cache.clear()
}
