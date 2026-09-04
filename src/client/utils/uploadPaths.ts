/** Upload path helpers — join / normalize / rename suggestions */

/** Normalize relative path: `/` separators, no leading slash, reject `..` */
export function normalizeRelPath(raw: string): string | null {
  const n = raw.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
  if (!n) return null
  const parts = n.split('/')
  if (parts.some(p => p === '..' || p === '.')) return null
  return parts.join('/')
}

/** Join target directory with a file-relative path from picker/drop */
export function joinUploadPath(targetDir: string, relative: string): string | null {
  const rel = normalizeRelPath(relative)
  if (!rel) return null
  const base = normalizeRelPath(targetDir) ?? ''
  // empty base = mount root
  if (!base) return rel
  return `${base}/${rel}`
}

/** Suggest `name (n).ext` until `exists` returns false */
export function suggestRename(relPath: string, exists: (p: string) => boolean): string {
  const n = normalizeRelPath(relPath) || relPath
  const slash = n.lastIndexOf('/')
  const dir = slash >= 0 ? n.slice(0, slash) : ''
  const base = slash >= 0 ? n.slice(slash + 1) : n
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  const ext = dot > 0 ? base.slice(dot) : ''
  let i = 1
  while (i < 10000) {
    const name = `${stem} (${i})${ext}`
    const candidate = dir ? `${dir}/${name}` : name
    if (!exists(candidate)) return candidate
    i++
  }
  throw new Error('无法生成可用文件名')
}

export interface PickedFile {
  relativePath: string
  file: File
}

/** Collect files from `<input type="file">` (incl. webkitdirectory) */
export function filesFromInput(list: FileList | null): PickedFile[] {
  if (!list) return []
  const out: PickedFile[] = []
  for (let i = 0; i < list.length; i++) {
    const file = list[i]
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    const path = normalizeRelPath(rel)
    if (path) out.push({ relativePath: path, file })
  }
  return out
}

/** Imperative file picker — avoids Preact stripping nonstandard attributes */
function pickViaHiddenInput(directory: boolean): Promise<PickedFile[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    if (directory) {
      // Must set before click(); JSX/Preact often drops these attrs
      input.setAttribute('webkitdirectory', '')
      input.setAttribute('directory', '')
      ;(input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true
    }
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    input.style.top = '0'
    input.style.opacity = '0'

    let settled = false
    const finish = (files: PickedFile[]) => {
      if (settled) return
      settled = true
      input.remove()
      resolve(files)
    }

    input.addEventListener('change', () => finish(filesFromInput(input.files)))
    input.addEventListener('cancel', () => finish([]))

    document.body.appendChild(input)
    input.click()
  })
}

type DirHandle = FileSystemDirectoryHandle & {
  entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>
  values?: () => AsyncIterableIterator<FileSystemHandle>
}

async function filesFromDirectoryHandle(
  handle: DirHandle,
  prefix: string,
): Promise<PickedFile[]> {
  const out: PickedFile[] = []
  // Prefer entries(); fall back to values()
  if (typeof handle.entries === 'function') {
    for await (const [name, entry] of handle.entries()) {
      const relBase = prefix ? `${prefix}/${name}` : name
      if (entry.kind === 'file') {
        const file = await (entry as FileSystemFileHandle).getFile()
        const rel = normalizeRelPath(relBase)
        if (rel) out.push({ relativePath: rel, file })
      } else if (entry.kind === 'directory') {
        out.push(...await filesFromDirectoryHandle(entry as DirHandle, relBase))
      }
    }
    return out
  }
  return out
}

/** Open OS file picker (multi-select) */
export function pickUploadFiles(): Promise<PickedFile[]> {
  return pickViaHiddenInput(false)
}

/**
 * Open OS folder picker.
 * Uses showDirectoryPicker when available (true folder UX), else webkitdirectory input.
 * Must be called directly from a user gesture (no rAF/setTimeout).
 */
export async function pickUploadDirectory(): Promise<PickedFile[]> {
  const w = window as Window & {
    showDirectoryPicker?: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>
  }
  // Chromium / Safari 17+：原生文件夹选择器
  if (typeof w.showDirectoryPicker === 'function') {
    try {
      const handle = await w.showDirectoryPicker({ mode: 'read' })
      return await filesFromDirectoryHandle(handle as DirHandle, handle.name)
    } catch (e) {
      // 用户取消或手势被拒 — 不要再 fallback（await 后已丢失 user activation）
      if (e instanceof DOMException && (e.name === 'AbortError' || e.name === 'NotAllowedError')) {
        return []
      }
      console.warn('[vmd] showDirectoryPicker failed', e)
      return []
    }
  }
  // Firefox 等：同步创建带 webkitdirectory 的 input
  return pickViaHiddenInput(true)
}

/** Recursively collect from drag-and-drop FileSystemEntry tree */
export async function filesFromDataTransfer(dt: DataTransfer): Promise<PickedFile[]> {
  const items = dt.items
  if (!items?.length) {
    // fallback: flat files
    return filesFromInput(dt.files)
  }

  const entries: FileSystemEntry[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null
    if (entry) entries.push(entry)
  }
  if (entries.length === 0) return filesFromInput(dt.files)

  const out: PickedFile[] = []
  for (const entry of entries) {
    await walkEntry(entry, '', out)
  }
  return out
}

async function walkEntry(entry: FileSystemEntry, prefix: string, out: PickedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      ;(entry as FileSystemFileEntry).file(resolve, reject)
    })
    const rel = normalizeRelPath(prefix ? `${prefix}/${entry.name}` : entry.name)
    if (rel) out.push({ relativePath: rel, file })
    return
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    const children = await readAllEntries(reader)
    const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name
    for (const child of children) {
      await walkEntry(child, nextPrefix, out)
    }
  }
}

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = []
    const pump = () => {
      reader.readEntries(
        batch => {
          if (!batch.length) {
            resolve(all)
            return
          }
          all.push(...batch)
          pump()
        },
        reject,
      )
    }
    pump()
  })
}
