/**
 * 将文件字节解码为预览用文本。
 * 顺序：BOM → 严格 UTF-8 → gb18030/gbk（若运行时支持）→ UTF-8 替换 → latin1。
 * 含大量 NUL 的内容仍返回字符串，由客户端 isBinaryContent 拦截。
 */
export function decodeTextBuffer(buf: Buffer): string {
  if (buf.length === 0) return ''

  // UTF-8 BOM
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString('utf-8')
  }
  // UTF-16 LE BOM
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.subarray(2).toString('utf-16le')
  }
  // UTF-16 BE BOM
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.alloc(buf.length - 2)
    for (let i = 2; i + 1 < buf.length; i += 2) {
      swapped[i - 2] = buf[i + 1]
      swapped[i - 1] = buf[i]
    }
    return swapped.toString('utf-16le')
  }

  // 严格 UTF-8
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    // continue
  }

  // 常见中文编码（Bun / 部分 Node 支持）
  for (const enc of ['gb18030', 'gbk', 'shift_jis', 'euc-jp', 'big5'] as const) {
    try {
      return new TextDecoder(enc, { fatal: true }).decode(buf)
    } catch {
      // try next
    }
  }

  // 宽松 UTF-8（替换非法序列）
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(buf)
  } catch {
    // continue
  }

  // 最后回落：单字节保留全部数据，避免抛错
  return buf.toString('latin1')
}
