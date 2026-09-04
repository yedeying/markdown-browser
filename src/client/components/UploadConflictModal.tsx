import { useEffect, useState } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'
import type { ConflictDecision } from '../utils/uploadManager.js'
import { suggestRename } from '../utils/uploadPaths.js'

interface Props {
  path: string
  fileName: string
  onResolve: (decision: ConflictDecision) => void
}

const UploadConflictModal: FunctionalComponent<Props> = ({ path, fileName, onResolve }) => {
  const [applyAll, setApplyAll] = useState(false)
  const [renameValue, setRenameValue] = useState(() =>
    suggestRename(path, () => false).split('/').pop() || fileName,
  )

  useEffect(() => {
    setApplyAll(false)
    setRenameValue(suggestRename(path, () => false).split('/').pop() || fileName)
  }, [path, fileName])

  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''

  return (
    <div class="modal-overlay" data-testid="upload-conflict-modal">
      <div class="modal-box" style={{ maxWidth: 420 }}>
        <div class="modal-title">文件已存在</div>
        <div class="modal-body">
          <div style={{ wordBreak: 'break-all', marginBottom: 8 }}>{path}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>选择如何处理冲突：</div>
        </div>
        <label class="upload-conflict-apply">
          <input
            type="checkbox"
            checked={applyAll}
            onChange={(e) => setApplyAll((e.target as HTMLInputElement).checked)}
          />
          应用到其余冲突
        </label>
        <div class="modal-actions" style={{ flexWrap: 'wrap', justifyContent: 'stretch' }}>
          <button
            class="btn modal-btn-cancel"
            data-testid="upload-conflict-skip"
            onClick={() => onResolve({ action: 'skip', applyAll })}
          >
            跳过
          </button>
          <button
            class="btn"
            data-testid="upload-conflict-overwrite"
            onClick={() => onResolve({ action: 'overwrite', applyAll })}
          >
            覆盖
          </button>
          <button
            class="btn btn-primary"
            data-testid="upload-conflict-rename"
            onClick={() => {
              const name = renameValue.trim() || fileName
              const renameTo = dir ? `${dir}/${name}` : name
              onResolve({ action: 'rename', renameTo, applyAll })
            }}
          >
            重命名
          </button>
        </div>
        <input
          class="modal-input"
          style={{ marginTop: 12 }}
          value={renameValue}
          onInput={(e) => setRenameValue((e.target as HTMLInputElement).value)}
          placeholder="新文件名"
          aria-label="重命名为"
        />
      </div>
    </div>
  )
}

export default UploadConflictModal
