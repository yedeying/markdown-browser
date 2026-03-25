/** 前端文件管理 API 封装 */

type FsResult<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

/** 分享模式下的 API 前缀，例如 /share/abc123 */
export function getSharePrefix(): string {
  const token = (window as Window & { __VMD_SHARE_TOKEN__?: string }).__VMD_SHARE_TOKEN__
  return token ? `/share/${token}` : ''
}

/** fetch 封装：遇到 401 自动跳转登录页；分享模式自动加前缀 */
export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const prefix = getSharePrefix()
  const fullUrl = prefix && url.startsWith('/api/') ? prefix + url : url
  const res = await fetch(fullUrl, init)
  if (res.status === 401) {
    window.location.href = `/login?returnTo=${encodeURIComponent(window.location.href)}`
    // 返回一个永不 resolve 的 Promise，避免后续代码继续执行
    return new Promise(() => {})
  }
  return res
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
