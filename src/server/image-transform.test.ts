import { describe, test, expect, beforeAll } from 'bun:test'
import sharp from 'sharp'
import { transformImage, parseAccept, pickOutputFormat, fmtForExt } from './image-transform.js'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, writeFileSync } from 'node:fs'

// --- 小工具：用一个 3x2 的已知 PNG 做测试输入 ---
let pngBuf: Buffer
let dir: string

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'vmd-img-'))
  pngBuf = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#336699' } })
    .png()
    .toBuffer()
  writeFileSync(join(dir, 'src.png'), pngBuf)
})

describe('parseAccept / pickOutputFormat', () => {
  test('pickOutputFormat: avif > webp > jpeg', () => {
    expect(pickOutputFormat('image/avif,image/webp,image/*')).toBe('avif')
    expect(pickOutputFormat('image/webp,image/apng,image/*')).toBe('webp')
    expect(pickOutputFormat('image/*,image/jpeg')).toBe('jpeg')
    expect(pickOutputFormat(undefined)).toBe('jpeg')
  })
  test('parseAccept 尊重 q=0 排除', () => {
    const parsed = parseAccept('image/webp;q=0,image/avif;q=0.8,image/*;q=0.5')
    const webp = parsed.find(p => p.type === 'image/webp')
    expect(webp?.q).toBe(0)
    expect(parsed[0].type).toBe('image/avif')
  })
})

describe('fmtForExt', () => {
  test('按扩展名确定目标格式', () => {
    expect(fmtForExt('.png', 'webp')).toBe('webp')
    expect(fmtForExt('.png', 'avif')).toBe('avif')
    expect(fmtForExt('.jpg', 'webp')).toBe('webp')
  })
})

describe('transformImage', () => {
  test('输出尺寸不超过 maxWidth（fit:inside 不放大小图）', async () => {
    const small = await sharp({ create: { width: 100, height: 50, channels: 3, background: '#111' } }).png().toBuffer()
    const { data, info } = await transformImage({ data: small, ext: '.png', fmt: 'webp', maxWidth: 1600 })
    expect(info.width).toBe(100) // 不放大
    expect(info.height).toBe(50)
    expect(data.length).toBeGreaterThan(0)
  })

  test('大图被缩放到 maxWidth', async () => {
    const { info } = await transformImage({ data: pngBuf, ext: '.png', fmt: 'jpeg', maxWidth: 400 })
    expect(info.width).toBe(400)
    expect(info.height).toBe(300)
  })

  test('输出 Content-Type 对应的编码（avif）', async () => {
    const { info, contentType } = await transformImage({ data: pngBuf, ext: '.png', fmt: 'avif' })
    expect(contentType).toBe('image/avif')
    expect(info.format).toBe('avif')
  })

  test('GIF 直通（不转码）', async () => {
    const gif = Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'binary')
    const { data, info, passthrough } = await transformImage({ data: gif, ext: '.gif', fmt: 'webp' })
    expect(passthrough).toBe(true)
    expect(info.format).toBe('gif')
    expect(data).toEqual(gif)
  })

  test('SVG 直通', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')
    const { data, passthrough } = await transformImage({ data: svg, ext: '.svg', fmt: 'webp' })
    expect(passthrough).toBe(true)
    expect(data).toEqual(svg)
  })

  test('缩放到指定 maxWidth 后仍可缓存', async () => {
    const r1 = await transformImage({ data: pngBuf, ext: '.png', fmt: 'webp', maxWidth: 600 })
    const r2 = await transformImage({ data: pngBuf, ext: '.png', fmt: 'webp', maxWidth: 600 })
    // 同参数两次调用应命中 LRU 缓存，字节一致
    expect(r2.data.equals(r1.data)).toBe(true)
    // 不同 maxWidth 结果不同（缓存键隔离）
    const r3 = await transformImage({ data: pngBuf, ext: '.png', fmt: 'webp', maxWidth: 300 })
    expect(r3.data.equals(r1.data)).toBe(false)
  })
})
