import { useState, useEffect, useRef } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'
import type { FileNode } from '../../types.js'
import { getFileType, getEditorLang } from '../utils/fileType.js'
import { useLongPress } from '../hooks/useLongPress.js'
import MarkdownPreview from './MarkdownPreview.js'
import Editor from './Editor.js'
import { apiFetch } from '../utils/fsApi.js'

function getNodeIcon(node: FileNode): string {
  if (node.type === 'folder') return '📁'
  switch (getFileType(node.name)) {
    case 'markdown': return '📝'
    case 'image':    return '🖼'
    case 'video':    return '🎬'
    case 'code':     return '📄'
    case 'text':     return '📃'
    default:         return '📎'
  }
}

interface PreviewState {
  node: FileNode
  content: string | null
  loading: boolean
  error: string | null
}

interface Props {
  rootNode: FileNode
  tree: FileNode[]
  onFileSelect: (node: FileNode) => void
  theme: 'dark' | 'light'
  onContextMenu: (node: FileNode, e: MouseEvent) => void
  onLongPress: (node: FileNode) => void
}

const FolderColumnView: FunctionalComponent<Props> = ({
  rootNode,
  tree,
  onFileSelect,
  theme,
  onContextMenu,
  onLongPress,
}) => {
  const [columnStack, setColumnStack] = useState<FileNode[]>([rootNode])
  const [selectedInCol, setSelectedInCol] = useState<Record<number, string>>({})
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // 根节点切换时重置
  useEffect(() => {
    setColumnStack([rootNode])
    setSelectedInCol({})
    setPreview(null)
  }, [rootNode.path])

  const makeLongPress = useLongPress<FileNode>({ onLongPress })

  // 加载预览内容
  const loadPreview = async (node: FileNode) => {
    const ft = getFileType(node.name)
    // 图片/视频不需要 fetch 内容
    if (ft === 'image' || ft === 'video' || ft === 'unsupported') {
      setPreview({ node, content: null, loading: false, error: null })
      return
    }
    setPreview({ node, content: null, loading: true, error: null })
    try {
      const res = await apiFetch(`/api/file/${encodeURI(node.path)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      setPreview({ node, content: text, loading: false, error: null })
    } catch (e) {
      setPreview({ node, content: null, loading: false, error: String(e) })
    }
  }

  const handleRowClick = (node: FileNode, colIndex: number) => {
    if (node.type === 'folder') {
      setColumnStack(prev => [...prev.slice(0, colIndex + 1), node])
      setSelectedInCol(prev => ({ ...prev, [colIndex]: node.path }))
      setPreview(null)
      setTimeout(() => {
        if (wrapRef.current) {
          wrapRef.current.scrollLeft = wrapRef.current.scrollWidth
        }
      }, 50)
    } else {
      setSelectedInCol(prev => ({ ...prev, [colIndex]: node.path }))
      setColumnStack(prev => prev.slice(0, colIndex + 1))
      // 只加载预览，不触发外层跳转
      loadPreview(node)
      // 滚动到最右（预览列）
      setTimeout(() => {
        if (wrapRef.current) {
          wrapRef.current.scrollLeft = wrapRef.current.scrollWidth
        }
      }, 50)
    }
  }

  const renderPreviewContent = (p: PreviewState) => {
    const ft = getFileType(p.node.name)

    if (p.loading) {
      return (
        <div class="col-preview-placeholder">
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>加载中...</span>
        </div>
      )
    }

    if (p.error) {
      return (
        <div class="col-preview-placeholder">
          <span style={{ color: 'var(--danger)', fontSize: '13px' }}>加载失败</span>
        </div>
      )
    }

    if (ft === 'image') {
      return (
        <div class="col-preview-image">
          <img
            src={`/api/asset/${encodeURIComponent(p.node.path)}`}
            alt={p.node.name}
          />
        </div>
      )
    }

    if (ft === 'markdown' && p.content !== null) {
      return (
        <div class="col-preview-markdown">
          <MarkdownPreview markdown={p.content} filePath={p.node.path} />
        </div>
      )
    }

    if ((ft === 'code' || ft === 'text') && p.content !== null) {
      return (
        <div class="col-preview-code">
          <Editor
            value={p.content}
            theme={theme}
            readOnly={true}
            language={getEditorLang(p.node.name)}
          />
        </div>
      )
    }

    // 不支持预览
    return (
      <div class="col-preview-placeholder">
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>{getNodeIcon(p.node)}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{p.node.name}</div>
        {p.node.size && (
          <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>{p.node.size}</div>
        )}
      </div>
    )
  }

  return (
    <div class="folder-columns-outer">
      {/* 左侧：目录列（固定宽度，横向滚动） */}
      <div class="folder-columns-wrap" ref={wrapRef}>
        {columnStack.map((folderNode, colIndex) => {
          const children = folderNode.children || []
          return (
            <div key={`${folderNode.path}-${colIndex}`} class="folder-column">
              <div class="folder-column-header">{folderNode.name}/</div>
              {children.length === 0 ? (
                <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>空文件夹</div>
              ) : (
                children.map(node => {
                  const isSelected = selectedInCol[colIndex] === node.path
                  const hasChildren = node.type === 'folder' && (node.children?.length ?? 0) > 0
                  const lpHandlers = makeLongPress(node)
                  return (
                    <div
                      key={node.path}
                      class={`folder-column-row ${isSelected ? 'active' : ''} ${hasChildren ? 'has-children' : ''}`}
                      onClick={() => handleRowClick(node, colIndex)}
                      onContextMenu={(e) => onContextMenu(node, e as MouseEvent)}
                      {...lpHandlers}
                      title={node.name}
                    >
                      <span style={{ fontSize: '14px', flexShrink: 0 }}>{getNodeIcon(node)}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {node.name}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          )
        })}
      </div>

      {/* 右侧：预览区（flex:1 填满剩余空间） */}
      {preview ? (
        <div class="col-preview-panel">
          <div class="col-preview-panel-header">
            <span class="col-preview-panel-title">{preview.node.name}</span>
            <button
              class="col-preview-open-btn"
              title="全屏打开"
              onClick={() => onFileSelect(preview.node)}
            >
              ↗
            </button>
          </div>
          {renderPreviewContent(preview)}
        </div>
      ) : (
        <div class="col-preview-panel col-preview-panel-empty">
          <span>选择文件以预览</span>
        </div>
      )}
    </div>
  )
}

export default FolderColumnView
