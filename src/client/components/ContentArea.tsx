import { useRef, useState, useEffect, useCallback, useMemo } from 'preact/hooks'
import type { FunctionalComponent, ComponentChildren } from 'preact'
import MarkdownPreview from './MarkdownPreview.js'
import Editor, { type EditorHandle } from './Editor.js'
import MediaLightbox from './MediaLightbox.js'
import TableOfContents from './TableOfContents.js'
import FolderView, { type ClipboardState } from './FolderView.js'
import StChatPreview from './StChatPreview.js'
import JsonlLinePreview from './JsonlLinePreview.js'
import { getFileType, getEditorLang, isBinaryContent, isJsonlPath } from '../utils/fileType.js'
import { parseStJsonl } from '../utils/stJsonl.js'
import { buildMediaPlaylist } from '../utils/galleryMedia.js'
import { filterVisible } from '../utils/hiddenFiles.js'
import { sortNodes } from '../utils/sortNodes.js'
import type { FileNode } from '../../types.js'
import ShareDialog from './ShareDialog.js'
import { getSharePrefix, downloadUrl } from '../utils/fsApi.js'
import Icon from './ui/Icon.js'
import Skeleton from './ui/Skeleton.js'
import EmptyState from './ui/EmptyState.js'
import ExternalUpdateBanner from './ui/ExternalUpdateBanner.js'
import { showToast } from './ui/Toast.js'
import { getScroll, setScroll } from '../utils/scrollMemory.js'
import { usePref } from '../hooks/usePref.js'
import { useDelayedFlag } from '../hooks/useDelayedFlag.js'

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

function parentDirPath(filePath: string): string {
  const i = filePath.lastIndexOf('/')
  return i <= 0 ? '' : filePath.slice(0, i)
}

/** 深链接媒体：同级可见媒体列表（有 tree 时）；否则仅当前文件。 */
function mediaPlaylistForFile(
  filePath: string,
  tree: FileNode[] | undefined,
  showHidden: boolean,
  sort: { field: 'name' | 'type' | 'size'; order: 'asc' | 'desc' },
): FileNode[] {
  const alone: FileNode = {
    name: filePath.split('/').pop() || filePath,
    type: 'file',
    path: filePath,
  }
  if (!tree) return [alone]
  const parentPath = parentDirPath(filePath)
  const parent =
    parentPath === ''
      ? { name: '', type: 'folder' as const, path: '', children: tree }
      : findNodeByPath(tree, parentPath)
  if (!parent?.children) return [alone]
  const siblings = sortNodes(filterVisible(parent.children, showHidden), sort.field, sort.order)
  const playlist = buildMediaPlaylist(siblings)
  return playlist.length > 0 ? playlist : [alone]
}

type ViewMode = 'preview' | 'edit' | 'code-only'

interface Props {
  filePath: string | null
  content: string | null
  /** content 已对应当前 filePath；缺省时回退为 !loading && content != null（单文件模式） */
  contentReady?: boolean
  loading: boolean
  error: string | null
  theme: 'dark' | 'light'
  onSave?: (path: string, content: string) => Promise<boolean>
  onSSEEvent?: (cb: () => void) => void
  /**
   * SSE 检测到磁盘文件变化、且当前无未保存改动时，由 App 触发的静默重载（重新 loadFile）。
   * 返回 false 表示重载被抑制（例如刚刚自己保存过），此时不应再等待恢复滚动位置。
   */
  onSilentReload?: () => void | boolean | Promise<boolean>
  /** 文件夹 children 懒加载失败的错误信息（避免骨架屏永久 shimmer） */
  folderLoadError?: string | null
  /** 重试加载文件夹 children */
  onRetryLoadChildren?: (path: string) => void
  watchConnected?: boolean
  onNavigate?: (path: string) => void
  themeToggle?: ComponentChildren
  onOpenSettings?: () => void
  // 移动端汉堡菜单
  onToggleSidebar?: () => void
  // 文件夹视图相关
  selectedNode?: FileNode | null
  tree?: FileNode[]
  onSelectNode?: (node: FileNode) => void
  /** 懒加载：文件夹 children 未就绪时触发拉取 */
  loadChildren?: (path: string) => void
  // 剪贴板（App 级别管理）
  clipboard?: ClipboardState | null
  onCopy?: (nodes: FileNode[]) => void
  onCut?: (nodes: FileNode[]) => void
  onClearClipboard?: () => void
  // 应用内导航（手势处理，由父组件决定行为）
  onSwipe?: (direction: 'left' | 'right') => void
  // 分享模式（访客只读）
  shareMode?: boolean
  /** 是否显示隐藏文件（点文件），默认隐藏 */
  showHidden?: boolean
}

const ContentArea: FunctionalComponent<Props> = ({
  filePath,
  content,
  contentReady: contentReadyProp,
  loading,
  error,
  theme,
  onSave,
  onSilentReload,
  folderLoadError = null,
  onRetryLoadChildren,
  watchConnected,
  onNavigate,
  themeToggle,
  onOpenSettings,
  onToggleSidebar,
  selectedNode,
  tree,
  onSelectNode,
  loadChildren,
  clipboard,
  onCopy,
  onCut,
  onClearClipboard,
  onSwipe,
  shareMode = false,
  showHidden = false,
}) => {
  const isShareMode = shareMode || !!getSharePrefix()
  const fileType = filePath ? getFileType(filePath) : 'markdown'
  const isMarkdown = fileType === 'markdown'
  const isEditable = fileType === 'markdown' || fileType === 'code' || fileType === 'text'
  const isJsonl = isJsonlPath(filePath)
  const contentReady = contentReadyProp ?? (!loading && content !== null)

  // .jsonl 的 ST 识别结果：仅在内容就位时解析一次，供预览分支与「对话 | JSONL」
  // 切换按钮共用（后者只在识别通过时才显示，见设计 §3.1）。
  const jsonlParsed = useMemo(
    () => (isJsonl && contentReady && content ? parseStJsonl(content) : null),
    [isJsonl, contentReady, content],
  )
  const jsonlOk = jsonlParsed?.ok === true
  const [jsonlPreviewMode, setJsonlPreviewMode] = usePref('jsonlPreviewMode')
  const [sortPref] = usePref('sort')
  // 非 ST 文件即使偏好记的是 'st' 也固定回落到逐行 JSONL（设计 §3.1）
  const effectiveJsonlMode: 'st' | 'jsonl' = jsonlOk && jsonlPreviewMode === 'st' ? 'st' : 'jsonl'

  // 默认视图由文件类型同步决定，避免切到 md/jsonl 时先闪一帧 code-only（raw）
  const defaultViewMode: ViewMode =
    (isMarkdown || isJsonl) ? 'preview' : (isEditable ? 'code-only' : 'preview')
  const [viewModeOverride, setViewModeOverride] = useState<{ path: string; mode: ViewMode } | null>(null)
  const viewMode: ViewMode =
    filePath && viewModeOverride?.path === filePath
      ? viewModeOverride.mode
      : defaultViewMode
  const setViewMode = useCallback((mode: ViewMode) => {
    if (!filePath) return
    setViewModeOverride({ path: filePath, mode })
  }, [filePath])

  const [editContent, setEditContent] = useState(content || '')
  const [unsaved, setUnsaved] = useState(false)
  const [saving, setSaving] = useState(false)
  // SSE 检测到磁盘变化、但本地有未保存编辑时：不静默覆盖，弹出提示条让用户选择
  const [externalUpdatePending, setExternalUpdatePending] = useState(false)
  // 待恢复滚动位置的文件路径（打开文件 / 静默重载都会置位）；
  // 记路径而不是布尔值，这样切到别的文件时上一个待恢复请求会自动失效。
  const restoreScrollForRef = useRef<string | null>(null)
  const contentBodyRef = useRef<HTMLDivElement>(null)
  const tocRef = useRef<HTMLElement | null>(null)
  const previewContentRef = useRef<HTMLElement | null>(null)
  const editorRef = useRef<EditorHandle | null>(null)
  const previewPaneRef = useRef<HTMLDivElement>(null)
  // 防止滚动事件互相触发死循环
  const scrollingFrom = useRef<'editor' | 'preview' | null>(null)

  // 文件切换时重置未保存态与滚动；视图模式由 defaultViewMode 同步决定，不在此异步 set
  useEffect(() => {
    setUnsaved(false)
    setExternalUpdatePending(false)
    setEditContent('') // 立刻清空，避免下一文件用 code-only 时闪一帧旧 raw
    if (contentBodyRef.current) {
      contentBodyRef.current.scrollTop = 0
    }
    restoreScrollForRef.current = filePath
  }, [filePath])

  // content 就绪后同步编辑缓冲；未保存时不覆盖
  useEffect(() => {
    if (contentReady && content !== null && !unsaved) {
      setEditContent(content)
    }
  }, [content, contentReady, unsaved])

  // 未保存用本地缓冲；否则直接用已就绪的 content，避免 effect 晚一帧导致 raw 闪烁
  const editorValue = unsaved
    ? editContent
    : (contentReady && content !== null ? content : editContent)

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
      // 本地内容已落盘，外部变更提示条不再适用
      setExternalUpdatePending(false)
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

  // SSE 磁盘文件变化事件（由 App 转发）：
  // - 无未保存改动（预览 / 编辑但已保存）→ 静默重载并恢复滚动位置
  // - 有未保存改动 → 不覆盖，弹出提示条让用户选择
  useEffect(() => {
    const handler = async (e: Event) => {
      const { path } = (e as CustomEvent<{ path: string }>).detail
      if (!filePath || path !== filePath) return
      if (unsaved) {
        setExternalUpdatePending(true)
      } else {
        restoreScrollForRef.current = filePath
        const reloaded = await onSilentReload?.()
        // 重载被抑制（self-save 窗口内）：撤回待恢复标记，
        // 否则它会残留到下一次无关的 content 变化上
        if (reloaded === false && restoreScrollForRef.current === filePath) {
          restoreScrollForRef.current = null
        }
      }
    }
    window.addEventListener('vmd:file-reload', handler)
    return () => window.removeEventListener('vmd:file-reload', handler)
  }, [filePath, unsaved, onSilentReload])

  // 提示条：加载新版本 —— 主动放弃本地未保存编辑，重载磁盘内容
  const handleExternalReload = useCallback(async () => {
    setExternalUpdatePending(false)
    setUnsaved(false)
    restoreScrollForRef.current = filePath
    const reloaded = await onSilentReload?.()
    if (reloaded === false && restoreScrollForRef.current === filePath) {
      restoreScrollForRef.current = null
    }
  }, [filePath, onSilentReload])

  // 提示条：忽略 —— 保留本地未保存编辑，不重载
  const handleDismissExternalUpdate = useCallback(() => {
    setExternalUpdatePending(false)
  }, [])

  // 内容渲染完成后恢复滚动位置（rAF + 一次重试，等待预览重新排版）。
  // 覆盖两种场景：会话内重新打开同一文件、SSE 静默重载。
  useEffect(() => {
    const pendingPath = restoreScrollForRef.current
    if (!pendingPath) return
    // 已经切到别的文件：待恢复请求作废
    if (pendingPath !== filePath) {
      restoreScrollForRef.current = null
      return
    }
    // 内容尚未到达，等下一次 content 变化
    if (!contentReady) return
    restoreScrollForRef.current = null
    const target = getScroll(pendingPath)
    if (!target) return
    const apply = () => {
      if (contentBodyRef.current) contentBodyRef.current.scrollTop = target
    }
    requestAnimationFrame(() => {
      apply()
      requestAnimationFrame(apply)
    })
  }, [content, contentReady, filePath])

  // 预览模式下滚动位置持久化（防抖）。
  // 卸载/切文件时 flush 一次，避免最后 200ms 内的滚动被丢掉。
  useEffect(() => {
    const el = contentBodyRef.current
    if (!el || viewMode !== 'preview' || !filePath) return
    let timer: ReturnType<typeof setTimeout>
    let dirty = false
    const persist = () => {
      dirty = false
      setScroll(filePath, el.scrollTop)
    }
    const flush = () => {
      if (!dirty) return
      clearTimeout(timer)
      persist()
    }
    const handleScroll = () => {
      dirty = true
      clearTimeout(timer)
      timer = setTimeout(persist, 200)
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    // 关闭标签页 / 切后台也要落盘（pagehide 在移动端比 beforeunload 可靠）
    window.addEventListener('pagehide', flush)
    return () => {
      flush()
      clearTimeout(timer)
      el.removeEventListener('scroll', handleScroll)
      window.removeEventListener('pagehide', flush)
    }
  }, [viewMode, filePath])

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

  // 下载当前文件
  const handleDownload = useCallback(() => {
    if (!filePath) return
    const url = downloadUrl(filePath)
    const a = document.createElement('a')
    a.href = url
    a.download = filePath.split('/').pop() || 'file'
    a.click()
  }, [filePath])

  // 移动端左右滑手势：右滑后退/展开侧边栏，左滑前进（由父组件决定行为）
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
        // 右滑
        onSwipe?.('right')
      } else {
        // 左滑
        onSwipe?.('left')
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [onSwipe])

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
  // 懒加载文件夹：children 未就绪（非空文件夹的首次进入）时先显示骨架屏，
  // 避免把"还没加载"误判为"空文件夹"
  const folderChildrenReady = !isFolderView || selectedNode!.children != null
  const displayName = isFolderView ? selectedNode!.name : fileName

  // 骨架延迟半秒：快速加载时不闪一下占位
  const folderLoadPending = isFolderView && !folderChildrenReady && !folderLoadError
  const showFolderSkeleton = useDelayedFlag(folderLoadPending, 500)
  const fileLoadPending =
    !!filePath &&
    !isFolderView &&
    fileType !== 'image' &&
    fileType !== 'video' &&
    (loading || !contentReady)
  const showFileSkeleton = useDelayedFlag(fileLoadPending, 500)

  // 文件夹 children 未就绪时触发懒加载（App 侧通常已在 onSelect 时触发，这里作为兜底）
  useEffect(() => {
    if (isFolderView && selectedNode!.children == null && selectedNode!.path) {
      loadChildren?.(selectedNode!.path)
    }
  }, [isFolderView, selectedNode?.path, selectedNode?.children, loadChildren])

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
      // children 未就绪（懒加载进行中）：显示骨架屏，不误判为空文件夹
      if (!folderChildrenReady) {
        // 加载失败：给出错误与重试入口，而不是永久 shimmer
        if (folderLoadError) {
          return (
            <EmptyState
              icon={<Icon name="alert" size={28} aria-hidden="true" />}
              title="加载文件夹失败"
              description={folderLoadError}
              action={
                <button
                  class="btn"
                  data-testid="folder-load-retry"
                  onClick={() => onRetryLoadChildren?.(selectedNode!.path)}
                >
                  重试
                </button>
              }
            />
          )
        }
        // 延迟半秒再出骨架，避免刚出就上屏导致闪烁
        return showFolderSkeleton ? <Skeleton variant="folder" /> : null
      }
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
          showHidden={showHidden}
        />
      )
    }

    if (!filePath) {
      return (
        <EmptyState
          icon={<Icon name="book" size={40} aria-hidden="true" />}
          title="选择左侧文件开始浏览"
        />
      )
    }

    // 图片/视频：共享 Lightbox（同级媒体可左右切换）；Esc 回到父目录
    if (fileType === 'image' || fileType === 'video') {
      const playlist = mediaPlaylistForFile(filePath, tree, showHidden, sortPref)
      const closeToParent = () => {
        const parentPath = parentDirPath(filePath)
        if (onSelectNode && tree) {
          if (parentPath === '') {
            onSelectNode({ name: window.__VMD_DIR_NAME__ || '文件库', type: 'folder', path: '', children: tree })
          } else {
            const parent = findNodeByPath(tree, parentPath)
            if (parent) onSelectNode(parent)
            else onNavigate?.(parentPath)
          }
        } else if (onNavigate) {
          onNavigate(parentPath)
        }
      }
      return (
        <MediaLightbox
          playlist={playlist}
          startPath={filePath}
          onClose={closeToParent}
          closeOnEscape={true}
        />
      )
    }

    // filePath 有值但内容尚未对应该路径：延迟半秒再出骨架；更快则空白，绝不渲染旧文件 raw
    if (fileLoadPending) {
      if (showFileSkeleton) {
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
      return null
    }

    if (error) {
      return (
        <EmptyState
          icon={<Icon name="alert" size={40} aria-hidden="true" />}
          title={`加载失败: ${error}`}
        />
      )
    }

    if (isBinaryContent(content)) {
      return (
        <EmptyState
          icon={<Icon name="ban" size={40} aria-hidden="true" />}
          title="不支持预览此文件类型"
        />
      )
    }

    // 不支持的文件类型
    if (fileType === 'unsupported') {
      return (
        <EmptyState
          icon={<Icon name="ban" size={40} aria-hidden="true" />}
          title="不支持预览此文件类型"
        />
      )
    }

    // 代码/文本：纯编辑器模式
    if (viewMode === 'code-only') {
      return (
        <div class="code-only-view">
          <div class="editor-wrapper">
            <Editor
              key={filePath}
              ref={editorRef}
              value={editorValue}
              onChange={handleEditorChange}
              theme={theme}
              language={getEditorLang(filePath, content)}
            />
          </div>
        </div>
      )
    }

    // Markdown / JSONL 预览模式
    if (viewMode === 'preview') {
      return (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div
            ref={contentBodyRef}
            class="content-body"
            style={{ flex: 1 }}
          >
            {/* 空文件：.jsonl 走自己的空态（逐行预览会显示"空文件"），
                避免被误判成"未选择文件" */}
            {!content && !isJsonl && (
              <EmptyState
                icon={<Icon name="book" size={40} aria-hidden="true" />}
                title="选择左侧文件进行预览"
              />
            )}
            {isJsonl && (
              effectiveJsonlMode === 'st' && jsonlParsed?.ok
                ? (
                  <StChatPreview
                    fileName={fileName}
                    messages={jsonlParsed.messages}
                    characterName={jsonlParsed.characterName}
                    userName={jsonlParsed.userName}
                  />
                )
                : <JsonlLinePreview content={content || ''} />
            )}
            {content && !isJsonl && (
              <MarkdownPreview
                markdown={content}
                contentRef={previewContentRef}
                filePath={filePath}
                onCheckboxToggle={onSave ? handleCheckboxToggle : undefined}
              />
            )}
          </div>
          {!isJsonl && <TableOfContents contentRef={previewContentRef} />}
        </div>
      )
    }

    // Markdown 编辑模式（双栏）
    return (
      <div class="editor-view">
        <div class="editor-pane">
          <div class="pane-header">
            <Icon name="file-text" size={14} aria-hidden="true" />
            Markdown 源码
          </div>
          <div class="editor-wrapper">
            <Editor
              key={filePath}
              ref={editorRef}
              value={editorValue}
              onChange={handleEditorChange}
              theme={theme}
              language="markdown"
            />
          </div>
        </div>
        <div class="editor-pane">
          <div class="pane-header">
            <Icon name="eye" size={14} aria-hidden="true" />
            实时预览
          </div>
          <div class="preview-pane" ref={previewPaneRef}>
            <MarkdownPreview
              markdown={editorValue}
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
          <button class="hamburger-btn" onClick={onToggleSidebar} aria-label="菜单">
            <Icon name="menu" size={18} aria-hidden="true" />
          </button>
          {displayName ? (
            <>
              {!isFolderView && unsaved && <span style={{ color: 'var(--warning)' }}>● </span>}
              {isFolderView && (
                <Icon name="folder" size={14} class="current-file-icon" aria-hidden="true" />
              )}
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
          {!isShareMode && (
            (isFolderView && selectedNode && selectedNode.path !== undefined)
            || (!isFolderView && !!filePath)
          ) && (
            <button
              class="header-icon-btn"
              onClick={() => setShareDialogOpen(true)}
              title={isFolderView ? '分享此文件夹' : '分享此文件'}
              aria-label={isFolderView ? '分享此文件夹' : '分享此文件'}
            >
              <Icon name="share" size={16} aria-hidden="true" />
            </button>
          )}
          {onOpenSettings && (
            <button
              class="header-icon-btn"
              data-testid="open-settings"
              onClick={onOpenSettings}
              title="设置"
              aria-label="打开设置"
            >
              <Icon name="sliders" size={16} aria-hidden="true" />
            </button>
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
                  {isJsonl && filePath && (
                    <>
                      <button
                        class={`btn ${viewMode === 'preview' ? 'active' : ''}`}
                        onClick={() => setViewMode('preview')}
                      >预览</button>
                      <button
                        class={`btn ${viewMode === 'code-only' ? 'active' : ''}`}
                        onClick={() => setViewMode('code-only')}
                        disabled={!content}
                      >源码</button>
                    </>
                  )}
                  {/* 「对话 | JSONL」切换：仅 ST 识别通过时出现（设计 §3.1） */}
                  {isJsonl && filePath && viewMode === 'preview' && jsonlOk && (
                    <div class="jsonl-mode-toggle" data-testid="jsonl-mode-toggle">
                      <button
                        class={`btn ${effectiveJsonlMode === 'st' ? 'active' : ''}`}
                        data-testid="jsonl-mode-st"
                        onClick={() => setJsonlPreviewMode('st')}
                      >对话</button>
                      <button
                        class={`btn ${effectiveJsonlMode === 'jsonl' ? 'active' : ''}`}
                        data-testid="jsonl-mode-jsonl"
                        onClick={() => setJsonlPreviewMode('jsonl')}
                      >JSONL</button>
                    </div>
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
                    title="更多"
                  >
                    <Icon name="more" size={18} aria-hidden="true" />
                  </button>
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
                      {isJsonl && (
                        <>
                          <button
                            class={`header-dropdown-item${viewMode === 'preview' ? ' active' : ''}`}
                            onClick={() => { setViewMode('preview'); setMoreMenuOpen(false) }}
                          >预览模式</button>
                          <button
                            class={`header-dropdown-item${viewMode === 'code-only' ? ' active' : ''}`}
                            onClick={() => { setViewMode('code-only'); setMoreMenuOpen(false) }}
                            disabled={!content}
                          >源码模式</button>
                          {viewMode === 'preview' && jsonlOk && (
                            <>
                              <button
                                class={`header-dropdown-item${effectiveJsonlMode === 'st' ? ' active' : ''}`}
                                onClick={() => { setJsonlPreviewMode('st'); setMoreMenuOpen(false) }}
                              >对话视图</button>
                              <button
                                class={`header-dropdown-item${effectiveJsonlMode === 'jsonl' ? ' active' : ''}`}
                                onClick={() => { setJsonlPreviewMode('jsonl'); setMoreMenuOpen(false) }}
                              >JSONL 视图</button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {externalUpdatePending && (
        <ExternalUpdateBanner
          onReload={handleExternalReload}
          onDismiss={handleDismissExternalUpdate}
        />
      )}

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
