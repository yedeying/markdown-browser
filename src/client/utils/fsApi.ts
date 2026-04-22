/** 前端文件管理 API 封装 */

type FsResult<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

// 通过 unknown 中转以兼容 App.tsx 里的 declare global interface Window 声明
type VmdWindow = Window & {
  __VMD_MODE__?: 'dir' | 'single' | 'multi'
  __VMD_SHARE_TOKEN__?: string
  __VMD_CURRENT_MOUNT__?: string
}

function w(): VmdWindow {
  return window as unknown as VmdWindow
}

/** 分享模式下的 API 前缀，例如 /share/abc123 */
export function getSharePrefix(): string {
  const token = w().__VMD_SHARE_TOKEN__
  return token ? `/share/${token}` : ''
}

/** 多挂载模式下的路径前缀，例如 /m/work */
export function getMountPrefix(): string {
  const win = w()
  if (win.__VMD_MODE__ === 'multi' && win.__VMD_CURRENT_MOUNT__) {
    return `/m/${win.__VMD_CURRENT_MOUNT__}`
  }
  return ''
}

/**
 * 综合前缀：
 * - 分享模式优先（分享链接不属于任何挂载点）
 * - 多挂载模式使用 /m/<alias>
 * - 单文件/单目录模式无前缀
 *
 * 注：管理 API（/api/admin/*, /api/mounts）不走挂载前缀
 */
export function getApiPrefix(url: string): string {
  const share = getSharePrefix()
  if (share) return share
  if (
    url.startsWith('/api/admin/') ||
    url === '/api/admin/status' ||
    url === '/api/mounts'
  ) return ''
  return getMountPrefix()
}

/** fetch 封装：遇到 401 自动跳转登录页；自动加前缀 */
export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const prefix = getApiPrefix(url)
  const fullUrl = prefix && url.startsWith('/api/') ? prefix + url : url
  const res = await fetch(fullUrl, init)
  if (res.status === 401) {
    const code = res.headers.get('x-auth-code')
    // 管理员 401 不跳转，让前端表单处理
    if (code === 'ADMIN_AUTH_REQUIRED' || url.startsWith('/api/admin/')) {
      return res
    }
    window.location.href = `/login?returnTo=${encodeURIComponent(window.location.href)}`
    return new Promise(() => {})
  }
  return res
}

/** 生成静态资源 URL（img src / video src 等，不经过 fetch 封装） */
export function assetUrl(path: string): string {
  const share = getSharePrefix()
  if (share) return `${share}/api/asset/${encodeURI(path)}`
  const mount = getMountPrefix()
  return `${mount}/api/asset/${encodeURI(path)}`
}

/** 生成下载 URL */
export function downloadUrl(path: string): string {
  const share = getSharePrefix()
  if (share) return `${share}/api/download/${encodeURI(path)}`
  const mount = getMountPrefix()
  return `${mount}/api/download/${encodeURI(path)}`
}

/** 生成 SSE watch URL */
export function watchUrl(): string {
  const prefix = getMountPrefix()
  return `${prefix}/api/watch`
}

async function post<T = Record<string, unknown>>(url: string, body: unknown): Promise<FsResult<T>> {
  try {
    const res = await apiFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return await res.json() as FsResult<T>
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

async function del<T = Record<string, unknown>>(url: string, body: unknown): Promise<FsResult<T>> {
  try {
    const res = await apiFetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return await res.json() as FsResult<T>
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export const fsApi = {
  /** 删除文件或文件夹（支持批量） */
  delete: (paths: string[]) =>
    del<{ deleted: number }>('/api/fs/delete', { paths }),

  /** 重命名（newName 为新的文件名，不含路径） */
  rename: (path: string, newName: string) =>
    post<{ newPath: string }>('/api/fs/rename', { path, newName }),

  /** 移动到目标目录 */
  move: (paths: string[], dest: string) =>
    post<{ moved: number }>('/api/fs/move', { paths, dest }),

  /** 复制到目标目录（重名自动追加后缀） */
  copy: (paths: string[], dest: string) =>
    post<{ copied: number }>('/api/fs/copy', { paths, dest }),

  /** 创建文件夹 */
  mkdir: (path: string) =>
    post('/api/fs/mkdir', { path }),

  /** 创建空文件 */
  touch: (path: string) =>
    post('/api/fs/touch', { path }),

  /** 创建分享链接 */
  createShare: (path: string, type: 'file' | 'folder', ttl: number | null) =>
    post<{ token: string; url: string }>('/api/share', { path, type, ttl }),

  /** 删除分享 */
  deleteShare: (token: string) =>
    del('/api/share/' + token, {}),
}
