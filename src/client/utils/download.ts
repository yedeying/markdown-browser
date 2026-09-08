/** Trigger browser file download from URL or Blob */

import { apiFetch, downloadUrl } from './fsApi.js'

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // revoke after click settles
  setTimeout(() => URL.revokeObjectURL(url), 2_000)
}

/** Single file via GET /api/download */
export function downloadSingleFile(path: string): void {
  const url = downloadUrl(path)
  const a = document.createElement('a')
  a.href = url
  a.download = path.split('/').pop() || 'file'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback
  const star = header.match(/filename\*=UTF-8''([^;]+)/i)
  if (star?.[1]) {
    try { return decodeURIComponent(star[1].trim()) } catch { /* ignore */ }
  }
  const plain = header.match(/filename="([^"]+)"/i) || header.match(/filename=([^;]+)/i)
  if (plain?.[1]) return plain[1].trim()
  return fallback
}

/** Multi-path zip via POST /api/download/zip */
export async function downloadPathsAsZip(paths: string[]): Promise<void> {
  const res = await apiFetch('/api/download/zip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths }),
  })
  if (!res.ok) {
    let msg = `下载失败 (${res.status})`
    try {
      const j = await res.json() as { error?: string }
      if (j.error) msg = j.error
    } catch { /* ignore */ }
    throw new Error(msg)
  }
  const blob = await res.blob()
  const name = filenameFromDisposition(res.headers.get('Content-Disposition'), 'download.zip')
  triggerBlobDownload(blob, name)
}

/**
 * Download one or many nodes: single regular file → direct link;
 * otherwise zip (folders recursive on server).
 */
export async function downloadNodes(
  nodes: Array<{ path: string; type: string }>,
): Promise<'single' | 'zip'> {
  if (nodes.length === 0) throw new Error('未选择文件')
  if (nodes.length === 1 && nodes[0].type === 'file') {
    downloadSingleFile(nodes[0].path)
    return 'single'
  }
  await downloadPathsAsZip(nodes.map(n => n.path))
  return 'zip'
}
