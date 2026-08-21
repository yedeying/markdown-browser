import { useState, useEffect, useRef } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'
import type { FileNode } from '../../types.js'
import { getFileType, getEditorLang, isJsonlPath } from '../utils/fileType.js'
import { useLongPress } from '../hooks/useLongPress.js'
import MarkdownPreview from './MarkdownPreview.js'
import Editor from './Editor.js'
import StChatPreview from './StChatPreview.js'
import JsonlLinePreview from './JsonlLinePreview.js'
import { apiFetch, assetUrl } from '../utils/fsApi.js'
import { filterVisible } from '../utils/hiddenFiles.js'
import { sortNodes } from '../utils/sortNodes.js'
import type { SortField, SortOrder } from '../utils/prefs.js'
import { getPref } from '../utils/prefs.js'
import { getNodeIconName } from '../utils/nodeIcon.js'
import Icon from './ui/Icon.js'
import { parseStJsonl } from '../utils/stJsonl.js'
import {
  getNavFocus,
  isOverlayBlocking,
  isTypingTarget,
  normalizeNavKey,
  scrollNavTarget,
  setNavFocus,
  stepIndex,
  consumeColumnSelectFirst,
  subscribeColumnSelectFirst,
  treeNodeTestId,
} from '../utils/keyboardNav.js'
import { useDelayedFlag } from '../hooks/useDelayedFlag.js'

function findNodeByPath(nodes: FileNode[], path: string): FileNode | null {
  for (const n of nodes) {
    if (n.path === path) return n
    if (n.children) {
      const hit = findNodeByPath(n.children, path)
      if (hit) return hit
    }
  }
  return null
}

/** 列预览区按行滚动；滚得动返回 true，已到顶/底返回 false */
function scrollColPreviewByLine(dir: 'up' | 'down'): boolean {
  const panel = document.querySelector('.col-preview-panel')
  if (!(panel instanceof HTMLElement)) return false

  const preferred = [
    panel.querySelector('.col-preview-markdown'),
    panel.querySelector('.col-preview-jsonl'),
    panel.querySelector('.col-preview-code .cm-scroller'),
    panel.querySelector('.col-preview-image'),
    panel.querySelector('.col-preview-text'),
  ]

  const seen = new Set<Element>()
  const candidates: HTMLElement[] = []
  for (const node of preferred) {
    if (node instanceof HTMLElement && !seen.has(node)) {
      seen.add(node)
      candidates.push(node)
    }
  }
  // 兜底：任意可纵向滚动的后代（含 CodeMirror 内部）
  for (const node of panel.querySelectorAll('*')) {
    if (!(node instanceof HTMLElement) || seen.has(node)) continue
    const oy = getComputedStyle(node).overflowY
    if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') continue
    seen.add(node)
    candidates.push(node)
  }

  const deltaSign = dir === 'down' ? 1 : -1
  for (const el of candidates) {
    const max = el.scrollHeight - el.clientHeight
    if (max <= 1) continue
    const lh = Number.parseFloat(getComputedStyle(el).lineHeight)
    const line = Number.isFinite(lh) && lh > 0 ? lh : 22
    // 一次翻约 1/4 屏（至少 3 行）
    const page = Math.max(line * 3, el.clientHeight * 0.25)
    const before = el.scrollTop
    const next = Math.max(0, Math.min(max, before + page * deltaSign))
    if (Math.abs(next - before) < 0.5) continue
    el.scrollTop = next
    return true
  }
  return false
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
  /** ↗ 全屏打开（媒体绕过 Lightbox，进入主内容区） */
  onOpenFull?: (node: FileNode) => void
  /**
   * 离开列视图时可读：当前浏览的最深目录（columnStack 末列）。
   * 列内钻入不写外层 selectedNode，切到列表/网格时用此同步。
   */
  activeFolderRef?: { current: FileNode | null }
  /** 列内浏览目录变化（用于面包屑），不触发外层跳转 */
  onActiveFolderChange?: (folder: FileNode) => void
  /**
   * 面包屑点到列根之下的某层时传入该 path，列 stack 截断到该目录。
   * 每次请求用递增 token，避免同 path 重复点击无效。
   */
  truncateRequest?: { path: string; token: number } | null
  theme: 'dark' | 'light'
  onContextMenu: (node: FileNode, e: MouseEvent) => void
  onLongPress: (node: FileNode) => void
  /** 是否显示隐藏文件（点文件），默认隐藏 */
  showHidden?: boolean
  sortField?: SortField
  sortOrder?: SortOrder
}

const FolderColumnView: FunctionalComponent<Props> = ({
  rootNode,
  tree,
  onFileSelect,
  onOpenFull,
  activeFolderRef,
  onActiveFolderChange,
  truncateRequest = null,
  theme,
  onContextMenu,
  onLongPress,
  showHidden = false,
  sortField = 'name',
  sortOrder = 'asc',
}) => {
  const [columnStack, setColumnStack] = useState<FileNode[]>([rootNode])
  const [selectedInCol, setSelectedInCol] = useState<Record<number, string>>({})
  const [preview, setPreview] = useState<PreviewState | null>(null)
  /** 文件预览焦点：→ 进入后上下只翻预览行，← 退回列光标 */
  const [previewFocus, setPreviewFocus] = useState(false)
  const showPreviewSkeleton = useDelayedFlag(!!preview?.loading, 500)
  const wrapRef = useRef<HTMLDivElement>(null)
  const rootNodeRef = useRef(rootNode)
  rootNodeRef.current = rootNode
  const treeRef = useRef(tree)
  treeRef.current = tree
  const showHiddenRef = useRef(showHidden)
  showHiddenRef.current = showHidden
  const sortFieldRef = useRef(sortField)
  sortFieldRef.current = sortField
  const sortOrderRef = useRef(sortOrder)
  sortOrderRef.current = sortOrder

  // 同步「当前浏览目录」给外层（面包屑展示 + 切出列视图时提交）
  useEffect(() => {
    const folder = columnStack[columnStack.length - 1] ?? rootNode
    if (activeFolderRef) activeFolderRef.current = folder
    onActiveFolderChange?.(folder)
  }, [columnStack, rootNode, activeFolderRef, onActiveFolderChange])

  // 面包屑：截断到指定目录（含列根 = 只留一列）
  useEffect(() => {
    if (!truncateRequest) return
    const target = truncateRequest.path
    setPreview(null)
    setPreviewFocus(false)
    setSelectedInCol({})
    setColumnStack((prev) => {
      const idx = prev.findIndex((n) => n.path === target)
      if (idx >= 0) return prev.slice(0, idx + 1)
      if (rootNodeRef.current.path === target) return [rootNodeRef.current]
      return prev
    })
  }, [truncateRequest?.token])

  /** 用完整 tree 上的节点，避免列内缓存的浅节点没有 children */
  const resolveFolder = (folder: FileNode): FileNode =>
    findNodeByPath(treeRef.current, folder.path) ?? folder

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
  const loadPreviewRef = useRef(loadPreview)
  loadPreviewRef.current = loadPreview

  const selectFirstInColumn = () => {
    const root = rootNodeRef.current
    const children = sortNodes(
      filterVisible(root.children || [], showHiddenRef.current),
      sortFieldRef.current,
      sortOrderRef.current,
    )
    setColumnStack([root])
    setPreview(null)
    if (children.length === 0) {
      setSelectedInCol({})
      setNavFocus('folder')
      return
    }
    const first = children[0]
    if (first.type === 'folder') {
      const fresh = resolveFolder(first)
      setColumnStack([root, fresh])
      setSelectedInCol({ 0: first.path })
      setPreview(null)
    } else {
      setSelectedInCol({ 0: first.path })
      setColumnStack([root])
      void loadPreviewRef.current(first)
    }
    setNavFocus('folder')
    requestAnimationFrame(() => {
      scrollNavTarget(document.querySelector(`[data-path="${CSS.escape(first.path)}"]`))
    })
  }

  // 根节点切换时重置
  useEffect(() => {
    setColumnStack([rootNode])
    setSelectedInCol({})
    setPreview(null)
  }, [rootNode.path])

  // tree 懒加载补全后，刷新各列节点上的 children
  useEffect(() => {
    setColumnStack((prev) => prev.map((n) => findNodeByPath(tree, n.path) ?? n))
  }, [tree])

  // 树 Enter：打开目录后选中第一列第一项
  useEffect(() => {
    const trySelect = () => {
      if (!consumeColumnSelectFirst()) return
      selectFirstInColumn()
    }
    trySelect()
    return subscribeColumnSelectFirst(trySelect)
  }, [rootNode.path])

  const makeLongPress = useLongPress<FileNode>({ onLongPress })

  const handleRowClick = (node: FileNode, colIndex: number) => {
    setNavFocus('folder')
    if (node.type === 'folder') {
      const fresh = resolveFolder(node)
      setColumnStack(prev => [...prev.slice(0, colIndex + 1), fresh])
      setSelectedInCol(prev => {
        const next: Record<number, string> = {}
        for (const [k, v] of Object.entries(prev)) {
          if (Number(k) < colIndex) next[Number(k)] = v
        }
        next[colIndex] = node.path
        return next
      })
      setPreview(null)
      setPreviewFocus(false)
      setTimeout(() => {
        if (wrapRef.current) {
          wrapRef.current.scrollLeft = wrapRef.current.scrollWidth
        }
      }, 50)
    } else {
      setSelectedInCol(prev => {
        const next: Record<number, string> = {}
        for (const [k, v] of Object.entries(prev)) {
          if (Number(k) < colIndex) next[Number(k)] = v
        }
        next[colIndex] = node.path
        return next
      })
      setColumnStack(prev => prev.slice(0, colIndex + 1))
      setPreviewFocus(false)
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

  /** →：进入目录，并把光标落到下一列首项（优先子目录） */
  const enterFolderSelectingFirst = (folder: FileNode, colIndex: number) => {
    setNavFocus('folder')
    const fresh = resolveFolder(folder)
    const nextChildren = sortNodes(
      filterVisible(fresh.children || [], showHidden),
      sortField,
      sortOrder,
    )
    const first = nextChildren.find((n) => n.type === 'folder') ?? nextChildren[0]

    if (first?.type === 'folder') {
      const firstFresh = resolveFolder(first)
      setColumnStack((prev) => [...prev.slice(0, colIndex + 1), fresh, firstFresh])
      setSelectedInCol((prev) => {
        const next: Record<number, string> = {}
        for (const [k, v] of Object.entries(prev)) {
          if (Number(k) < colIndex) next[Number(k)] = v
        }
        next[colIndex] = folder.path
        next[colIndex + 1] = first.path
        return next
      })
      setPreview(null)
      setPreviewFocus(false)
    } else if (first) {
      setColumnStack((prev) => [...prev.slice(0, colIndex + 1), fresh])
      setSelectedInCol((prev) => {
        const next: Record<number, string> = {}
        for (const [k, v] of Object.entries(prev)) {
          if (Number(k) < colIndex) next[Number(k)] = v
        }
        next[colIndex] = folder.path
        next[colIndex + 1] = first.path
        return next
      })
      setPreviewFocus(false)
      loadPreview(first)
    } else {
      setColumnStack((prev) => [...prev.slice(0, colIndex + 1), fresh])
      setSelectedInCol((prev) => {
        const next: Record<number, string> = {}
        for (const [k, v] of Object.entries(prev)) {
          if (Number(k) < colIndex) next[Number(k)] = v
        }
        next[colIndex] = folder.path
        return next
      })
      setPreview(null)
      setPreviewFocus(false)
    }

    setTimeout(() => {
      if (wrapRef.current) {
        wrapRef.current.scrollLeft = wrapRef.current.scrollWidth
      }
    }, 50)

    if (first) {
      requestAnimationFrame(() => {
        scrollNavTarget(document.querySelector(`[data-path="${CSS.escape(first.path)}"]`))
      })
    }
  }

  const onFileSelectRef = useRef(onFileSelect)
  onFileSelectRef.current = onFileSelect

  const previewRef = useRef(preview)
  previewRef.current = preview
  const previewFocusRef = useRef(previewFocus)
  previewFocusRef.current = previewFocus

  // 列视图键盘导航
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (getNavFocus() !== 'folder') return
      // 列预览内只读 CodeMirror 不阻断翻行 / 换文件
      const inColPreview = !!(e.target as Element | null)?.closest?.('.col-preview-panel')
      if (isTypingTarget(e.target) && !inColPreview) return
      if (isOverlayBlocking()) return
      const dir = normalizeNavKey(e)
      if (!dir) return

      const activeCol = (() => {
        const keys = Object.keys(selectedInCol).map(Number)
        if (keys.length === 0) return Math.max(0, columnStack.length - 1)
        return Math.max(...keys)
      })()
      const folderNode = columnStack[activeCol] ?? columnStack[0]
      if (!folderNode) return
      const colChildren = sortNodes(
        filterVisible(folderNode.children || [], showHidden),
        sortField,
        sortOrder,
      )
      if (colChildren.length === 0 && dir !== 'left') return

      if (dir === 'up' || dir === 'down') {
        e.preventDefault()
        const curPath = selectedInCol[activeCol]
        const curIdx = curPath ? colChildren.findIndex((n) => n.path === curPath) : -1
        // 仅文件预览焦点（→ 进入）时上下翻预览；列光标阶段只换行选中
        if (previewFocusRef.current) {
          scrollColPreviewByLine(dir)
          return
        }
        const nextIdx = stepIndex(curIdx, colChildren.length, dir === 'down' ? 1 : -1)
        if (nextIdx < 0 || nextIdx === curIdx) return
        const next = colChildren[nextIdx]
        handleRowClick(next, activeCol)
        requestAnimationFrame(() => {
          scrollNavTarget(document.querySelector(`[data-path="${CSS.escape(next.path)}"]`))
        })
        return
      }

      if (dir === 'right' || dir === 'enter') {
        e.preventDefault()
        e.stopImmediatePropagation()
        const curPath = selectedInCol[activeCol]
        const cur = curPath ? colChildren.find((n) => n.path === curPath) : null

        if (dir === 'enter') {
          if (cur?.type === 'folder') {
            handleRowClick(cur, activeCol)
          } else if (cur) {
            onFileSelectRef.current(cur)
          }
          return
        }

        // → / l：文件 → 进入预览焦点；目录 → 进入子列
        if (cur?.type === 'file') {
          if (!previewRef.current || previewRef.current.node.path !== cur.path) {
            handleRowClick(cur, activeCol)
          }
          setPreviewFocus(true)
          requestAnimationFrame(() => {
            scrollNavTarget(document.querySelector('.col-preview-panel'))
          })
          return
        }

        const targetFolder =
          cur?.type === 'folder' ? cur : colChildren.find((n) => n.type === 'folder')
        if (targetFolder) {
          enterFolderSelectingFirst(targetFolder, activeCol)
        }
        return
      }

      if (dir === 'left') {
        e.preventDefault()
        e.stopImmediatePropagation()
        // 文件预览焦点：← 先退回列光标
        if (previewFocusRef.current) {
          setPreviewFocus(false)
          return
        }
        // 最左列：焦点交回侧栏树，光标停在当前展示目录；清除列视图选中
        if (activeCol === 0) {
          const root = rootNodeRef.current
          setColumnStack([root])
          setSelectedInCol({})
          setPreview(null)
          setPreviewFocus(false)
          setNavFocus('tree')
          onFileSelectRef.current(root)
          requestAnimationFrame(() => {
            const sel = root.path
              ? `[data-testid="${treeNodeTestId(root.path)}"]`
              : '.sidebar-root-row'
            scrollNavTarget(document.querySelector(sel))
          })
          return
        }
        // 非最左列：收回一列，光标回到上一列已选目录
        const newStack = columnStack.slice(0, activeCol)
        setColumnStack(newStack)
        setSelectedInCol((prev) => {
          const next = { ...prev }
          for (const k of Object.keys(next).map(Number)) {
            if (k >= activeCol) delete next[k]
          }
          return next
        })
        setPreview(null)
        setPreviewFocus(false)
      }
    }

    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [columnStack, selectedInCol, showHidden, sortField, sortOrder, previewFocus])


  const renderPreviewContent = (p: PreviewState) => {
    const ft = getFileType(p.node.name)

    if (p.loading) {
      if (!showPreviewSkeleton) return null
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
            src={assetUrl(p.node.path)}
            alt={p.node.name}
          />
        </div>
      )
    }

    // .jsonl：与主预览一致，ST 通过则聊天气泡，否则逐行 JSONL
    if (isJsonlPath(p.node.name) && p.content !== null) {
      const parsed = parseStJsonl(p.content)
      const preferSt = getPref('jsonlPreviewMode') === 'st'
      return (
        <div class="col-preview-jsonl" data-testid="col-preview-jsonl">
          {parsed.ok && preferSt ? (
            <StChatPreview
              fileName={p.node.name}
              messages={parsed.messages}
              characterName={parsed.characterName}
              userName={parsed.userName}
            />
          ) : (
            <JsonlLinePreview content={p.content} />
          )}
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
            language={getEditorLang(p.node.name, p.content)}
          />
        </div>
      )
    }

    // 不支持预览
    return (
      <div class="col-preview-placeholder">
        <Icon name={getNodeIconName(p.node)} size={32} class="col-preview-icon" aria-hidden="true" />
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{p.node.name}</div>
        {p.node.size && (
          <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>{p.node.size}</div>
        )}
      </div>
    )
  }

  return (
    <div
      class="folder-columns-outer"
      onPointerDown={() => setNavFocus('folder')}
    >
      {/* 左侧：目录列（固定宽度，横向滚动） */}
      <div class="folder-columns-wrap" ref={wrapRef}>
        {columnStack.map((folderNode, colIndex) => {
          const children = sortNodes(filterVisible(folderNode.children || [], showHidden), sortField, sortOrder)
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
                      class={[
                        'folder-column-row',
                        isSelected ? 'active' : '',
                        hasChildren ? 'has-children' : '',
                        node.type === 'file' && isSelected ? 'kb-focus' : '',
                      ].filter(Boolean).join(' ')}
                      data-path={node.path}
                      onClick={() => handleRowClick(node, colIndex)}
                      onContextMenu={(e) => onContextMenu(node, e as MouseEvent)}
                      {...lpHandlers}
                      title={node.name}
                    >
                      <Icon name={getNodeIconName(node)} size={14} class="row-icon" aria-hidden="true" />
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
        <div class={`col-preview-panel${previewFocus ? ' kb-focus' : ''}`} data-preview-focus={previewFocus ? '1' : undefined}>
          <div class="col-preview-panel-header">
            <span class="col-preview-panel-title">{preview.node.name}</span>
            <button
              class="col-preview-open-btn"
              title="全屏打开"
              onClick={() => (onOpenFull ?? onFileSelect)(preview.node)}
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
