import { useState, useCallback, useEffect, useRef } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'
import type { FileNode } from '../../types.js'
import FolderBreadcrumb from './FolderBreadcrumb.js'
import FolderListView from './FolderListView.js'
import FolderGridView from './FolderGridView.js'
import FolderColumnView from './FolderColumnView.js'
import ContextMenu, { type ContextMenuItem } from './ContextMenu.js'
import ContextModal, { type ModalMode } from './ContextModal.js'
import BottomSheet, { type BottomSheetItem } from './BottomSheet.js'
import ShareDialog from './ShareDialog.js'
import { fsApi } from '../utils/fsApi.js'
import { filterVisible } from '../utils/hiddenFiles.js'
import { sortNodes } from '../utils/sortNodes.js'
import { type FolderViewPref, type SortField, type SortOrder } from '../utils/prefs.js'
import { usePref } from '../hooks/usePref.js'
import { showToast } from './ui/Toast.js'
import Icon from './ui/Icon.js'
import {
  getNavFocus,
  isOverlayBlocking,
  isTypingTarget,
  normalizeNavKey,
  scrollNavTarget,
  setNavFocus,
  stepGridIndex,
  stepIndex,
} from '../utils/keyboardNav.js'

function countGridCols(): number {
  const grid = document.querySelector('[data-testid="folder-grid"]')
  if (!grid) return 1
  const cards = [...grid.querySelectorAll('.folder-card')]
  if (cards.length === 0) return 1
  const top = cards[0].getBoundingClientRect().top
  let cols = 0
  for (const c of cards) {
    if (Math.abs(c.getBoundingClientRect().top - top) > 2) break
    cols++
  }
  return Math.max(1, cols)
}

type CardSize = 's' | 'm' | 'l'

const CARD_SIZE_KEY = 'vmd_grid_card_size'

function loadPref<T extends string>(key: string, fallback: T, valid: T[]): T {
  try {
    const v = localStorage.getItem(key) as T
    return valid.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}

function savePref(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch {}
}

export interface ClipboardState {
  nodes: FileNode[]
  mode: 'copy' | 'cut'
}

export interface SelectionProps {
  selectedPaths: Set<string>
  selectionMode: boolean
  onToggleSelect: (path: string, e?: MouseEvent) => void
  onEnterSelectionMode: (path: string) => void
  onContextMenu: (node: FileNode, e: MouseEvent) => void
  onLongPress: (node: FileNode) => void
}

interface Props {
  node: FileNode            // 当前文件夹节点
  tree: FileNode[]          // 完整树（面包屑用）
  onSelect: (node: FileNode) => void
  currentFilePath: string | null
  theme: 'dark' | 'light'
  // 剪贴板（由 App 管理）
  clipboard?: ClipboardState | null
  onCopy?: (nodes: FileNode[]) => void
  onCut?: (nodes: FileNode[]) => void
  onClearClipboard?: () => void
  // 分享模式（访客无写权限）
  shareMode?: boolean
  /** 是否显示隐藏文件（点文件），默认隐藏 */
  showHidden?: boolean
}

const FolderView: FunctionalComponent<Props> = ({
  node,
  tree,
  onSelect,
  currentFilePath,
  theme,
  clipboard,
  onCopy,
  onCut,
  onClearClipboard,
  shareMode = false,
  showHidden = false,
}) => {
  // 分享弹窗
  const [shareTarget, setShareTarget] = useState<FileNode | null>(null)
  const [viewMode, setViewMode] = usePref('folderView')
  const [cardSize, setCardSize] = useState<CardSize>(() =>
    loadPref<CardSize>(CARD_SIZE_KEY, 'm', ['s', 'm', 'l'])
  )

  // ── 排序偏好（跨列表/网格/列视图共享，持久化到 vmd_sort）──────
  const [sortPref, setSortPref] = usePref('sort')
  const handleSortChange = useCallback((field: SortField) => {
    const next: { field: SortField; order: SortOrder } =
      sortPref.field === field
        ? { field, order: sortPref.order === 'asc' ? 'desc' : 'asc' }
        : { field, order: 'asc' }
    setSortPref(next)
  }, [sortPref])

  // ── 多选状态 ──────────────────────────────────────────────
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [lastClickedPath, setLastClickedPath] = useState<string | null>(null)

  // ── 右键菜单状态 ──────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; node: FileNode } | null>(null)

  // ── 弹窗状态 ──────────────────────────────────────────────
  const [modal, setModal] = useState<{
    mode: ModalMode
    node?: FileNode
    message?: string
  } | null>(null)

  // ── BottomSheet 状态（移动端长按）────────────────────────
  const [bottomSheet, setBottomSheet] = useState<{ node: FileNode } | null>(null)

  // ── loading 防重入 ─────────────────────────────────────────
  const [busy, setBusy] = useState(false)

  // 隐藏文件过滤 + 排序（列表/网格/列视图共用同一份处理后的列表，保持一致）
  const children = sortNodes(filterVisible(node.children || [], showHidden), sortPref.field, sortPref.order)
  const dirName = window.__VMD_DIR_NAME__ || '文件库'

  // 网格键盘焦点（移动不打开，Enter 打开）
  const [gridFocusPath, setGridFocusPath] = useState<string | null>(null)
  const gridFocusPathRef = useRef<string | null>(null)
  const childrenRef = useRef(children)
  const onSelectRef = useRef(onSelect)
  gridFocusPathRef.current = gridFocusPath
  childrenRef.current = children
  onSelectRef.current = onSelect

  // 切换文件夹时清空选中
  useEffect(() => {
    setSelectedPaths(new Set())
    setSelectionMode(false)
    setLastClickedPath(null)
    setCtxMenu(null)
    setGridFocusPath(null)
  }, [node.path])

  useEffect(() => {
    setGridFocusPath(null)
  }, [viewMode])

  // ESC 退出选择模式
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectionMode) { setSelectionMode(false); setSelectedPaths(new Set()) }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectionMode])

  // 列表 / 网格键盘导航（列视图由 FolderColumnView 自己处理）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (getNavFocus() !== 'folder') return
      if (selectionMode) return
      if (modal || ctxMenu || bottomSheet || shareTarget) return
      if (isTypingTarget(e.target)) return
      if (isOverlayBlocking()) return

      const dir = normalizeNavKey(e)
      if (!dir) return

      const mode = document.querySelector('[data-testid="folder-grid"]')
        ? 'grid'
        : document.querySelector('[data-testid="folder-list"]')
          ? 'list'
          : document.querySelector('.folder-columns-outer')
            ? 'column'
            : null
      if (!mode || mode === 'column') return

      const list = childrenRef.current
      if (list.length === 0) return

      if (mode === 'list') {
        // l/→：若当前高亮项是目录则进入；h/← 忽略（回父由面包屑/树处理）
        if (dir === 'right') {
          e.preventDefault()
          const activePath = document.querySelector('.folder-list-row.active')?.getAttribute('data-path')
          const curIdx = activePath
            ? list.findIndex((n) => n.path === activePath)
            : currentFilePath
              ? list.findIndex((n) => n.path === currentFilePath)
              : -1
          if (curIdx >= 0 && list[curIdx].type === 'folder') {
            onSelectRef.current(list[curIdx])
          }
          return
        }
        if (dir === 'left') return
        if (dir !== 'up' && dir !== 'down' && dir !== 'enter') return
        e.preventDefault()
        const curIdx = currentFilePath
          ? list.findIndex((n) => n.path === currentFilePath)
          : -1
        if (dir === 'enter') {
          if (curIdx >= 0) onSelectRef.current(list[curIdx])
          return
        }
        const nextIdx = stepIndex(curIdx, list.length, dir === 'down' ? 1 : -1)
        if (nextIdx < 0) return
        const next = list[nextIdx]
        onSelectRef.current(next)
        requestAnimationFrame(() => {
          scrollNavTarget(document.querySelector(`[data-path="${CSS.escape(next.path)}"]`))
        })
        return
      }

      // grid
      if (dir === 'enter') {
        e.preventDefault()
        e.stopImmediatePropagation()
        const focused = document.querySelector('.folder-card.kb-focus') as HTMLElement | null
        if (focused) {
          const path = focused.getAttribute('data-path')
          const focus = path
            ? (list.find((n) => n.path === path) ?? {
                name: path.split('/').pop() || path,
                type: 'file' as const,
                path,
              })
            : null
          if (focus) onSelectRef.current(focus)
          return
        }
        const path = gridFocusPathRef.current
        const focus = path ? list.find((n) => n.path === path) : null
        if (focus) onSelectRef.current(focus)
        return
      }
      if (dir !== 'up' && dir !== 'down' && dir !== 'left' && dir !== 'right') return
      e.preventDefault()

      // 焦点在目录上时，l/→ 进入该目录（而非仅右移）
      if (dir === 'right') {
        const focusPath = gridFocusPathRef.current
        const cur = focusPath ? list.find((n) => n.path === focusPath) : null
        if (cur?.type === 'folder') {
          onSelectRef.current(cur)
          return
        }
      }

      const cols = countGridCols()
      const focusPath = gridFocusPathRef.current
      const curIdx = focusPath
        ? list.findIndex((n) => n.path === focusPath)
        : currentFilePath
          ? list.findIndex((n) => n.path === currentFilePath)
          : -1
      const nextIdx = stepGridIndex(curIdx, list.length, cols, dir)
      if (nextIdx < 0) return
      const next = list[nextIdx]
      setNavFocus('folder')
      setGridFocusPath(next.path)
      requestAnimationFrame(() => {
        scrollNavTarget(document.querySelector(`[data-path="${CSS.escape(next.path)}"]`))
      })
    }

    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [
    selectionMode,
    modal,
    ctxMenu,
    bottomSheet,
    shareTarget,
    currentFilePath,
  ])

  // ── 多选逻辑 ───────────────────────────────────────────────
  const handleToggleSelect = useCallback((path: string, e?: MouseEvent) => {
    setLastClickedPath(path)
    if (e?.shiftKey && lastClickedPath) {
      const allPaths = children.map(n => n.path)
      const from = allPaths.indexOf(lastClickedPath)
      const to = allPaths.indexOf(path)
      if (from !== -1 && to !== -1) {
        const range = allPaths.slice(Math.min(from, to), Math.max(from, to) + 1)
        setSelectedPaths(prev => new Set([...prev, ...range]))
        return
      }
    }
    setSelectedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [children, lastClickedPath])

  const handleEnterSelectionMode = useCallback((path: string) => {
    setSelectionMode(true)
    setSelectedPaths(new Set([path]))
    setLastClickedPath(path)
  }, [])

  // ── 文件管理操作 ──────────────────────────────────────────
  /** 获取"当前操作"的节点列表：多选有效则用多选，否则用右键目标 */
  const getTargetNodes = (fallbackNode: FileNode): FileNode[] => {
    if (selectedPaths.size > 0 && selectedPaths.has(fallbackNode.path)) {
      return children.filter(n => selectedPaths.has(n.path))
    }
    return [fallbackNode]
  }

  const handleDelete = async (targets: FileNode[]) => {
    if (busy) return
    setBusy(true)
    const paths = targets.map(n => n.path)
    const res = await fsApi.delete(paths)
    setBusy(false)
    if (res.ok) {
      showToast(`已删除 ${res.deleted} 项`, 'success')
      setSelectedPaths(new Set())
      setSelectionMode(false)
    } else {
      showToast(`删除失败: ${res.error}`, 'error')
    }
  }

  const handleRename = async (newName: string, target: FileNode) => {
    if (busy) return
    setBusy(true)
    const res = await fsApi.rename(target.path, newName)
    setBusy(false)
    setModal(null)
    if (res.ok) {
      showToast('重命名成功', 'success')
    } else {
      showToast(`重命名失败: ${res.error}`, 'error')
    }
  }

  const handleMkdir = async (name: string) => {
    if (busy) return
    setBusy(true)
    const newPath = node.path ? `${node.path}/${name}` : name
    const res = await fsApi.mkdir(newPath)
    setBusy(false)
    setModal(null)
    if (res.ok) {
      showToast('文件夹已创建', 'success')
    } else {
      showToast(`创建失败: ${res.error}`, 'error')
    }
  }

  const handleTouch = async (name: string) => {
    if (busy) return
    setBusy(true)
    const newPath = node.path ? `${node.path}/${name}` : name
    const res = await fsApi.touch(newPath)
    setBusy(false)
    setModal(null)
    if (res.ok) {
      showToast('文件已创建', 'success')
    } else {
      showToast(`创建失败: ${res.error}`, 'error')
    }
  }

  const handlePaste = async () => {
    if (!clipboard || busy) return
    setBusy(true)
    const paths = clipboard.nodes.map(n => n.path)
    const dest = node.path
    const res = clipboard.mode === 'copy'
      ? await fsApi.copy(paths, dest)
      : await fsApi.move(paths, dest)
    setBusy(false)
    if (res.ok) {
      const n2 = 'copied' in res ? res.copied : 'moved' in res ? res.moved : 0
      showToast(`${clipboard.mode === 'copy' ? '复制' : '移动'}了 ${n2} 项`, 'success')
      if (clipboard.mode === 'cut') onClearClipboard?.()
    } else {
      showToast(`操作失败: ${res.error}`, 'error')
    }
  }

  // ── 右键菜单项构造 ─────────────────────────────────────────
  const buildCtxMenuItems = (target: FileNode): ContextMenuItem[] => {
    const targets = getTargetNodes(target)
    const isMulti = targets.length > 1
    const label = isMulti ? `${targets.length} 项` : `"${target.name}"`

    // 分享模式：只允许打开
    if (shareMode) {
      return [
        {
          label: target.type === 'folder' ? '打开文件夹' : '打开文件',
          icon: target.type === 'folder' ? 'folder-open' : 'file',
          onClick: () => onSelect(target),
        },
      ]
    }

    return [
      {
        label: target.type === 'folder' ? '打开文件夹' : '打开文件',
        icon: target.type === 'folder' ? 'folder-open' : 'file',
        onClick: () => onSelect(target),
      },
      ...(target.type === 'folder' ? [{
        label: '新建文件夹',
        icon: 'folder-plus',
        separator: true,
        onClick: () => setModal({ mode: 'mkdir' }),
      }, {
        label: '新建文件',
        icon: 'file-plus',
        onClick: () => setModal({ mode: 'touch' }),
      }] as ContextMenuItem[] : []),
      ...(!isMulti ? [{
        label: '重命名',
        icon: 'pencil',
        separator: !target.type || true,
        onClick: () => setModal({ mode: 'rename', node: target }),
      }] as ContextMenuItem[] : []),
      {
        label: isMulti ? `复制 ${label}` : '复制',
        icon: 'copy',
        separator: isMulti || target.type !== 'folder',
        onClick: () => onCopy?.(targets),
      },
      {
        label: isMulti ? `剪切 ${label}` : '剪切',
        icon: 'scissors',
        onClick: () => onCut?.(targets),
      },
      {
        label: '粘贴',
        icon: 'paste',
        disabled: !clipboard,
        onClick: handlePaste,
      },
      ...(!isMulti ? [{
        label: '分享',
        icon: 'link',
        separator: true,
        onClick: () => setShareTarget(target),
      }] as ContextMenuItem[] : []),
      {
        label: isMulti ? `删除 ${label}` : '删除',
        icon: 'trash',
        danger: true,
        separator: isMulti,
        onClick: () => setModal({
          mode: 'confirm',
          node: target,
          message: `确认删除 ${label}？此操作不可撤销。`,
        }),
      },
    ]
  }

  // ── 右键处理（PC）────────────────────────────────────────
  const handleContextMenu = useCallback((targetNode: FileNode, e: MouseEvent) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, node: targetNode })
  }, [])

  // ── 长按处理（移动端）────────────────────────────────────
  const handleLongPress = useCallback((targetNode: FileNode) => {
    setBottomSheet({ node: targetNode })
  }, [])

  // ── 工具栏事件 ─────────────────────────────────────────────
  const handleViewMode = (mode: FolderViewPref) => {
    setNavFocus('folder')
    setViewMode(mode)
  }

  const handleCardSize = (size: CardSize) => {
    setCardSize(size)
    savePref(CARD_SIZE_KEY, size)
  }

  // ── Modal 确认逻辑 ─────────────────────────────────────────
  const handleModalConfirm = (value: string) => {
    if (!modal) return
    if (modal.mode === 'rename' && modal.node) handleRename(value, modal.node)
    else if (modal.mode === 'mkdir') handleMkdir(value)
    else if (modal.mode === 'touch') handleTouch(value)
    else if (modal.mode === 'confirm') {
      const targets = modal.node ? getTargetNodes(modal.node) : []
      if (targets.length > 0) handleDelete(targets)
      setModal(null)
    }
  }

  const selectionProps: SelectionProps = {
    selectedPaths,
    selectionMode,
    onToggleSelect: handleToggleSelect,
    onEnterSelectionMode: handleEnterSelectionMode,
    onContextMenu: handleContextMenu,
    onLongPress: handleLongPress,
  }

  // ── BottomSheet 菜单项 ─────────────────────────────────────
  const buildBottomSheetItems = (target: FileNode): BottomSheetItem[] => {
    const targets = getTargetNodes(target)
    const isMulti = targets.length > 1
    return [
      {
        label: '重命名',
        icon: 'pencil',
        disabled: isMulti,
        onClick: () => {
          setBottomSheet(null)
          if (!isMulti) setModal({ mode: 'rename', node: target })
        },
      },
      {
        label: isMulti ? `复制 ${targets.length} 项` : '复制',
        icon: 'copy',
        onClick: () => { setBottomSheet(null); onCopy?.(targets) },
      },
      {
        label: isMulti ? `剪切 ${targets.length} 项` : '剪切',
        icon: 'scissors',
        onClick: () => { setBottomSheet(null); onCut?.(targets) },
      },
      {
        label: isMulti ? `删除 ${targets.length} 项` : '删除',
        icon: 'trash',
        danger: true,
        onClick: () => {
          setBottomSheet(null)
          setModal({
            mode: 'confirm',
            node: target,
            message: `确认删除 ${isMulti ? `${targets.length} 项` : `"${target.name}"`}？此操作不可撤销。`,
          })
        },
      },
    ]
  }

  return (
    <div
      class="folder-view"
      data-testid="folder-view"
      onPointerDown={() => setNavFocus('folder')}
    >
      {/* ── 工具栏 ─────────────────────────────────────────── */}
      {selectionMode ? (
        // 选择模式工具栏
        <div class="folder-selection-bar">
          <span class="folder-selection-count">已选 {selectedPaths.size} 项</span>
          <button class="btn" onClick={() => setSelectedPaths(new Set(children.map(n => n.path)))}>
            全选
          </button>
          <button class="btn" onClick={() => { setSelectionMode(false); setSelectedPaths(new Set()) }}>
            取消
          </button>
          <button
            class="btn"
            disabled={selectedPaths.size === 0}
            onClick={() => onCopy?.(children.filter(n => selectedPaths.has(n.path)))}
          >
            复制
          </button>
          <button
            class="btn"
            disabled={selectedPaths.size === 0}
            style={{ color: selectedPaths.size > 0 ? 'var(--danger)' : undefined, borderColor: selectedPaths.size > 0 ? 'var(--danger)' : undefined }}
            onClick={() => {
              const targets = children.filter(n => selectedPaths.has(n.path))
              if (targets.length > 0) {
                setModal({
                  mode: 'confirm',
                  message: `确认删除 ${targets.length} 项？此操作不可撤销。`,
                })
              }
            }}
          >
            删除
          </button>
        </div>
      ) : (
        // 普通工具栏
        <div class="folder-toolbar">
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginRight: '4px' }}>视图：</span>
          <button
            class={`btn folder-view-btn ${viewMode === 'list' ? 'active' : ''}`}
            data-testid="view-btn-list"
            onClick={() => handleViewMode('list')}
            title="列表视图"
          ><Icon name="list" size={14} aria-hidden="true" /> 列表</button>
          <button
            class={`btn folder-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
            data-testid="view-btn-grid"
            onClick={() => handleViewMode('grid')}
            title="网格视图"
          ><Icon name="grid" size={14} aria-hidden="true" /> 网格</button>
          <button
            class={`btn folder-view-btn ${viewMode === 'column' ? 'active' : ''}`}
            data-testid="view-btn-column"
            onClick={() => handleViewMode('column')}
            title="列视图"
          ><Icon name="columns" size={14} aria-hidden="true" /> 列</button>
          {viewMode === 'grid' && (
            <div class="folder-card-size-group">
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '24px' }}>尺寸：</span>
              {(['s', 'm', 'l'] as CardSize[]).map(size => (
                <button
                  key={size}
                  class={`btn ${cardSize === size ? 'active' : ''}`}
                  data-testid={`card-size-${size}`}
                  onClick={() => handleCardSize(size)}
                  title={`卡片 ${size.toUpperCase()} 尺寸`}
                >
                  {size.toUpperCase()}
                </button>
              ))}
            </div>
          )}
          <div style={{ flex: 1 }} />
          {/* 新建按钮组 */}
          <button class="btn" title="新建文件夹" onClick={() => setModal({ mode: 'mkdir' })}>+ 文件夹</button>
          <button class="btn" title="新建文件" onClick={() => setModal({ mode: 'touch' })}>+ 文件</button>
          {clipboard && (
            <button class="btn" title={`粘贴 ${clipboard.nodes.length} 项`} onClick={handlePaste} disabled={busy}>
              粘贴
            </button>
          )}
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '4px' }}>
            {children.length} 项
          </span>
        </div>
      )}

      {/* ── 面包屑 ─────────────────────────────────────────── */}
      <FolderBreadcrumb
        path={node.path}
        rootName={dirName}
        onNavigate={onSelect}
        tree={tree}
      />

      {/* ── 内容区 ─────────────────────────────────────────── */}
      {children.length === 0 ? (
        <div class="empty-state" data-testid="folder-empty" style={{ flex: 1 }}
          onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, node }) }}
        >
          <div class="empty-state-icon"><Icon name="inbox" size={40} aria-hidden="true" /></div>
          <div class="empty-state-text">空文件夹</div>
        </div>
      ) : viewMode === 'list' ? (
        <FolderListView
          nodes={children}
          currentPath={currentFilePath}
          onSelect={onSelect}
          selectionProps={selectionProps}
          onBgContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, node }) }}
          sortField={sortPref.field}
          sortOrder={sortPref.order}
          onSortChange={handleSortChange}
        />
      ) : viewMode === 'grid' ? (
        <FolderGridView
          nodes={children}
          cardSize={cardSize}
          currentPath={currentFilePath}
          focusPath={gridFocusPath}
          onSelect={onSelect}
          selectionProps={selectionProps}
          onBgContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, node }) }}
        />
      ) : (
        <FolderColumnView
          rootNode={node}
          tree={tree}
          onFileSelect={onSelect}
          theme={theme}
          onContextMenu={handleContextMenu}
          onLongPress={handleLongPress}
          showHidden={showHidden}
          sortField={sortPref.field}
          sortOrder={sortPref.order}
        />
      )}

      {/* ── 右键菜单 ───────────────────────────────────────── */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={buildCtxMenuItems(ctxMenu.node)}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* ── Modal 弹窗 ─────────────────────────────────────── */}
      {modal && (
        <ContextModal
          open={true}
          mode={modal.mode}
          initialValue={modal.mode === 'rename' ? modal.node?.name : ''}
          confirmMessage={modal.message}
          onConfirm={handleModalConfirm}
          onCancel={() => setModal(null)}
        />
      )}

      {/* ── BottomSheet（移动端）──────────────────────────── */}
      {bottomSheet && (
        <BottomSheet
          open={true}
          title={bottomSheet.node.name}
          items={buildBottomSheetItems(bottomSheet.node)}
          onClose={() => setBottomSheet(null)}
        />
      )}

      {/* ── 分享弹窗 ───────────────────────────────────────── */}
      {shareTarget && (
        <ShareDialog
          path={shareTarget.path}
          type={shareTarget.type as 'file' | 'folder'}
          name={shareTarget.name}
          onClose={() => setShareTarget(null)}
        />
      )}
    </div>
  )
}

export default FolderView
