import type { FunctionalComponent } from 'preact'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { usePref } from '../hooks/usePref.js'
import { useTheme } from '../hooks/useTheme.js'
import { apiFetch } from '../utils/fsApi.js'
import {
  resetLocalPrefs,
  type AccentPref,
  type EditorFontSizePref,
  type FolderViewPref,
  type ReadingFontSizePref,
  type ReadingLineHeightPref,
  type ReadingWidthPref,
  type SortField,
  type SortOrder,
} from '../utils/prefs.js'
import type { AdminSettings, StartupMode } from '../../types.js'
import Icon from './ui/Icon.js'

interface Props {
  onClose: () => void
  /** 多挂载模式下当前所在挂载点，用作切回单目录时的默认选择 */
  currentMountAlias?: string
  /**
   * 是否显示启动挂载模式。分享链接的访客没有管理权限，
   * 也不该看到宿主机上的挂载点路径。
   */
  mountConfigurable?: boolean
}

const ACCENTS: Array<{ value: Exclude<AccentPref, 'custom'>; label: string; color: string }> = [
  { value: 'orange', label: '橙', color: '#ff7b47' },
  { value: 'blue', label: '蓝', color: '#58a6ff' },
  { value: 'cyan', label: '青', color: '#39c5cf' },
  { value: 'green', label: '绿', color: '#3fb950' },
  { value: 'purple', label: '紫', color: '#a371f7' },
  { value: 'rose', label: '玫红', color: '#f778ba' },
]

const SettingsDialog: FunctionalComponent<Props> = ({ onClose, currentMountAlias, mountConfigurable = true }) => {
  const { selectedTheme, setTheme } = useTheme()
  const [accent, setAccent] = usePref('accent')
  const [accentCustom, setAccentCustom] = usePref('accentCustom')
  const [readingWidth, setReadingWidth] = usePref('readingWidth')
  const [readingFontSize, setReadingFontSize] = usePref('readingFontSize')
  const [readingLineHeight, setReadingLineHeight] = usePref('readingLineHeight')
  const [folderView, setFolderView] = usePref('folderView')
  const [sort, setSort] = usePref('sort')
  const [showHidden, setShowHidden] = usePref('showHidden')
  const [editorFontSize, setEditorFontSize] = usePref('editorFontSize')
  const [confirmReset, setConfirmReset] = useState(false)
  const settingsDialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const resetButtonRef = useRef<HTMLButtonElement>(null)
  const cancelResetRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null
    requestAnimationFrame(() => closeRef.current?.focus())
    return () => previousFocusRef.current?.focus()
  }, [])

  useEffect(() => {
    if (confirmReset) requestAnimationFrame(() => cancelResetRef.current?.focus())
  }, [confirmReset])

  useLayoutEffect(() => {
    const dialog = settingsDialogRef.current
    if (confirmReset) dialog?.setAttribute('inert', '')
    else dialog?.removeAttribute('inert')
  }, [confirmReset])

  const dismissResetConfirmation = () => {
    setConfirmReset(false)
    requestAnimationFrame(() => resetButtonRef.current?.focus())
  }

  useLayoutEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (confirmReset) dismissResetConfirmation()
        else onClose()
        return
      }
      if (event.key !== 'Tab') return

      const dialog = confirmReset
        ? cancelResetRef.current?.closest('[role="alertdialog"]')
        : closeRef.current?.closest('[role="dialog"]')
      const focusable = dialog?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [confirmReset, onClose])

  const handleReset = () => {
    resetLocalPrefs()
    window.location.reload()
  }

  return (
    <div
      class="dialog-overlay settings-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget && !confirmReset) onClose()
      }}
    >
      <section
        ref={settingsDialogRef}
        class="dialog-box settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        aria-hidden={confirmReset || undefined}
      >
        <div class="dialog-header">
          <h2 class="dialog-title" id="settings-title">设置</h2>
          <button ref={closeRef} class="dialog-close" onClick={onClose} aria-label="关闭设置">
            <Icon name="x" size={18} aria-hidden="true" />
          </button>
        </div>

        <div class="dialog-body settings-body">
          <fieldset class="settings-group">
            <legend>外观</legend>
            <div class="settings-row">
              <span class="settings-label">主题</span>
              <div class="settings-options">
                {([
                  ['dark', '深色'],
                  ['light', '浅色'],
                  ['system', '跟随系统'],
                ] as const).map(([value, label]) => (
                  <label class="settings-choice" key={value}>
                    <input
                      type="radio"
                      name="settings-theme"
                      value={value}
                      checked={selectedTheme === value}
                      onChange={() => setTheme(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div class="settings-row settings-row-stack">
              <span class="settings-label">氛围色</span>
              <div class="settings-swatches">
                {ACCENTS.map(({ value, label, color }) => (
                  <label class={`settings-swatch${accent === value ? ' active' : ''}`} key={value}>
                    <input
                      type="radio"
                      name="settings-accent"
                      value={value}
                      checked={accent === value}
                      onChange={() => setAccent(value)}
                    />
                    <span class="settings-swatch-color" style={{ background: color }} />
                    <span>{label}</span>
                  </label>
                ))}
                <label class={`settings-swatch${accent === 'custom' ? ' active' : ''}`}>
                  <input
                    type="radio"
                    name="settings-accent"
                    value="custom"
                    checked={accent === 'custom'}
                    onChange={() => setAccent('custom')}
                  />
                  <span class="settings-swatch-color settings-swatch-custom" style={{ background: accentCustom }} />
                  <span>自定义</span>
                </label>
                <label class="settings-color-input">
                  <span>自定义颜色</span>
                  <input
                    type="color"
                    value={accentCustom}
                    onInput={(event) => {
                      setAccentCustom(event.currentTarget.value)
                      setAccent('custom')
                    }}
                  />
                </label>
              </div>
            </div>
          </fieldset>

          <fieldset class="settings-group">
            <legend>阅读</legend>
            <label class="settings-row">
              <span class="settings-label">内容宽度</span>
              <select
                value={String(readingWidth)}
                onChange={(event) => setReadingWidth(
                  event.currentTarget.value === 'full'
                    ? 'full'
                    : Number(event.currentTarget.value) as ReadingWidthPref,
                )}
              >
                <option value="720">720px</option>
                <option value="900">900px</option>
                <option value="1140">1140px</option>
                <option value="full">不限</option>
              </select>
            </label>
            <label class="settings-row">
              <span class="settings-label">正文字号</span>
              <select
                value={String(readingFontSize)}
                onChange={(event) => setReadingFontSize(Number(event.currentTarget.value) as ReadingFontSizePref)}
              >
                {[14, 15, 16, 17].map((size) => <option value={size} key={size}>{size}px</option>)}
              </select>
            </label>
            <label class="settings-row">
              <span class="settings-label">行高</span>
              <select
                value={String(readingLineHeight)}
                onChange={(event) => setReadingLineHeight(Number(event.currentTarget.value) as ReadingLineHeightPref)}
              >
                {[1.55, 1.7, 1.9].map((height) => <option value={height} key={height}>{height}</option>)}
              </select>
            </label>
          </fieldset>

          <fieldset class="settings-group">
            <legend>文件浏览</legend>
            <label class="settings-row">
              <span class="settings-label">默认视图</span>
              <select
                value={folderView}
                onChange={(event) => setFolderView(event.currentTarget.value as FolderViewPref)}
              >
                <option value="list">列表</option>
                <option value="grid">网格</option>
                <option value="column">分栏</option>
                <option value="masonry">瀑布流</option>
              </select>
            </label>
            <div class="settings-row">
              <span class="settings-label">默认排序</span>
              <div class="settings-inline-selects">
                <select
                  aria-label="排序字段"
                  value={sort.field}
                  onChange={(event) => setSort({ ...sort, field: event.currentTarget.value as SortField })}
                >
                  <option value="name">名称</option>
                  <option value="type">类型</option>
                  <option value="size">大小</option>
                </select>
                <select
                  aria-label="排序方向"
                  value={sort.order}
                  onChange={(event) => setSort({ ...sort, order: event.currentTarget.value as SortOrder })}
                >
                  <option value="asc">升序</option>
                  <option value="desc">降序</option>
                </select>
              </div>
            </div>
            <label class="settings-row settings-toggle">
              <span class="settings-label">显示隐藏文件</span>
              <input
                type="checkbox"
                checked={showHidden}
                onChange={(event) => setShowHidden(event.currentTarget.checked)}
              />
            </label>
          </fieldset>

          <fieldset class="settings-group">
            <legend>编辑器</legend>
            <label class="settings-row">
              <span class="settings-label">字号</span>
              <select
                value={String(editorFontSize)}
                onChange={(event) => setEditorFontSize(Number(event.currentTarget.value) as EditorFontSizePref)}
              >
                {[13, 14, 15].map((size) => <option value={size} key={size}>{size}px</option>)}
              </select>
            </label>
          </fieldset>

          {mountConfigurable && <MountModeSection currentMountAlias={currentMountAlias} />}

          <div class="settings-footer">
            <button ref={resetButtonRef} class="btn btn-danger" type="button" onClick={() => setConfirmReset(true)}>
              重置本地偏好
            </button>
          </div>
        </div>
      </section>

      {confirmReset && (
        <section
          class="modal-box settings-reset-confirm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="settings-reset-title"
          aria-describedby="settings-reset-description"
        >
          <h2 class="modal-title" id="settings-reset-title">确认重置本地偏好</h2>
          <p class="modal-body" id="settings-reset-description">
            这会清除本地外观和浏览偏好并刷新页面，不会更改服务端配置。
          </p>
          <div class="modal-actions">
            <button ref={cancelResetRef} class="btn modal-btn-cancel" onClick={dismissResetConfirmation}>取消</button>
            <button class="btn modal-btn-danger" onClick={handleReset}>确认重置</button>
          </div>
        </section>
      )}
    </div>
  )
}

// ============================================================
// 启动挂载模式（服务端配置，保存后需重启）
// ============================================================

const MODE_LABEL: Record<StartupMode, string> = { dir: '单目录', multi: '多挂载' }

/** 默认选中的启动挂载点：已保存的目标 → 当前所在挂载点 → 第一个 */
function defaultAlias(settings: AdminSettings, currentMountAlias?: string): string {
  const has = (a?: string) => !!a && settings.mounts.some(m => m.alias === a)
  if (has(settings.singleMountAlias)) return settings.singleMountAlias!
  if (has(currentMountAlias)) return currentMountAlias!
  return settings.mounts[0]?.alias ?? ''
}

const MountModeSection: FunctionalComponent<{ currentMountAlias?: string }> = ({ currentMountAlias }) => {
  const [settings, setSettings] = useState<AdminSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [targetMode, setTargetMode] = useState<StartupMode>('dir')
  const [alias, setAlias] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedMode, setSavedMode] = useState<StartupMode | null>(null)

  const adopt = useCallback((data: AdminSettings) => {
    setSettings(data)
    setTargetMode(data.startupMode)
    setAlias(defaultAlias(data, currentMountAlias))
  }, [currentMountAlias])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await apiFetch('/api/admin/settings')
      if (res.status === 401) {
        setLoadError('需要登录后才能查看启动挂载模式')
        return
      }
      if (!res.ok) {
        setLoadError(`读取启动挂载模式失败（${res.status}）`)
        return
      }
      adopt(await res.json() as AdminSettings)
    } catch {
      setLoadError('读取启动挂载模式失败，请检查服务连接')
    } finally {
      setLoading(false)
    }
  }, [adopt])

  // 打开对话框时读取一次。读接口不会创建或修改配置文件。
  useEffect(() => { void load() }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    setSavedMode(null)
    try {
      const res = await apiFetch('/api/admin/mount-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startupMode: targetMode,
          ...(targetMode === 'dir' ? { singleMountAlias: alias } : {}),
        }),
      })
      const data = await res.json().catch(() => null) as { ok?: boolean; error?: string } | null
      if (res.status === 401) {
        setSaveError('需要登录后才能修改启动挂载模式')
        return
      }
      if (!res.ok || !data?.ok) {
        setSaveError(data?.error || `保存失败（${res.status}）`)
        return
      }
      setSavedMode(targetMode)
      // 读回服务端实际写下的内容（新登记的挂载点、被沿用的 alias）
      try {
        const fresh = await apiFetch('/api/admin/settings')
        if (fresh.ok) adopt(await fresh.json() as AdminSettings)
      } catch { /* 保存已成功，刷新失败不影响结论 */ }
    } catch {
      setSaveError('保存失败，请检查服务连接')
    } finally {
      setSaving(false)
    }
  }

  const clearFeedback = () => {
    setSavedMode(null)
    setSaveError(null)
  }

  if (loading || loadError || !settings) {
    return (
      <fieldset class="settings-group settings-mount">
        <legend>挂载</legend>
        {loading
          ? <p class="settings-note" data-testid="mount-mode-loading">读取启动挂载模式…</p>
          : (
            <p class="settings-note settings-note-error" role="alert" data-testid="mount-mode-error">
              {loadError}
              <button class="btn settings-note-action" type="button" onClick={() => void load()}>重试</button>
            </p>
          )}
      </fieldset>
    )
  }

  const noMounts = settings.mounts.length === 0
  const canSave = !saving && (targetMode === 'multi' || !!alias)

  return (
    <fieldset class="settings-group settings-mount">
      <legend>挂载</legend>

      <div class="settings-row">
        <span class="settings-label">当前运行</span>
        <span data-testid="mount-mode-current">{MODE_LABEL[settings.mode]}模式</span>
      </div>

      <div class="settings-row">
        <span class="settings-label">启动模式</span>
        <div class="settings-options">
          {(['dir', 'multi'] as const).map((value) => (
            <label class="settings-choice" key={value}>
              <input
                type="radio"
                name="settings-startup-mode"
                value={value}
                checked={targetMode === value}
                onChange={() => { setTargetMode(value); clearFeedback() }}
              />
              {MODE_LABEL[value]}
            </label>
          ))}
        </div>
      </div>

      {targetMode === 'dir' && (
        noMounts ? (
          <p class="settings-note" data-testid="mount-mode-no-mounts">
            还没有可用的挂载点。先切换到多挂载模式并重启服务，添加挂载点后才能指定单目录启动。
          </p>
        ) : (
          <label class="settings-row">
            <span class="settings-label">启动挂载点</span>
            <select
              data-testid="mount-mode-alias"
              value={alias}
              onChange={(event) => { setAlias(event.currentTarget.value); clearFeedback() }}
            >
              {settings.mounts.map((m) => (
                <option value={m.alias} key={m.alias}>{m.name}（{m.alias}）</option>
              ))}
            </select>
          </label>
        )
      )}

      {targetMode === 'multi' && settings.mode === 'dir' && (
        <p class="settings-note" data-testid="mount-mode-promote-hint">
          当前目录 <code>{settings.root}</code> 会被登记为首个挂载点。
        </p>
      )}

      {!settings.startupModePersisted && (
        <p class="settings-note settings-note-dim">
          配置里还没有启动模式，当前形态来自命令行参数。
        </p>
      )}
      <p class="settings-note settings-note-dim">配置文件：<code>{settings.configPath}</code></p>

      <div class="settings-actions">
        <button
          class="btn btn-primary"
          type="button"
          data-testid="mount-mode-save"
          disabled={!canSave}
          onClick={() => void handleSave()}
        >
          {saving ? '保存中…' : '保存挂载模式'}
        </button>
      </div>

      {saveError && (
        <p class="settings-note settings-note-error" role="alert" data-testid="mount-mode-error">{saveError}</p>
      )}
      {savedMode && (
        <p class="settings-note settings-note-ok" role="status" data-testid="mount-mode-saved">
          已保存为{MODE_LABEL[savedMode]}模式，重启服务后生效。
        </p>
      )}
    </fieldset>
  )
}

export default SettingsDialog
