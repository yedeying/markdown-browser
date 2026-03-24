import { useEffect, useRef, useState } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'

export type ModalMode = 'rename' | 'mkdir' | 'touch' | 'confirm'

interface Props {
  open: boolean
  mode: ModalMode
  initialValue?: string         // rename 时预填旧名
  confirmMessage?: string       // confirm 模式下显示的文本
  onConfirm: (value: string) => void
  onCancel: () => void
}

const TITLES: Record<ModalMode, string> = {
  rename:  '重命名',
  mkdir:   '新建文件夹',
  touch:   '新建文件',
  confirm: '确认删除',
}

/** 特殊字符校验（不允许 / \ : * ? " < > | 和 .. ） */
function validateName(name: string): string {
  if (!name.trim()) return '名称不能为空'
  if (/[/\\:*?"<>|]/.test(name)) return '名称不能包含特殊字符 / \\ : * ? " < > |'
  if (name === '..' || name === '.') return '不允许该名称'
  return ''
}

const ContextModal: FunctionalComponent<Props> = ({
  open,
  mode,
  initialValue = '',
  confirmMessage,
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // 每次打开重置
  useEffect(() => {
    if (open) {
      setValue(initialValue)
      setError('')
      // 下一帧聚焦并选中文件名部分（不含扩展名）
      requestAnimationFrame(() => {
        const el = inputRef.current
        if (!el) return
        el.focus()
        if (mode === 'rename' && initialValue) {
          // 选中文件名，排除扩展名
          const dotIdx = initialValue.lastIndexOf('.')
          const end = dotIdx > 0 ? dotIdx : initialValue.length
          el.setSelectionRange(0, end)
        } else {
          el.select()
        }
      })
    }
  }, [open, initialValue, mode])

  const handleConfirm = () => {
    if (mode === 'confirm') {
      onConfirm('')
      return
    }
    const err = validateName(value)
    if (err) { setError(err); return }
    onConfirm(value.trim())
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleConfirm() }
    if (e.key === 'Escape') onCancel()
  }

  if (!open) return null

  const isConfirm = mode === 'confirm'

  return (
    <div class="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div class="modal-box">
        <div class="modal-title">{TITLES[mode]}</div>

        {isConfirm ? (
          <div class="modal-body">{confirmMessage || '确认要删除吗？此操作不可撤销。'}</div>
        ) : (
          <>
            <input
              ref={inputRef}
              class="modal-input"
              type="text"
              value={value}
              onInput={(e) => {
                setValue((e.target as HTMLInputElement).value)
                setError('')
              }}
              onKeyDown={handleKeyDown}
              placeholder={mode === 'mkdir' ? '文件夹名称' : '文件名称'}
            />
            <div class="modal-error">{error}</div>
          </>
        )}

        <div class="modal-actions">
          <button class="btn modal-btn-cancel" onClick={onCancel}>取消</button>
          {isConfirm ? (
            <button class="btn modal-btn-danger" onClick={handleConfirm}>删除</button>
          ) : (
            <button class="btn" style={{ background: 'var(--link)', color: '#fff', borderColor: 'var(--link)' }} onClick={handleConfirm}>
              确定
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ContextModal
