import type { FunctionalComponent } from 'preact'
import ThemeToggle from './ThemeToggle.js'

interface Mount {
  alias: string
  name: string
}

interface Props {
  mounts: Mount[]
  adminEnabled: boolean
  theme: 'dark' | 'light'
  onThemeToggle: () => void
  onOpenAdmin: () => void
  errorMsg?: string
}

const MountLanding: FunctionalComponent<Props> = ({
  mounts,
  adminEnabled,
  theme,
  onThemeToggle,
  onOpenAdmin,
  errorMsg,
}) => {
  return (
    <div class="landing-wrap">
      <header class="landing-header">
        <div class="landing-title">
          <span style={{ fontSize: '22px' }}>📚</span>
          <span>vmd Markdown 工作区</span>
        </div>
        <div class="landing-actions">
          <button class="landing-btn" onClick={onOpenAdmin}>
            {adminEnabled ? '⚙ 管理挂载点' : '⚙ 管理（未启用）'}
          </button>
          <ThemeToggle theme={theme} onToggle={onThemeToggle} />
        </div>
      </header>

      {errorMsg && <div class="landing-error">{errorMsg}</div>}

      <main class="landing-main">
        {mounts.length === 0 ? (
          <div class="landing-empty">
            <div class="landing-empty-icon">📂</div>
            <h2>暂无挂载点</h2>
            <p>
              {adminEnabled
                ? '点击右上角「管理挂载点」，添加第一个目录开始使用'
                : '管理功能未启用，请在启动命令中设置 --admin-password 或环境变量 VMD_ADMIN_PASSWORD'}
            </p>
          </div>
        ) : (
          <div class="landing-grid">
            {mounts.map(m => (
              <a
                key={m.alias}
                href={`/m/${m.alias}/`}
                class="landing-card"
                onClick={(e) => {
                  // SPA 导航（避免整页刷新丢失主题等）
                  if (e.metaKey || e.ctrlKey || e.shiftKey) return
                  e.preventDefault()
                  window.location.href = `/m/${m.alias}/`
                }}
              >
                <div class="landing-card-icon">📁</div>
                <div class="landing-card-body">
                  <div class="landing-card-name">{m.name}</div>
                  <div class="landing-card-alias">/m/{m.alias}</div>
                </div>
              </a>
            ))}
          </div>
        )}
      </main>

      <style>{`
        .landing-wrap {
          min-height: 100vh;
          background: var(--bg);
          color: var(--text);
          display: flex;
          flex-direction: column;
        }
        .landing-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 24px;
          border-bottom: 1px solid var(--border);
          background: var(--header-bg);
        }
        .landing-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 16px;
          font-weight: 600;
        }
        .landing-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .landing-btn {
          padding: 6px 14px;
          font-size: 13px;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--bg-card);
          color: var(--text);
          cursor: pointer;
          transition: background 0.15s;
        }
        .landing-btn:hover { background: var(--bg-hover, rgba(0,0,0,0.05)); }
        .landing-error {
          margin: 16px 24px;
          padding: 10px 14px;
          background: rgba(239, 68, 68, 0.1);
          border-left: 3px solid #ef4444;
          border-radius: 4px;
          font-size: 13px;
        }
        .landing-main {
          flex: 1;
          padding: 24px;
          max-width: 1100px;
          width: 100%;
          margin: 0 auto;
        }
        .landing-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 14px;
        }
        .landing-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--bg-card);
          color: var(--text);
          text-decoration: none;
          transition: border-color 0.15s, transform 0.1s, box-shadow 0.15s;
        }
        .landing-card:hover {
          border-color: var(--accent, #3b82f6);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
        }
        .landing-card-icon {
          font-size: 28px;
          line-height: 1;
        }
        .landing-card-body {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }
        .landing-card-name {
          font-weight: 600;
          font-size: 14px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .landing-card-alias {
          font-size: 12px;
          color: var(--text-muted);
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .landing-empty {
          text-align: center;
          padding: 64px 24px;
          color: var(--text-muted);
        }
        .landing-empty-icon { font-size: 48px; margin-bottom: 16px; }
        .landing-empty h2 { font-size: 18px; margin-bottom: 8px; color: var(--text); }
        .landing-empty p { font-size: 14px; max-width: 480px; margin: 0 auto; line-height: 1.6; }
      `}</style>
    </div>
  )
}

export default MountLanding
