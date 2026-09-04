import { useEffect, useState } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'
import Icon from './ui/Icon.js'
import {
  uploadManager,
  type UploadTask,
} from '../utils/uploadManager.js'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function statusLabel(t: UploadTask): string {
  switch (t.status) {
    case 'queued': return '等待中'
    case 'uploading': return `${Math.round(t.progress * 100)}%`
    case 'done': return '完成'
    case 'error': return t.error || '失败'
    case 'cancelled': return '已取消'
    case 'skipped': return '已跳过'
  }
}

const UploadStatusPanel: FunctionalComponent = () => {
  const [tasks, setTasks] = useState<UploadTask[]>(() => uploadManager.getTasks())
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    return uploadManager.subscribe(() => {
      setTasks([...uploadManager.getTasks()])
    })
  }, [])

  if (tasks.length === 0) return null

  const summary = uploadManager.getSummary()
  const active = summary.uploading + summary.queued
  const pct = summary.bytesTotal > 0
    ? Math.round((summary.bytesDone / summary.bytesTotal) * 100)
    : 0

  let headline = ''
  if (active > 0) {
    headline = `上传中 ${summary.done + summary.skipped}/${summary.total} · ${pct}%`
  } else if (summary.failed > 0) {
    headline = `${summary.failed} 失败`
  } else {
    headline = `已完成 ${summary.done}/${summary.total}`
  }

  return (
    <div
      class={`upload-status-panel ${expanded ? 'expanded' : 'collapsed'}`}
      data-testid="upload-status-panel"
    >
      <div
        class="upload-status-bar"
        onClick={() => setExpanded(e => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setExpanded(x => !x)
          }
        }}
      >
        <span class="upload-status-summary">{headline}</span>
        <span class="upload-status-actions" onClick={(e) => e.stopPropagation()}>
          {active === 0 && (
            <button
              class="btn upload-status-icon-btn"
              title="清除已完成"
              onClick={() => uploadManager.clearFinished()}
            >
              清除
            </button>
          )}
          <button
            class="btn upload-status-icon-btn"
            title={expanded ? '收起' : '展开'}
            onClick={() => setExpanded(e => !e)}
          >
            <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={14} aria-hidden="true" />
          </button>
        </span>
      </div>
      {expanded && (
        <ul class="upload-status-list">
          {tasks.map(t => (
            <li key={t.id} class={`upload-status-item status-${t.status}`}>
              <div class="upload-status-name" title={t.relativePath}>
                {t.relativePath}
              </div>
              <div class="upload-status-meta">
                <span>{formatBytes(t.size)}</span>
                <span>{statusLabel(t)}</span>
              </div>
              {t.status === 'uploading' && (
                <div class="upload-status-progress">
                  <div class="upload-status-progress-fill" style={{ width: `${Math.round(t.progress * 100)}%` }} />
                </div>
              )}
              <div class="upload-status-item-actions">
                {(t.status === 'error' || t.status === 'cancelled') && (
                  <button class="btn" onClick={() => uploadManager.retry(t.id)}>重试</button>
                )}
                {(t.status === 'queued' || t.status === 'uploading') && (
                  <button class="btn" onClick={() => uploadManager.cancel(t.id)}>取消</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default UploadStatusPanel
