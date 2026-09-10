import sharp from 'sharp'

/**
 * 图片转码：把本地 PNG/JPG/WebP 按客户端能力输出为 AVIF/WebP/JPEG，
 * 并按需缩放。目标：
 *  1. 传输体积大幅下降（AVIF/WebP 比 PNG 小一个数量级）→ 网络快
 *  2. 解码快（AVIF/WebP 更省 CPU，且缩放后像素少）→ 首屏快
 *
 * 设计约束：
 *  - 所有决定都必须由 URL 唯一确定（?fmt=&w= 等显式参数进 URL），
 *    不能只靠 Accept 协商决定缓存内容，否则免费版 Cloudflare 没有
 *    Vary 支持会把不同客户端的变体互相污染。做法：Accept 只决定
 *    默认格式，显式 ?fmt= 可覆盖；缩放只认 ?w=。
 *  - GIF（动图）与 SVG（矢量/脚本）直通不转码。
 *  - 小图不放大（fit: inside）。
 */

/** 可输出的目标格式 */
export type OutputFormat = 'avif' | 'webp' | 'jpeg'

/** 由 Accept 解析出的格式项 */
export interface AcceptEntry { type: string; q: number }

export const JPEG_MIME = 'image/jpeg'
export const WEBP_MIME = 'image/webp'
export const AVIF_MIME = 'image/avif'

/** 请求头 Accept 里浏览器常见的图片格式（带通配） */
const IMAGE_TYPES = new Set(['image/avif', 'image/webp', 'image/jpeg', 'image/png', 'image/*', '*/*'])

/** 允许显式指定的输出格式（?fmt=） */
export const ALLOWED_FMT = new Set(['avif', 'webp', 'jpeg', 'png'])

/** 服务端在「仅指定 fmt、未指定 w」或必须转码格式（HEIC）时的缩放上限 */
export const DEFAULT_MAX_WIDTH = 1600

/** LRU 缓存大小：命中内存内的转码结果，避免重复解码风暴 */
const MAX_CACHE_ENTRIES = 96

/** 并发转码上限：超过即排队，防止一次打开几百张图把 CPU/内存打爆 */
export const TRANSFORM_MAX_CONCURRENCY = 3

// ---------------------------------------------------------------------------
// 解析
// ---------------------------------------------------------------------------

/** 解析 Accept 头为 [{type, q}]，q 缺失按 1，按 q 降序；q=0 表示明确不要 */
export function parseAccept(header: string | undefined): AcceptEntry[] {
  if (!header) return []
  const entries: AcceptEntry[] = []
  for (const part of header.split(',')) {
    const segs = part.trim().split(';')
    const type = segs[0].trim().toLowerCase()
    if (!type) continue
    let q = 1
    for (let i = 1; i < segs.length; i++) {
      const m = segs[i].trim().match(/^q\s*=\s*([0-9.]+)$/i)
      if (m) {
        const v = parseFloat(m[1])
        if (!Number.isNaN(v)) q = v
      }
    }
    entries.push({ type, q })
  }
  return entries.sort((a, b) => b.q - a.q)
}

/**
 * 根据 Accept 选择默认输出格式：avif > webp > jpeg。
 * 仅当该类型被显式接受（q>0）且客户端声明支持时才选中。
 */
export function pickOutputFormat(acceptHeader: string | undefined): OutputFormat {
  const parsed = parseAccept(acceptHeader)
  const wanted = parsed.filter(e => e.q > 0)
  // 按声明顺序偏好 avif > webp > jpeg；通配符 (*/*, image/*) 表示“任意都行”
  const accepts = (t: string) => wanted.some(e => e.type === t)
  const acceptsAny = accepts('*/*') || accepts('image/*')
  if (accepts('image/avif')) return 'avif'
  if (accepts('image/webp')) return 'webp'
  // 明确只要 jpeg（或既无 avif/webp 也无通配）→ jpeg
  if (accepts('image/jpeg') || !acceptsAny) return 'jpeg'
  // 有通配且没点名 avif/webp：现代客户端都在前面点名了；保守给 webp
  return 'webp'
}

/** 显式 ?fmt= 参数（宽松校验，非法回落默认格式） */
export function normalizeFmtParam(raw: string | undefined): OutputFormat | null {
  if (!raw) return null
  const v = raw.toLowerCase()
  if (v === 'avif') return 'avif'
  if (v === 'webp') return 'webp'
  if (v === 'jpeg' || v === 'jpg') return 'jpeg'
  return null
}

/** 缩放宽度参数：0 / 非法 → 不缩放；上限防御（像素放大毫无意义） */
export function normalizeWidthParam(raw: string | undefined): number {
  if (!raw) return 0
  const v = Math.round(Number(raw))
  if (!Number.isFinite(v) || v <= 0) return 0
  return Math.min(v, 4096)
}

/** 按源文件扩展名决定是否能/是否应转码 */
export function isTranscodable(ext: string): boolean {
  const e = ext.toLowerCase()
  return (
    e === '.png' || e === '.jpg' || e === '.jpeg' || e === '.webp' ||
    e === '.heic' || e === '.heif'
  )
}

/** 浏览器无法可靠显示，展示路径必须转码（即使无 ?w= / ?fmt=） */
export function mustTranscodeForBrowser(ext: string): boolean {
  const e = ext.toLowerCase()
  return e === '.heic' || e === '.heif'
}

/** 按源扩展名 + 目标格式确定编码（.jpg 只降级 jpeg，不做 avif/webp） */
export function fmtForExt(ext: string, requested: OutputFormat): OutputFormat {
  const e = ext.toLowerCase()
  if (e === '.jpg' || e === '.jpeg') {
    // 源是 JPEG，只有显式要 avif/webp 才转，否则保持 jpeg（无损有损再转只是浪费）
    return requested === 'avif' || requested === 'webp' ? requested : 'jpeg'
  }
  return requested
}

// ---------------------------------------------------------------------------
// 缓存与并发
// ---------------------------------------------------------------------------

interface TransformOptions {
  data: Buffer
  ext: string
  /** 目标格式（已按 fmtForExt 归一） */
  fmt: OutputFormat
  /** 缩放上限，0 = 不缩放 */
  maxWidth?: number
  /** 源文件 mtime，用于缓存键失效 */
  mtimeMs?: number
  /** 客户端断开 / 取消时跳过排队与转码 */
  signal?: AbortSignal
}

export interface TransformResult {
  data: Buffer
  contentType: string
  /** 是否直通原字节（GIF/SVG/不可识别） */
  passthrough: boolean
  info: { width: number; height: number; format: string }
}

const mimeFor = (fmt: OutputFormat): string =>
  fmt === 'avif' ? AVIF_MIME : fmt === 'webp' ? WEBP_MIME : JPEG_MIME

/** 简单的 LRU：Map 插入序即访问序 */
class LRU {
  private map = new Map<string, Buffer>()
  constructor(private max: number) {}
  get(key: string): Buffer | undefined {
    const v = this.map.get(key)
    if (v === undefined) return undefined
    // 重新插入以更新访问序
    this.map.delete(key)
    this.map.set(key, v)
    return v
  }
  set(key: string, value: Buffer): void {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, value)
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
  }
}

const cache = new LRU(MAX_CACHE_ENTRIES)

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
}

/** 并发池：同时最多 TRANSFORM_MAX_CONCURRENCY 个任务；排队中可被 AbortSignal 取消 */
let inFlight = 0
const queue: Array<() => void> = []

export async function withConcurrency<T>(
  task: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  throwIfAborted(signal)

  if (inFlight >= TRANSFORM_MAX_CONCURRENCY) {
    await new Promise<void>((resolve, reject) => {
      const entry = () => {
        cleanup()
        resolve()
      }
      const onAbort = () => {
        const idx = queue.indexOf(entry)
        if (idx >= 0) queue.splice(idx, 1)
        cleanup()
        reject(new DOMException('Aborted', 'AbortError'))
      }
      const cleanup = () => signal?.removeEventListener('abort', onAbort)
      queue.push(entry)
      signal?.addEventListener('abort', onAbort, { once: true })
      // 竞态：加入队列前已 abort
      if (signal?.aborted) onAbort()
    })
  }

  throwIfAborted(signal)
  inFlight++
  try {
    throwIfAborted(signal)
    return await task()
  } finally {
    inFlight--
    queue.shift()?.()
  }
}

/**
 * 转码入口。passthrough=true 表示原样返回（GIF/SVG/不支持扩展名）。
 * 失败时抛错由路由层回落（返回原图）。
 */
export async function transformImage(opts: TransformOptions): Promise<TransformResult> {
  const ext = opts.ext.toLowerCase()
  if (!isTranscodable(ext)) {
    // 非可转码图片（gif/svg/pdf/zip…）一律直通
    return passthroughResult(opts.data, ext)
  }

  const fmt = fmtForExt(ext, opts.fmt)
  const maxWidth = opts.maxWidth ?? 0
  const cacheKey = [
    ext,
    fmt,
    maxWidth,
    opts.mtimeMs ?? 0,
    // 数据指纹只取长度 + 头尾几字节，够用于缓存键（同文件内容通常长度一致）
    opts.data.length,
    opts.data.subarray(0, 32).toString('hex'),
    opts.data.subarray(-32).toString('hex'),
  ].join('|')

  const cached = cache.get(cacheKey)
  if (cached) {
    return { data: cached, contentType: mimeFor(fmt), passthrough: false, info: { width: 0, height: 0, format: fmt } }
  }

  return withConcurrency(async () => {
    throwIfAborted(opts.signal)
    try {
      const img = sharp(opts.data)
      const meta = await img.metadata()
      let width = meta.width ?? 0
      let height = meta.height ?? 0
      if (meta.format === 'svg') {
        // sharp 能读 SVG，但这里仍直通（避免执行不可信向量）
        const passthrough = passthroughResult(opts.data, ext)
        passthrough.info.format = 'svg'
        return passthrough
      }
      if (meta.format === 'gif') {
        const passthrough = passthroughResult(opts.data, ext)
        passthrough.info.format = 'gif'
        return passthrough
      }

      if (maxWidth > 0 && width > maxWidth) {
        img.resize({ width: maxWidth, withoutEnlargement: true, fit: 'inside' })
      }

      let out: Buffer
      if (fmt === 'avif') {
        // 缩略图用低 effort，避免瀑布流并发时 AVIF 把连接池拖死
        const effort = maxWidth > 0 && maxWidth <= 800 ? 2 : 4
        out = await img.avif({ quality: 60, effort }).toBuffer()
      } else if (fmt === 'webp') {
        out = await img.webp({ quality: maxWidth > 0 && maxWidth <= 800 ? 72 : 80 }).toBuffer()
      } else {
        out = await img.jpeg({ quality: 80, mozjpeg: true }).toBuffer()
      }
      const outMeta = await sharp(out).metadata()
      cache.set(cacheKey, out)
      return {
        data: out,
        contentType: mimeFor(fmt),
        passthrough: false,
        info: { width: outMeta.width ?? width, height: outMeta.height ?? height, format: fmt },
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      // 解码失败（损坏/不支持）→ 直通原字节，由客户端决定
      return passthroughResult(opts.data, ext)
    }
  }, opts.signal)
}

function passthroughResult(data: Buffer, ext: string): TransformResult {
  const mime: Record<string, string> = {
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
  }
  return {
    data,
    contentType: mime[ext] ?? 'application/octet-stream',
    passthrough: true,
    info: { width: 0, height: 0, format: ext.replace('.', '') },
  }
}

// ---------------------------------------------------------------------------
// 辅助：判断是否是应直通但不该转码的格式（供路由层快速短路，无需读字节）
// ---------------------------------------------------------------------------

/** 这些扩展名永远直通（动图/矢量/文档），不进转码路径 */
export const NON_TRANSCODABLE_IMAGE_EXTS = new Set(['.gif', '.svg', '.ico', '.bmp', '.avif'])

