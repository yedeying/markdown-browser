import { useState, useRef, useEffect } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'

interface Mount {
  alias: string
  name: string
}

interface Props {
  currentAlias: string
  mounts: Mount[]
}

/**
 * 多挂载模式下显示在 sidebar 顶部的切换器
 * 点击后弹出其他挂载点 + 返回首页 + 管理入口
 */
const MountSelector: FunctionalComponent<Props> = ({ currentAlias, mounts }) => {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const cur = mounts.find(m => m.alias === currentAlias)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const go = (url: string) => {
    window.location.href = url
  }

  return (
    <div class="mount-selector" ref={menuRef}>
      <button class="mount-selector-btn" onClick={() => setOpen(o => !o)}>
        <span class="ms-icon">🗂</span>
        <span class="ms-name">{cur?.name || currentAlias}</span>
        <span class="ms-chev">▾</span>
      </button>
      {open && (
        <div class="mount-selector-menu">
          <div class="ms-section-title">切换挂载点</div>
          {mounts.map(m => (
            <button
              key={m.alias}
              class={`ms-item ${m.alias === currentAlias ? 'active' : ''}`}
              onClick={() => { if (m.alias !== currentAlias) go(`/m/${m.alias}/`) }}
            >
              <span class="ms-item-icon">📁</span>
              <span class="ms-item-body">
                <span class="ms-item-name">{m.name}</span>
                <span class="ms-item-alias">/m/{m.alias}</span>
              </span>
              {m.alias === currentAlias && <span class="ms-check">✓</span>}
            </button>
          ))}
          <div class="ms-divider" />
          <button class="ms-item" onClick={() => go('/')}>
            <span class="ms-item-icon">🏠</span>
            <span class="ms-item-body"><span class="ms-item-name">返回首页</span></span>
          </button>
          <button class="ms-item" onClick={() => go('/admin')}>
            <span class="ms-item-icon">⚙</span>
            <span class="ms-item-body">
              <span class="ms-item-name">管理挂载点</span>
            </span>
          </button>
        </div>
      )}
      <style>{`
        .mount-selector { position: relative; width: 100%; }
        .mount-selector-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 6px 8px;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--bg-card);
          color: var(--text);
          cursor: pointer;
          font-size: 12px;
        }
        .mount-selector-btn:hover { background: var(--bg-hover, rgba(0,0,0,0.05)); }
        .ms-icon { font-size: 14px; }
        .ms-name {
          flex: 1;
          text-align: left;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ms-chev { font-size: 10px; opacity: 0.7; }
        .mount-selector-menu {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 8px;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
          z-index: 100;
          padding: 4px;
          max-height: 60vh;
          overflow: auto;
        }
        .ms-section-title {
          font-size: 11px;
          color: var(--text-muted);
          padding: 6px 8px 4px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .ms-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 6px 8px;
          border: none;
          background: transparent;
          color: var(--text);
          cursor: pointer;
          border-radius: 4px;
          font-size: 13px;
          text-align: left;
        }
        .ms-item:hover { background: var(--bg-hover, rgba(0,0,0,0.06)); }
        .ms-item.active { background: var(--accent-bg, rgba(59, 130, 246, 0.1)); }
        .ms-item-icon { font-size: 14px; }
        .ms-item-body { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .ms-item-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ms-item-alias { font-size: 11px; color: var(--text-muted); font-family: ui-monospace, monospace; }
        .ms-check { color: var(--accent, #3b82f6); font-weight: bold; }
        .ms-divider { height: 1px; background: var(--border); margin: 4px 0; }
      `}</style>
    </div>
  )
}

export default MountSelector
