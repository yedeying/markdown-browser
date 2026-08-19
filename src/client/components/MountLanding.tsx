import type { FunctionalComponent } from 'preact'
import ThemeToggle from './ThemeToggle.js'
import Icon from './ui/Icon.js'

interface Mount {
  alias: string
  name: string
}

interface Props {
  mounts: Mount[]
  theme: 'dark' | 'light'
  onThemeToggle: () => void
  onOpenAdmin: () => void
  errorMsg?: string
}

const MountLanding: FunctionalComponent<Props> = ({
  mounts,
  theme,
  onThemeToggle,
  onOpenAdmin,
  errorMsg,
}) => {
  return (
    <div class="landing-wrap">
      <header class="landing-header">
        <div class="landing-title">
          <Icon name="book" size={20} aria-hidden="true" />
          <span>Markdown Browser</span>
        </div>
        <div class="landing-actions">
          <button class="landing-btn" onClick={onOpenAdmin}>
            <Icon name="settings" size={14} aria-hidden="true" />
            管理挂载点
          </button>
          <ThemeToggle theme={theme} onToggle={onThemeToggle} />
        </div>
      </header>

      {errorMsg && <div class="landing-error">{errorMsg}</div>}

      <main class="landing-main">
        {mounts.length === 0 ? (
          <div class="landing-empty">
            <div class="landing-empty-icon">
              <Icon name="folder" size={40} aria-hidden="true" />
            </div>
            <h2>暂无挂载点</h2>
            <p>点击右上角「管理挂载点」，添加第一个目录开始使用</p>
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
                <div class="landing-card-icon">
                  <Icon name="folder" size={26} aria-hidden="true" />
                </div>
                <div class="landing-card-body">
                  <div class="landing-card-name">{m.name}</div>
                  <div class="landing-card-alias">/m/{m.alias}</div>
                </div>
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default MountLanding
