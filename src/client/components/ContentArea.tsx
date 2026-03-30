import { useRef, useState, useEffect, useCallback } from 'preact/hooks'
import type { FunctionalComponent, ComponentChildren } from 'preact'
import MarkdownPreview from './MarkdownPreview.js'
import Editor, { type EditorHandle } from './Editor.js'
import ImageViewer from './ImageViewer.js'
import VideoViewer from './VideoViewer.js'
import TableOfContents from './TableOfContents.js'
import FolderView, { type ClipboardState } from './FolderView.js'
import { getFileType, getEditorLang } from '../utils/fileType.js'
import type { FileNode } from '../../types.js'
import ShareDialog from './ShareDialog.js'
import { getSharePrefix } from '../utils/fsApi.js'

/** 在 tree 中按 path 查找 FileNode */
function findNodeByPath(nodes: FileNode[], path: string): FileNode | null {
  for (const node of nodes) {
    if (node.path === path) return node
    if (node.type === 'folder' && node.children) {
      const found = findNodeByPath(node.children, path)
      if (found) return found
    }
  }
  return null
}

type ViewMode = 'preview' | 'edit' | 'code-only'

interface Props {
  filePath: string | null
  content: string | null
  loading: boolean
  error: string | null
  theme: 'dark' | 'light'
  onSave?: (path: string, content: string) => Promise<boolean>
  onSSEEvent?: (cb: () => void) => void
  watchConnected?: boolean
  onNavigate?: (path: string) => void
  themeToggle?: ComponentChildren
  // 移动端汉堡菜单
  onToggleSidebar?: () => void
  // 文件夹视图相关
  selectedNode?: FileNode | null
  tree?: FileNode[]
  onSelectNode?: (node: FileNode) => void
  // 剪贴板（App 级别管理）
  clipboard?: ClipboardState | null
  onCopy?: (nodes: FileNode[]) => void
  onCut?: (nodes: FileNode[]) => void
  onClearClipboard?: () => void
  // 分享模式（访客只读）
  shareMode?: boolean
}

function showToast(message: string, type: 'success' | 'error') {
  const toast = document.createElement('div')
  toast.className = `toast ${type}`
  toast.textContent = message
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 2200)
}

const ContentArea: FunctionalComponent<Props> = ({
  filePath,
  content,
  loading,
  error,
  theme,
  onSave,
  watchConnected,
  onNavigate,
  themeToggle,
  onToggleSidebar,
  selectedNode,
  tree,
  onSelectNode,
  clipboard,
  onCopy,
  onCut,
  onClearClipboard,
  shareMode = false,
}) => {
  const isShareMode = shareMode || !!getSharePrefix()
  const fileType = filePath ? getFileType(filePath) : 'markdown'
  const isMarkdown = fileType === 'markdown'
  const isEditable = fileType === 'markdown' || fileType === 'code' || fileType === 'text'

  const [viewMode, setViewMode] = useState<ViewMode>('preview')
  const [editContent, setEditContent] = useState(content || '')
  const [unsaved, setUnsaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const contentBodyRef = useRef<HTMLDivElement>(null)
  const tocRef = useRef<HTMLElement | null>(null)
  const previewContentRef = useRef<HTMLElement | null>(null)
  const editorRef = useRef<EditorHandle | null>(null)
  const previewPaneRef = useRef<HTMLDivElement>(null)
  // 防止滚动事件互相触发死循环
  const scrollingFrom = useRef<'editor' | 'preview' | null>(null)

  // 文件切换时重置视图模式和滚动
  useEffect(() => {
    setUnsaved(false)
    setViewMode(isMarkdown ? 'preview' : (isEditable ? 'code-only' : 'preview'))
    if (contentBodyRef.current) {
      contentBodyRef.current.scrollTop = 0
    }
  }, [filePath])

  // content 首次加载完成时初始化编辑框（异步加载后才有内容）
  // 只在 unsaved=false 时同步，避免覆盖用户正在编辑的内容
  useEffect(() => {
    if (content !== null && !unsaved) {
      setEditContent(content)
    }
  }, [content])

  const handleEditorChange = useCallback((value: string) => {
    setEditContent(value)
    setUnsaved(value !== content)
  }, [content])

  // 全选：调用 CodeMirror 的 selectAll
  const handleSelectAll = useCallback(() => {
    editorRef.current?.selectAll()
  }, [])

  const handleCopyAll = useCallback(() => {
    const selection = editorRef.current?.getSelection() ?? ''
    const text = selection || editContent || content || ''
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      showToast(selection ? '已复制选区' : '已复制全文', 'success')
    }).catch(() => {
      showToast('复制失败', 'error')
    })
  }, [editContent, content])

  const handleSave = useCallback(async () => {
    if (!filePath || !onSave) return
    setSaving(true)
    const ok = await onSave(filePath, editContent)
    setSaving(false)
    if (ok) {
      setUnsaved(false)
      showToast('保存成功', 'success')
    } else {
      showToast('保存失败', 'error')
    }
  }, [filePath, editContent, onSave])

  const handleCheckboxToggle = useCallback(async (index: number, checked: boolean) => {
    if (!filePath || !onSave) return
    // 基于 editContent（编辑框当前内容）替换，而非 content（磁盘内容）
    // 避免覆盖用户正在编辑的内容
    let count = -1
    const base = editContent || content || ''
    const newContent = base.replace(/^(\s*[-*+]\s+)\[([ x])\]/gm, (_match, prefix) => {
      count++
      if (count === index) {
        return `${prefix}[${checked ? 'x' : ' '}]`
      }
      return _match
    })
    if (newContent !== base) {
      // 同步更新编辑框内容，保持编辑态一致
      setEditContent(newContent)
      await onSave(filePath, newContent)
    }
  }, [filePath, editContent, content, onSave])

  // navigate-file 事件监听（相对 .md 链接导航）
  useEffect(() => {
    if (!onNavigate) return
    const handler = (e: Event) => {
      const { path } = (e as CustomEvent<{ path: string }>).detail
      if (path) onNavigate(path)
    }
    window.addEventListener('navigate-file', handler)
    return () => window.removeEventListener('navigate-file', handler)
  }, [onNavigate])

  // 双栏编辑模式的滚动同步（编辑器 ↔ 预览，按百分比）
  useEffect(() => {
    if (viewMode !== 'edit') return

    let cleanup: (() => void) | undefined

    // 等一帧让 DOM 渲染完毕后再绑定
    const raf = requestAnimationFrame(() => {
      const scrollDOM = editorRef.current?.getScrollDOM()
      const previewEl = previewPaneRef.current
      if (!scrollDOM || !previewEl) return

      const syncFromEditor = () => {
        if (scrollingFrom.current === 'preview') return
        scrollingFrom.current = 'editor'
        const pct = scrollDOM.scrollTop / (scrollDOM.scrollHeight - scrollDOM.clientHeight || 1)
        previewEl.scrollTop = pct * (previewEl.scrollHeight - previewEl.clientHeight)
        requestAnimationFrame(() => { scrollingFrom.current = null })
      }

      const syncFromPreview = () => {
        if (scrollingFrom.current === 'editor') return
        scrollingFrom.current = 'preview'
        const pct = previewEl.scrollTop / (previewEl.scrollHeight - previewEl.clientHeight || 1)
        scrollDOM.scrollTop = pct * (scrollDOM.scrollHeight - scrollDOM.clientHeight)
        requestAnimationFrame(() => { scrollingFrom.current = null })
      }

      scrollDOM.addEventListener('scroll', syncFromEditor, { passive: true })
      previewEl.addEventListener('scroll', syncFromPreview, { passive: true })

      cleanup = () => {
        scrollDOM.removeEventListener('scroll', syncFromEditor)
        previewEl.removeEventListener('scroll', syncFromPreview)
      }
    })

    return () => {
      cancelAnimationFrame(raf)
      cleanup?.()
    }
  }, [viewMode])

  // Ctrl/Cmd+S 快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (unsaved && (viewMode === 'edit' || viewMode === 'code-only')) {
          handleSave()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [unsaved, viewMode, handleSave])

  // 分享弹窗
  const [shareDialogOpen, setShareDialogOpen] = useState(false)

  // 下载当前文件（分享模式）
  const handleDownload = useCallback(() => {
    if (!filePath) return
    const prefix = getSharePrefix()
    const url = prefix
      ? `${prefix}/api/download/${encodeURI(filePath)}`
      : `/api/download/${encodeURI(filePath)}`
    const a = document.createElement('a')
    a.href = url
    a.download = filePath.split('/').pop() || 'file'
    a.click()
  }, [filePath])

  // 移动端左右滑手势：右滑 → history.back()，左滑 → history.forward()
  const swipeRef = useRef<{ x: number; y: number; t: number } | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = mainRef.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      swipeRef.current = { x: t.clientX, y: t.clientY, t: Date.now() }
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (!swipeRef.current) return
      const t = e.changedTouches[0]
      const dx = t.clientX - swipeRef.current.x
      const dy = t.clientY - swipeRef.current.y
      const dt = Date.now() - swipeRef.current.t
      swipeRef.current = null

      // 必须是以水平方向为主的快速滑动
      if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6 || dt > 400) return

      if (dx > 0) {
        window.history.back()
      } else {
        window.history.forward()
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  // 移动端更多菜单
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  // 点击外部关闭 more 菜单
  useEffect(() => {
    if (!moreMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [moreMenuOpen])

  // 回到顶部
  const [showBackTop, setShowBackTop] = useState(false)
  useEffect(() => {
    const el = contentBodyRef.current
    if (!el) return
    const handler = () => setShowBackTop(el.scrollTop > 300)
    el.addEventListener('scroll', handler)
    return () => el.removeEventListener('scroll', handler)
  }, [])

  const fileName = filePath ? filePath.split('/').pop() : null
  const isFolderView = selectedNode?.type === 'folder'
  const displayName = isFolderView ? selectedNode!.name : fileName

  // 文件视图面包屑：解析 filePath 的父级路径段
  const fileBreadcrumbs = (() => {
    if (isFolderView || !filePath) return null
    const parts = filePath.split('/')
    if (parts.length <= 1) return null   // 根目录下的文件，只有一段，无需面包屑
    // 去掉最后一段（文件名），只保留目录部分
    const dirParts = parts.slice(0, -1)
    const segments: Array<{ name: string; fullPath: string }> = []
    for (let i = 0; i < dirParts.length; i++) {
      segments.push({
        name: dirParts[i],
        fullPath: dirParts.slice(0, i + 1).join('/'),
      })
    }
    return segments
  })()

  // 渲染主内容区
  const renderContent = () => {
    // 文件夹视图优先
    if (selectedNode?.type === 'folder') {
      return (
        <FolderView
          node={selectedNode}
          tree={tree || []}
          onSelect={onSelectNode || (() => {})}
          currentFilePath={filePath}
          theme={theme}
          clipboard={clipboard}
          onCopy={onCopy}
          onCut={onCut}
          onClearClipboard={onClearClipboard}
          shareMode={isShareMode}
        />
      )
    }

    if (!filePath) {
      return (
        <div class="empty-state">
          <div class="empty-state-icon">📝</div>
          <div class="empty-state-text">选择左侧文件开始浏览</div>
        </div>
      )
    }

    // filePath 有值但内容还没加载完（loading 或 content 尚为 null）时显示 skeleton
    if (loading || content === null) {
      return (
        <div class="file-loading">
          <div class="file-loading-bars">
            {[0.6, 1, 0.75, 0.9, 0.5, 0.8, 0.65, 0.95, 0.7, 0.55, 0.85, 0.4].map((w, i) => (
              <div key={i} class="file-loading-line" style={{ width: `${w * 100}%`, animationDelay: `${i * 0.04}s` }} />
            ))}
          </div>
        </div>
      )
    }

    if (error) {
      return (
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <div class="empty-state-text">加载失败: {error}</div>
        </div>
      )
    }

    // 图片预览
    if (fileType === 'image') {
      return <ImageViewer filePath={filePath} />
    }

    // 视频播放
    if (fileType === 'video') {
      return <VideoViewer filePath={filePath} />
    }

    // 不支持的文件类型
    if (fileType === 'unsupported') {
      return (
        <div class="empty-state">
          <div class="empty-state-icon">🚫</div>
          <div class="empty-state-text">不支持预览此文件类型</div>
        </div>
      )
    }

    // 代码/文本：纯编辑器模式
    if (viewMode === 'code-only') {
      return (
        <div class="code-only-view">
          <div class="editor-wrapper">
            <Editor
              ref={editorRef}
              value={editContent}
              onChange={handleEditorChange}
              theme={theme}
              language={getEditorLang(filePath)}
            />
          </div>
        </div>
      )
    }

    // Markdown 预览模式
    if (viewMode === 'preview') {
      return (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div
            ref={contentBodyRef}
            class="content-body"
            style={{ flex: 1 }}
          >
            {!content && (
              <div class="empty-state">
                <div class="empty-state-icon">📝</div>
                <div class="empty-state-text">选择左侧文件进行预览</div>
              </div>
            )}
            {content && (
              <MarkdownPreview
                markdown={content}
                contentRef={previewContentRef}
                filePath={filePath}
                onCheckboxToggle={onSave ? handleCheckboxToggle : undefined}
              />
            )}
          </div>
          <TableOfContents contentRef={previewContentRef} />
        </div>
      )
    }

    // Markdown 编辑模式（双栏）
    return (
      <div class="editor-view">
        <div class="editor-pane">
          <div class="pane-header">📝 Markdown 源码</div>
          <div class="editor-wrapper">
            <Editor
              ref={editorRef}
              value={editContent}
              onChange={handleEditorChange}
              theme={theme}
              language="markdown"
            />
          </div>
        </div>
        <div class="editor-pane">
          <div class="pane-header">👁 实时预览</div>
          <div class="preview-pane" ref={previewPaneRef}>
            <MarkdownPreview
              markdown={editContent}
              filePath={filePath}
              onCheckboxToggle={onSave ? handleCheckboxToggle : undefined}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <main class="content-area" ref={mainRef}>
      <div class="content-header">
        <div class="current-file">
          {/* 移动端汉堡菜单按钮 */}
          <button class="hamburger-btn" onClick={onToggleSidebar} aria-label="菜单">☰</button>
          {displayName ? (
            <>
              {!isFolderView && unsaved && <span style={{ color: 'var(--warning)' }}>● </span>}
              {isFolderView && <span style={{ marginRight: '4px' }}>📁 </span>}
              {displayName}
              {!isFolderView && watchConnected !== undefined && (
                <span
                  class={`watch-indicator ${watchConnected ? '' : 'disconnected'}`}
                  style={{ display: 'inline-block', marginLeft: '8px', verticalAlign: 'middle' }}
                  title={watchConnected ? '热更新已连接' : '热更新已断开'}
                />
              )}
            </>
          ) : '选择一个文件开始浏览'}
        </div>
        <div class="header-actions">
          {themeToggle}
          {/* 文件夹视图：分享按钮 */}
          {isFolderView && !isShareMode && selectedNode && selectedNode.path !== undefined && (
            <button class="btn" onClick={() => setShareDialogOpen(true)} title="分享此文件夹">分享</button>
          )}
          {/* 文件视图下的操作按钮（文件夹视图时隐藏） */}
          {!isFolderView && (
            <>
              {/* 分享模式：显示下载按钮，隐藏编辑/保存 */}
              {isShareMode && filePath && (
                <button class="btn" onClick={handleDownload} title="下载文件">下载</button>
              )}

              {/* 非分享模式：保存按钮（有未保存修改时） */}
              {!isShareMode && isMarkdown && filePath && viewMode === 'edit' && unsaved && onSave && (
                <button class="btn unsaved" onClick={handleSave} disabled={saving}>
                  {saving ? '保存中...' : '保存'}
                </button>
              )}
              {!isShareMode && !isMarkdown && isEditable && filePath && onSave && unsaved && (
                <button class="btn unsaved" onClick={handleSave} disabled={saving}>
                  {saving ? '保存中...' : '保存'}
                </button>
              )}

              {/* 非分享模式桌面端：直接显示所有操作按钮 */}
              {!isShareMode && (
                <div class="desktop-btn-group">
                  {filePath && (viewMode === 'edit' || viewMode === 'code-only') && (
                    <button class="btn" onClick={handleSelectAll} title="全选文件内容">全选</button>
                  )}
                  {filePath && (editContent || content) && (
                    <button class="btn" onClick={handleCopyAll} title="复制全文到剪贴板">复制</button>
                  )}
                  {isMarkdown && filePath && (
                    <>
                      <button
                        class={`btn ${viewMode === 'preview' ? 'active' : ''}`}
                        onClick={() => setViewMode('preview')}
                      >预览</button>
                      <button
                        class={`btn ${viewMode === 'edit' ? 'active' : ''}`}
                        onClick={() => setViewMode('edit')}
                        disabled={!content}
                      >编辑</button>
                    </>
                  )}
                  {/* 分享按钮 */}
                  {filePath && (
                    <button class="btn" onClick={() => setShareDialogOpen(true)} title="分享此文件">分享</button>
                  )}
                </div>
              )}

              {/* 非分享模式移动端：更多操作按钮 + dropdown */}
              {!isShareMode && filePath && (
                <div ref={moreMenuRef} style={{ position: 'relative' }}>
                  <button
                    class="header-more-btn"
                    onClick={() => setMoreMenuOpen(o => !o)}
                    aria-label="更多操作"
                  >···</button>
                  {moreMenuOpen && (
                    <div class="header-dropdown">
                      {(viewMode === 'edit' || viewMode === 'code-only') && (
                        <button class="header-dropdown-item" onClick={() => { handleSelectAll(); setMoreMenuOpen(false) }}>
                          全选
                        </button>
                      )}
                      {(editContent || content) && (
                        <button class="header-dropdown-item" onClick={() => { handleCopyAll(); setMoreMenuOpen(false) }}>
                          复制全文
                        </button>
                      )}
                      {isMarkdown && (
                        <>
                          <button
                            class={`header-dropdown-item${viewMode === 'preview' ? ' active' : ''}`}
                            onClick={() => { setViewMode('preview'); setMoreMenuOpen(false) }}
                          >预览模式</button>
                          <button
                            class={`header-dropdown-item${viewMode === 'edit' ? ' active' : ''}`}
                            onClick={() => { setViewMode('edit'); setMoreMenuOpen(false) }}
                            disabled={!content}
                          >编辑模式</button>
                        </>
                      )}
                      <button class="header-dropdown-item" onClick={() => { setShareDialogOpen(true); setMoreMenuOpen(false) }}>
                        分享
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 文件视图面包屑 */}
      {fileBreadcrumbs && onSelectNode && (
        <div class="file-breadcrumb">
          <span
            class="file-breadcrumb-seg"
            onClick={() => onSelectNode({ name: (window as typeof window & { __VMD_DIR_NAME__?: string }).__VMD_DIR_NAME__ || '文件库', type: 'folder', path: '', children: tree || [] })}
          >
            {(window as typeof window & { __VMD_DIR_NAME__?: string }).__VMD_DIR_NAME__ || '文件库'}
          </span>
          {fileBreadcrumbs.map((seg) => (
            <>
              <span class="file-breadcrumb-sep">›</span>
              <span
                class="file-breadcrumb-seg"
                onClick={() => {
                  const node = findNodeByPath(tree || [], seg.fullPath)
                  if (node) onSelectNode(node)
                }}
              >
                {seg.name}
              </span>
            </>
          ))}
          <span class="file-breadcrumb-sep">›</span>
          <span class="file-breadcrumb-current">{fileName}</span>
        </div>
      )}

      {renderContent()}

      {showBackTop && viewMode === 'preview' && (
        <button
          class="back-to-top visible"
          onClick={() => contentBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          ↑
        </button>
      )}

      {/* 分享弹窗 */}
      {shareDialogOpen && isFolderView && selectedNode && (
        <ShareDialog
          path={selectedNode.path}
          type="folder"
          name={selectedNode.name}
          onClose={() => setShareDialogOpen(false)}
        />
      )}
      {shareDialogOpen && !isFolderView && filePath && fileName && (
        <ShareDialog
          path={filePath}
          type="file"
          name={fileName}
          onClose={() => setShareDialogOpen(false)}
        />
      )}
    </main>
  )
}

export default ContentArea
