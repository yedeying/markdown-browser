import { useState, useEffect, useCallback } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'
import { apiFetch } from '../utils/fsApi.js'
import ThemeToggle from './ThemeToggle.js'

interface Mount {
  alias: string
  name: string
  path: string
  readonly?: boolean
}

interface AdminStatus {
  enabled: boolean
  loggedIn?: boolean
  workspace?: string
  configPath?: string
}

interface Props {
  theme: 'dark' | 'light'
  onThemeToggle: () => void
  adminEnabled: boolean
  onNavigateHome: () => void
}

const AdminPanel: FunctionalComponent<Props> = ({ theme, onThemeToggle, adminEnabled, onNavigateHome }) => {
  const [status, setStatus] = useState<AdminStatus | null>(null)
  const [mounts, setMounts] = useState<Mount[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // 登录
  const [pw, setPw] = useState('')
  const [loginError, setLoginError] = useState('')

  // 新增 / 编辑
  const [editing, setEditing] = useState<{ mode: 'add' | 'edit'; form: Mount } | null>(null)

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/status')
      const data = await res.json() as AdminStatus
      setStatus(data)
      return data
    } catch (e) {
      setError(String(e))
      return null
    }
  }, [])

  const refreshMounts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/admin/mounts')
      if (res.status === 401) {
        setStatus(s => s ? { ...s, loggedIn: false } : s)
        return
      }
      const data = await res.json() as { mounts: Mount[] }
      setMounts(data.mounts || [])
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    (async () => {
      const s = await refreshStatus()
      if (s?.loggedIn) await refreshMounts()
    })()
  }, [])

  const handleLogin = async (e: Event) => {
    e.preventDefault()
    setLoginError('')
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setLoginError(data.error || '登录失败')
        return
      }
      setPw('')
      await refreshStatus()
      await refreshMounts()
    } catch (e) {
      setLoginError(String(e))
    }
  }

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' })
    await refreshStatus()
    setMounts([])
  }

  const handleSave = async () => {
    if (!editing) return
    const { form, mode } = editing
    if (!form.alias.trim() || !form.path.trim()) {
      alert('alias 和 path 不能为空')
      return
    }
    const url = mode === 'add'
      ? '/api/admin/mounts'
      : `/api/admin/mounts/${form.alias}`
    const method = mode === 'add' ? 'POST' : 'PUT'
    const body = mode === 'add'
      ? { alias: form.alias.trim(), name: form.name.trim() || form.alias.trim(), path: form.path.trim(), readonly: !!form.readonly }
      : { name: form.name.trim() || form.alias, path: form.path.trim(), readonly: !!form.readonly }
    try {
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        alert(data.error || '保存失败')
        return
      }
      setEditing(null)
      await refreshMounts()
    } catch (e) {
      alert(String(e))
    }
  }

  const handleDelete = async (alias: string) => {
    if (!confirm(`确定删除挂载点 ${alias} 吗？（不会删除磁盘文件）`)) return
    try {
      const res = await apiFetch(`/api/admin/mounts/${alias}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        alert(data.error || '删除失败')
        return
      }
      await refreshMounts()
    } catch (e) {
      alert(String(e))
    }
  }

  // ============================================================
  // 渲染
  // ============================================================

  if (!adminEnabled) {
    return (
      <div class="admin-wrap">
        {renderHeader(onNavigateHome, theme, onThemeToggle, null, handleLogout)}
        <main class="admin-main">
          <div class="admin-empty">
            <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
            <h2>管理功能未启用</h2>
            <p>请在启动时设置管理员密码：</p>
            <pre style={{ textAlign: 'left' }}>{`vmd --workspace <dir> --admin-password <pw>
# 或
VMD_ADMIN_PASSWORD=<pw> vmd --workspace <dir>`}</pre>
          </div>
        </main>
        {styleBlock}
      </div>
    )
  }

  if (!status?.loggedIn) {
    return (
      <div class="admin-wrap">
        {renderHeader(onNavigateHome, theme, onThemeToggle, null, handleLogout)}
        <main class="admin-main">
          <form class="admin-login" onSubmit={handleLogin}>
            <h2>管理员登录</h2>
            <input
              type="password"
              placeholder="管理员密码"
              value={pw}
              autoFocus
              onInput={(e) => setPw((e.target as HTMLInputElement).value)}
            />
            {loginError && <div class="admin-err">{loginError}</div>}
            <button type="submit">登录</button>
          </form>
        </main>
        {styleBlock}
      </div>
    )
  }

  return (
    <div class="admin-wrap">
      {renderHeader(onNavigateHome, theme, onThemeToggle, status, handleLogout)}
      <main class="admin-main">
        <div class="admin-toolbar">
          <h2>挂载点管理</h2>
          <button class="admin-primary" onClick={() => setEditing({ mode: 'add', form: { alias: '', name: '', path: '', readonly: false } })}>
            + 添加挂载点
          </button>
        </div>

        {error && <div class="admin-err">{error}</div>}

        {loading ? (
          <div class="admin-loading">加载中…</div>
        ) : mounts.length === 0 ? (
          <div class="admin-empty">
            <p>还没有挂载点，点击「添加挂载点」开始配置</p>
          </div>
        ) : (
          <table class="admin-table">
            <thead>
              <tr>
                <th>别名 (alias)</th>
                <th>显示名</th>
                <th>路径</th>
                <th>属性</th>
                <th style={{ width: 160 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {mounts.map(m => (
                <tr key={m.alias}>
                  <td><code>{m.alias}</code></td>
                  <td>{m.name}</td>
                  <td><code class="admin-path">{m.path}</code></td>
                  <td>{m.readonly ? '只读' : '可写'}</td>
                  <td>
                    <button class="admin-link" onClick={() => window.open(`/m/${m.alias}/`, '_blank')}>访问</button>
                    <button class="admin-link" onClick={() => setEditing({ mode: 'edit', form: { ...m } })}>编辑</button>
                    <button class="admin-link admin-danger" onClick={() => handleDelete(m.alias)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {status?.workspace && (
          <div class="admin-footer">
            <div><b>工作区：</b><code>{status.workspace}</code></div>
            <div><b>配置文件：</b><code>{status.configPath}</code></div>
          </div>
        )}
      </main>

      {editing && (
        <div class="admin-modal-bg" onClick={() => setEditing(null)}>
          <div class="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editing.mode === 'add' ? '添加挂载点' : `编辑：${editing.form.alias}`}</h3>
            <label>别名 (URL 标识，字母/数字/_/-)</label>
            <input
              type="text"
              value={editing.form.alias}
              disabled={editing.mode === 'edit'}
              onInput={(e) => setEditing({ ...editing, form: { ...editing.form, alias: (e.target as HTMLInputElement).value } })}
            />
            <label>显示名</label>
            <input
              type="text"
              value={editing.form.name}
              placeholder="留空则同别名"
              onInput={(e) => setEditing({ ...editing, form: { ...editing.form, name: (e.target as HTMLInputElement).value } })}
            />
            <label>路径（绝对路径或相对于工作区）</label>
            <input
              type="text"
              value={editing.form.path}
              placeholder={status?.workspace ? `例如：${status.workspace}/notes 或 notes` : ''}
              onInput={(e) => setEditing({ ...editing, form: { ...editing.form, path: (e.target as HTMLInputElement).value } })}
            />
            <label class="admin-checkbox">
              <input
                type="checkbox"
                checked={!!editing.form.readonly}
                onChange={(e) => setEditing({ ...editing, form: { ...editing.form, readonly: (e.target as HTMLInputElement).checked } })}
              />
              只读（暂未在文件操作层严格强制，仅作提示）
            </label>
            <div class="admin-modal-actions">
              <button onClick={() => setEditing(null)}>取消</button>
              <button class="admin-primary" onClick={handleSave}>保存</button>
            </div>
          </div>
        </div>
      )}

      {styleBlock}
    </div>
  )
}

function renderHeader(
  onNavigateHome: () => void,
  theme: 'dark' | 'light',
  onThemeToggle: () => void,
  status: AdminStatus | null,
  onLogout: () => void,
) {
  return (
    <header class="admin-header">
      <div class="admin-title">
        <span style={{ fontSize: '20px' }}>⚙</span>
        <span>vmd 管理后台</span>
      </div>
      <div class="admin-actions">
        <button class="admin-btn" onClick={onNavigateHome}>🏠 首页</button>
        {status?.loggedIn && <button class="admin-btn" onClick={onLogout}>退出登录</button>}
        <ThemeToggle theme={theme} onToggle={onThemeToggle} />
      </div>
    </header>
  )
}

const styleBlock = (
  <style>{`
    .admin-wrap { min-height: 100vh; display: flex; flex-direction: column; background: var(--bg); color: var(--text); }
    .admin-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 20px; border-bottom: 1px solid var(--border); background: var(--header-bg);
    }
    .admin-title { display: flex; align-items: center; gap: 10px; font-weight: 600; }
    .admin-actions { display: flex; align-items: center; gap: 10px; }
    .admin-btn {
      padding: 6px 12px; font-size: 13px; border: 1px solid var(--border);
      border-radius: 6px; background: var(--bg-card); color: var(--text); cursor: pointer;
    }
    .admin-btn:hover { background: var(--bg-hover, rgba(0,0,0,0.05)); }
    .admin-main { flex: 1; padding: 20px; max-width: 1100px; width: 100%; margin: 0 auto; }
    .admin-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .admin-toolbar h2 { font-size: 18px; margin: 0; }
    .admin-primary {
      padding: 8px 14px; font-size: 13px; border: none; border-radius: 6px;
      background: var(--accent, #3b82f6); color: #fff; cursor: pointer;
    }
    .admin-primary:hover { opacity: 0.9; }
    .admin-table { width: 100%; border-collapse: collapse; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    .admin-table th, .admin-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--border); font-size: 13px; }
    .admin-table th { background: var(--bg); font-weight: 600; }
    .admin-table tr:last-child td { border-bottom: none; }
    .admin-table code { font-size: 12px; background: var(--bg); padding: 2px 6px; border-radius: 3px; }
    .admin-path { word-break: break-all; }
    .admin-link {
      padding: 4px 8px; margin-right: 4px; font-size: 12px;
      border: none; background: transparent; color: var(--accent, #3b82f6); cursor: pointer; border-radius: 3px;
    }
    .admin-link:hover { background: var(--bg-hover, rgba(0,0,0,0.06)); }
    .admin-link.admin-danger { color: #ef4444; }
    .admin-err {
      margin: 12px 0; padding: 10px 12px; background: rgba(239,68,68,0.1);
      border-left: 3px solid #ef4444; border-radius: 4px; font-size: 13px;
    }
    .admin-loading, .admin-empty { text-align: center; padding: 40px; color: var(--text-muted); }
    .admin-footer { margin-top: 20px; padding: 12px; font-size: 12px; color: var(--text-muted); background: var(--bg-card); border-radius: 6px; border: 1px solid var(--border); }
    .admin-footer div { margin: 4px 0; }
    .admin-login {
      max-width: 360px; margin: 60px auto; display: flex; flex-direction: column; gap: 12px;
      padding: 24px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px;
    }
    .admin-login h2 { text-align: center; font-size: 18px; margin: 0 0 4px; }
    .admin-login input {
      padding: 9px 12px; font-size: 14px; border: 1px solid var(--border); border-radius: 6px;
      background: var(--bg); color: var(--text); outline: none;
    }
    .admin-login input:focus { border-color: var(--accent, #3b82f6); }
    .admin-login button {
      padding: 10px; border: none; border-radius: 6px; background: var(--accent, #3b82f6); color: #fff; cursor: pointer; font-size: 14px;
    }
    .admin-modal-bg {
      position: fixed; inset: 0; background: rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center; z-index: 500;
    }
    .admin-modal {
      width: 90%; max-width: 520px; background: var(--bg);
      border: 1px solid var(--border); border-radius: 10px;
      padding: 20px; display: flex; flex-direction: column; gap: 8px;
    }
    .admin-modal h3 { margin: 0 0 8px; font-size: 16px; }
    .admin-modal label { font-size: 12px; color: var(--text-muted); margin-top: 8px; }
    .admin-modal input[type="text"] {
      padding: 8px 10px; font-size: 13px; border: 1px solid var(--border); border-radius: 6px;
      background: var(--bg-card); color: var(--text); outline: none;
    }
    .admin-modal input[type="text"]:focus { border-color: var(--accent, #3b82f6); }
    .admin-modal input[type="text"]:disabled { opacity: 0.6; }
    .admin-checkbox { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin-top: 10px; }
    .admin-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
    .admin-modal-actions button {
      padding: 7px 14px; font-size: 13px; border: 1px solid var(--border);
      border-radius: 6px; background: var(--bg-card); color: var(--text); cursor: pointer;
    }
    .admin-modal-actions .admin-primary { border: none; background: var(--accent, #3b82f6); color: #fff; }
  `}</style>
)

export default AdminPanel
