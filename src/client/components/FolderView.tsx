import { useState, useCallback, useEffect, useRef } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'
import type { FileNode } from '../../types.js'
import FolderBreadcrumb from './FolderBreadcrumb.js'
import FolderListView from './FolderListView.js'
import FolderGridView from './FolderGridView.js'
import FolderColumnView from './FolderColumnView.js'
import FolderMasonryView from './FolderMasonryView.js'
import MediaLightbox from './MediaLightbox.js'
import ContextMenu, { type ContextMenuItem } from './ContextMenu.js'
import ContextModal, { type ModalMode } from './ContextModal.js'
import BottomSheet, { type BottomSheetItem } from './BottomSheet.js'
import ShareDialog from './ShareDialog.js'
import UploadStatusPanel from './UploadStatusPanel.js'
import UploadConflictModal from './UploadConflictModal.js'
import { fsApi } from '../utils/fsApi.js'
import { filterVisible } from '../utils/hiddenFiles.js'
import { sortNodes } from '../utils/sortNodes.js'
import { type FolderViewPref, type SortField, type SortOrder } from '../utils/prefs.js'
import { usePref } from '../hooks/usePref.js'
import { showToast } from './ui/Toast.js'
import Icon from './ui/Icon.js'
import {
  buildMediaPlaylist,
  folderHasMedia,
  filterMasonryNodes,
  isMediaFile,
} from '../utils/galleryMedia.js'
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
import { uploadManager, type ConflictDecision } from '../utils/uploadManager.js'
import {
  filesFromDataTransfer,
  pickUploadDirectory,
  pickUploadFiles,
  type PickedFile,
} from '../utils/uploadPaths.js'
function countGridCols(testid: string = 'folder-grid'): number {
  const grid = document.querySelector(`[data-testid="${testid}"]`)
  if (!grid) return 1
  const cards = [...grid.querySelectorAll(testid === 'folder-masonry' ? '.masonry-tile' : '.folder-card')]
  if (cards.length === 0) return 1
  const top = cards[0].getBoundingClientRect().top
  let cols = 0
  for (const c of cards) {
    if (Math.abs(c.getBoundingClientRect().top - top) > 2) break
    cols++
  }
  return Math.max(1, cols)
}

/** 键盘移动光标：先改 DOM class，再同步 React state，避免整表重绘前边框/底色脱节 */
function applyKbFocus(mode: 'grid' | 'masonry', path: string): Element | null {
  const sel = mode === 'masonry' ? '.masonry-tile.kb-focus' : '.folder-card.kb-focus'
  for (const el of document.querySelectorAll(sel)) el.classList.remove('kb-focus')
  const next = document.querySelector(`[data-path="${CSS.escape(path)}"]`)
  next?.classList.add('kb-focus')
  return next
}

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
  /** 普通点击：退出多选后再打开 */
  onClearSelection: () => void
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
  /** 懒加载文件夹 children（列视图钻入 / 新建后强制刷新） */
  loadChildren?: (path: string, force?: boolean) => void
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
  loadChildren,
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
  const [ctxMenu, setCtxMenu] = useState<{
    x: number
    y: number
    /** null = 空白处（无目标菜单） */
    node: FileNode | null
  } | null>(null)

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

  // ── 上传：拖放高亮 / 菜单 / 冲突弹窗 ───────────────────────
  const [dropActive, setDropActive] = useState(false)
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false)
  const [uploadConflict, setUploadConflict] = useState<{
    path: string
    fileName: string
    resolve: (d: ConflictDecision) => void
  } | null>(null)
  const dragDepthRef = useRef(0)

  // Lightbox（文件夹内打开媒体）
  const [lightbox, setLightbox] = useState<{ startPath: string } | null>(null)
  /** 列视图当前浏览目录（最深一列），切出列视图时同步到外层 */
  const columnActiveFolderRef = useRef<FileNode | null>(null)
  /** 列内钻入路径（仅影响面包屑展示 / 瀑布流可见性，不改外层 selectedNode） */
  const [columnBrowsePath, setColumnBrowsePath] = useState<string | null>(null)

  // 隐藏文件过滤 + 排序（列表/网格/列视图共用同一份处理后的列表，保持一致）
  const children = sortNodes(filterVisible(node.children || [], showHidden), sortPref.field, sortPref.order)
  // 列视图：瀑布流入口按「当前选中列」目录判断，而非外层 FolderView 根
  const mediaScopeChildren = (() => {
    if (viewMode !== 'column' || columnBrowsePath == null || columnBrowsePath === node.path) {
      return children
    }
    const folder = columnBrowsePath === ''
      ? node
      : (findNodeByPath(tree, columnBrowsePath) ?? columnActiveFolderRef.current)
    if (!folder || folder.path !== columnBrowsePath) return children
    return sortNodes(filterVisible(folder.children || [], showHidden), sortPref.field, sortPref.order)
  })()
  const hasMedia = folderHasMedia(mediaScopeChildren)
  const effectiveView: FolderViewPref =
    viewMode === 'masonry' && !hasMedia ? 'grid' : viewMode
  const masonryNodes = filterMasonryNodes(children)
  const dirName = window.__VMD_DIR_NAME__ || '文件库'

  const handleColumnActiveFolder = useCallback((folder: FileNode) => {
    setColumnBrowsePath(folder.path)
  }, [])

  const [columnTruncateRequest, setColumnTruncateRequest] = useState<{ path: string; token: number } | null>(null)

  const handleBreadcrumbNavigate = useCallback((target: FileNode) => {
    if (effectiveView === 'column' && target.type === 'folder') {
      const root = node.path
      const withinColumnRoot =
        target.path === root
        || (root !== '' && target.path.startsWith(root + '/'))
      if (withinColumnRoot) {
        setColumnBrowsePath(target.path)
        setColumnTruncateRequest((prev) => ({
          path: target.path,
          token: (prev?.token ?? 0) + 1,
        }))
        return
      }
    }
    onSelect(target)
  }, [effectiveView, node.path, onSelect])

  const openNode = useCallback((target: FileNode) => {
    if (isMediaFile(target)) {
      setLightbox({ startPath: target.path })
      return
    }
    onSelect(target)
  }, [onSelect])

  // 网格键盘焦点（移动不打开，Enter 打开）
  const [gridFocusPath, setGridFocusPath] = useState<string | null>(null)
  const gridFocusPathRef = useRef<string | null>(null)
  const childrenRef = useRef(children)
  const masonryNodesRef = useRef(masonryNodes)
  const openNodeRef = useRef(openNode)
  const onSelectRef = useRef(onSelect)
  /** 列数缓存：避免每次方向键强制 layout 量一遍 */
  const gridColsCacheRef = useRef<{ testid: string; cols: number } | null>(null)
  gridFocusPathRef.current = gridFocusPath
  childrenRef.current = children
  masonryNodesRef.current = masonryNodes
  openNodeRef.current = openNode
  onSelectRef.current = onSelect

  useEffect(() => {
    const invalidate = () => { gridColsCacheRef.current = null }
    window.addEventListener('resize', invalidate)
    return () => window.removeEventListener('resize', invalidate)
  }, [])

  useEffect(() => {
    gridColsCacheRef.current = null
  }, [children.length, masonryNodes.length, cardSize])

  /** 网格/瀑布流：点击时同步键盘光标并退出多选 */
  const openNodeFromGrid = useCallback((target: FileNode) => {
    setSelectionMode(false)
    setSelectedPaths(new Set())
    setGridFocusPath(target.path)
    openNode(target)
  }, [openNode])

  // 切换文件夹时清空选中
  useEffect(() => {
    setSelectedPaths(new Set())
    setSelectionMode(false)
    setLastClickedPath(null)
    setCtxMenu(null)
    setGridFocusPath(null)
    setLightbox(null)
    setColumnBrowsePath(null)
    gridColsCacheRef.current = null
  }, [node.path])

  useEffect(() => {
    setGridFocusPath(null)
    gridColsCacheRef.current = null
    if (effectiveView !== 'column') setColumnBrowsePath(null)
  }, [effectiveView])

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

  // 列表 / 网格 / 瀑布流键盘导航（列视图由 FolderColumnView 自己处理）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (getNavFocus() !== 'folder') return
      // 键盘移动光标时退出多选
      if (selectionMode) {
        setSelectionMode(false)
        setSelectedPaths(new Set())
      }
      if (modal || ctxMenu || bottomSheet || shareTarget || lightbox) return
      if (isTypingTarget(e.target)) return
      if (isOverlayBlocking()) return

      const dir = normalizeNavKey(e)
      if (!dir) return

      const mode = document.querySelector('[data-testid="folder-masonry"]')
        ? 'masonry'
        : document.querySelector('[data-testid="folder-grid"]')
          ? 'grid'
          : document.querySelector('[data-testid="folder-list"]')
            ? 'list'
            : document.querySelector('.folder-columns-outer')
              ? 'column'
              : null
      if (!mode || mode === 'column') return

      const list = mode === 'masonry' ? masonryNodesRef.current : childrenRef.current
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
          if (curIdx >= 0) openNodeRef.current(list[curIdx])
          return
        }
        const nextIdx = stepIndex(curIdx, list.length, dir === 'down' ? 1 : -1)
        if (nextIdx < 0 || nextIdx === curIdx) return
        const next = list[nextIdx]
        onSelectRef.current(next)
        requestAnimationFrame(() => {
          scrollNavTarget(document.querySelector(`[data-path="${CSS.escape(next.path)}"]`))
        })
        return
      }

      // grid / masonry：方向键只移动光标；Enter 打开（不再用 → 进目录）
      if (dir === 'enter') {
        e.preventDefault()
        e.stopImmediatePropagation()
        const focused = document.querySelector(
          mode === 'masonry' ? '.masonry-tile.kb-focus' : '.folder-card.kb-focus',
        ) as HTMLElement | null
        if (focused) {
          const path = focused.getAttribute('data-path')
          const focus = path
            ? (list.find((n) => n.path === path) ?? {
                name: path.split('/').pop() || path,
                type: 'file' as const,
                path,
              })
            : null
          if (focus) openNodeRef.current(focus)
          return
        }
        const path = gridFocusPathRef.current
        const focus = path ? list.find((n) => n.path === path) : null
        if (focus) openNodeRef.current(focus)
        return
      }
      if (dir !== 'up' && dir !== 'down' && dir !== 'left' && dir !== 'right') return
      e.preventDefault()

      const testid = mode === 'masonry' ? 'folder-masonry' : 'folder-grid'
      let cols = gridColsCacheRef.current?.testid === testid
        ? gridColsCacheRef.current.cols
        : 0
      if (!cols) {
        cols = countGridCols(testid)
        gridColsCacheRef.current = { testid, cols }
      }
      const focusPath = gridFocusPathRef.current
      const curIdx = focusPath
        ? list.findIndex((n) => n.path === focusPath)
        : -1
      const nextIdx = stepGridIndex(curIdx, list.length, cols, dir)
      if (nextIdx < 0 || nextIdx === curIdx) return
      const next = list[nextIdx]
      setNavFocus('folder')
      // 同帧改 DOM，再 setState；去掉 rAF，减少「边框已到、底色未到」的观感
      gridFocusPathRef.current = next.path
      const el = applyKbFocus(mode, next.path)
      setGridFocusPath(next.path)
      scrollNavTarget(el)
    }

    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [
    selectionMode,
    modal,
    ctxMenu,
    bottomSheet,
    shareTarget,
    lightbox,
    currentFilePath,
  ])

  // ── 多选逻辑 ───────────────────────────────────────────────
  const clearMultiSelect = useCallback(() => {
    setSelectionMode(false)
    setSelectedPaths(new Set())
  }, [])

  /** 网格空白点击：取消多选与键盘单选光标 */
  const clearGridSelection = useCallback(() => {
    setSelectionMode(false)
    setSelectedPaths(new Set())
    setGridFocusPath(null)
  }, [])

  const handleToggleSelect = useCallback((path: string, e?: MouseEvent) => {
    setSelectionMode(true)
    setGridFocusPath(null)
    setLastClickedPath(path)
    if (e?.shiftKey && lastClickedPath) {
      const allPaths = children.map(n => n.path)
      const from = allPaths.indexOf(lastClickedPath)
      const to = allPaths.indexOf(path)
      if (from !== -1 && to !== -1) {
        const range = allPaths.slice(Math.min(from, to), Math.max(from, to) + 1)
        setSelectedPaths(new Set(range))
        return
      }
    }
    setSelectedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      if (next.size === 0) setSelectionMode(false)
      return next
    })
  }, [children, lastClickedPath])

  const handleEnterSelectionMode = useCallback((path: string) => {
    setSelectionMode(true)
    setGridFocusPath(null)
    setSelectedPaths(new Set([path]))
    setLastClickedPath(path)
  }, [])

  /** 框选：additive=true 时并入已选，否则替换 */
  const handleMarqueeSelect = useCallback((paths: string[], additive: boolean) => {
    if (paths.length === 0) return
    setSelectionMode(true)
    setGridFocusPath(null)
    setSelectedPaths(prev => {
      if (additive) return new Set([...prev, ...paths])
      return new Set(paths)
    })
    setLastClickedPath(paths[paths.length - 1] ?? null)
  }, [])

  // ── 文件管理操作 ──────────────────────────────────────────
  /** 获取"当前操作"的节点列表：多选有效则用多选，否则用右键目标 */
  const getTargetNodes = (fallbackNode: FileNode): FileNode[] => {
    if (selectedPaths.size > 1 && selectedPaths.has(fallbackNode.path)) {
      return children.filter(n => selectedPaths.has(n.path))
    }
    // 仅选中一项且右键该项：仍按单项目标（菜单不含「N 项」）
    if (selectedPaths.size === 1 && selectedPaths.has(fallbackNode.path)) {
      return [fallbackNode]
    }
    return [fallbackNode]
  }

  const refreshParentsOf = useCallback((paths: string[]) => {
    const parents = new Set<string>()
    for (const p of paths) {
      parents.add(p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
    }
    for (const parent of parents) {
      void loadChildren?.(parent, true)
    }
  }, [loadChildren])

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
      refreshParentsOf(paths)
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
      refreshParentsOf([target.path])
    } else {
      showToast(`重命名失败: ${res.error}`, 'error')
    }
  }

  const handleMkdir = async (name: string) => {
    if (busy) return
    setBusy(true)
    const parent =
      effectiveView === 'column' && columnBrowsePath != null
        ? columnBrowsePath
        : node.path
    const newPath = parent ? `${parent}/${name}` : name
    const res = await fsApi.mkdir(newPath)
    setBusy(false)
    setModal(null)
    if (res.ok) {
      showToast('文件夹已创建', 'success')
      void loadChildren?.(parent, true)
    } else {
      showToast(`创建失败: ${res.error}`, 'error')
    }
  }

  const handleTouch = async (name: string) => {
    if (busy) return
    setBusy(true)
    const parent =
      effectiveView === 'column' && columnBrowsePath != null
        ? columnBrowsePath
        : node.path
    const newPath = parent ? `${parent}/${name}` : name
    const res = await fsApi.touch(newPath)
    setBusy(false)
    setModal(null)
    if (res.ok) {
      showToast('文件已创建', 'success')
      void loadChildren?.(parent, true)
    } else {
      showToast(`创建失败: ${res.error}`, 'error')
    }
  }

  const handlePaste = async () => {
    if (!clipboard || busy) return
    setBusy(true)
    const paths = clipboard.nodes.map(n => n.path)
    // 列视图空白粘贴到当前浏览列；根目录 path 为 ''
    const dest =
      effectiveView === 'column' && columnBrowsePath != null
        ? columnBrowsePath
        : node.path
    const res = clipboard.mode === 'copy'
      ? await fsApi.copy(paths, dest)
      : await fsApi.move(paths, dest)
    setBusy(false)
    if (res.ok) {
      const n2 = 'copied' in res ? res.copied : 'moved' in res ? res.moved : 0
      showToast(`${clipboard.mode === 'copy' ? '复制' : '移动'}了 ${n2} 项`, 'success')
      if (clipboard.mode === 'cut') {
        onClearClipboard?.()
        refreshParentsOf(paths)
      }
      void loadChildren?.(dest, true)
    } else {
      showToast(`操作失败: ${res.error}`, 'error')
    }
  }

  const currentBrowsePath = useCallback((): string => {
    return effectiveView === 'column' && columnBrowsePath != null
      ? columnBrowsePath
      : node.path
  }, [effectiveView, columnBrowsePath, node.path])

  const startUpload = useCallback((picked: PickedFile[], targetDir: string) => {
    if (shareMode || picked.length === 0) return
    const n = uploadManager.enqueue(picked, targetDir)
    if (n > 0) showToast(`已加入 ${n} 个上传任务`, 'success')
  }, [shareMode])

  const openFilePicker = useCallback((targetDir: string, directory: boolean) => {
    // 必须在用户手势栈内同步启动选择器；rAF / 先 setState 会导致目录选择失效
    const pickPromise = directory ? pickUploadDirectory() : pickUploadFiles()
    setUploadMenuOpen(false)
    setCtxMenu(null)
    void pickPromise.then((picked) => startUpload(picked, targetDir))
  }, [startUpload])

  useEffect(() => {
    uploadManager.setConflictHandler(({ path, fileName }) =>
      new Promise<ConflictDecision>((resolve) => {
        setUploadConflict({ path, fileName, resolve })
      }),
    )
    return () => uploadManager.setConflictHandler(null)
  }, [])

  useEffect(() => {
    // 刷新上传目标目录 + 文件直接父目录（嵌套上传时两者不同）
    const timers = new Map<string, ReturnType<typeof setTimeout>>()
    const schedule = (dir: string) => {
      const prev = timers.get(dir)
      if (prev) clearTimeout(prev)
      timers.set(dir, setTimeout(() => {
        timers.delete(dir)
        void loadChildren?.(dir, true)
      }, 50))
    }
    const unsub = uploadManager.onFileDone((path, targetDir) => {
      const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
      schedule(targetDir)
      if (parent !== targetDir) schedule(parent)
    })
    return () => {
      unsub()
      for (const t of timers.values()) clearTimeout(t)
      timers.clear()
    }
  }, [loadChildren])

  useEffect(() => {
    if (!uploadMenuOpen) return
    const close = () => setUploadMenuOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [uploadMenuOpen])

  // ── 右键菜单项构造 ─────────────────────────────────────────
  /** 空白处：仅新建 / 粘贴，不以当前文件夹为「目标」 */
  const buildBgCtxMenuItems = (): ContextMenuItem[] => {
    if (shareMode) return []
    return [
      {
        label: '新建文件夹',
        icon: 'folder-plus',
        onClick: () => setModal({ mode: 'mkdir' }),
      },
      {
        label: '新建文件',
        icon: 'file-plus',
        onClick: () => setModal({ mode: 'touch' }),
      },
      {
        label: '上传文件',
        icon: 'download',
        onClick: () => openFilePicker(currentBrowsePath(), false),
      },
      {
        label: '上传文件夹',
        icon: 'folder-plus',
        onClick: () => openFilePicker(currentBrowsePath(), true),
      },
      {
        label: '粘贴',
        icon: 'paste',
        separator: true,
        disabled: !clipboard,
        onClick: handlePaste,
      },
    ]
  }

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
          onClick: () => openNode(target),
        },
      ]
    }

    return [
      {
        label: target.type === 'folder' ? '打开文件夹' : '打开文件',
        icon: target.type === 'folder' ? 'folder-open' : 'file',
        onClick: () => openNode(target),
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
      }, {
        label: '上传文件',
        icon: 'download',
        onClick: () => openFilePicker(target.path, false),
      }, {
        label: '上传文件夹',
        icon: 'folder-plus',
        onClick: () => openFilePicker(target.path, true),
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
  const openBgCtxMenu = useCallback((e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (shareMode) return
    setCtxMenu({ x: e.clientX, y: e.clientY, node: null })
  }, [shareMode])

  // ── 右键处理（PC）────────────────────────────────────────
  const handleContextMenu = useCallback((targetNode: FileNode, e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // 右键未选中项：取消多选，仅以该项为目标；右键已选中项：保留多选菜单
    setSelectedPaths(prev => {
      if (prev.size > 0 && !prev.has(targetNode.path)) {
        setSelectionMode(false)
        return new Set()
      }
      return prev
    })
    setCtxMenu({ x: e.clientX, y: e.clientY, node: targetNode })
  }, [])

  /** 菜单已打开时再次右键：命中测试后在新位置打开定制菜单 */
  const handleCtxMenuRelocate = useCallback((e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const x = e.clientX
    const y = e.clientY
    const overlay = document.querySelector('.ctx-overlay') as HTMLElement | null
    const menuEl = document.querySelector('.ctx-menu') as HTMLElement | null
    if (overlay) overlay.style.pointerEvents = 'none'
    if (menuEl) menuEl.style.pointerEvents = 'none'
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    if (overlay) overlay.style.pointerEvents = ''
    if (menuEl) menuEl.style.pointerEvents = ''

    if (!el) {
      setCtxMenu(null)
      return
    }
    const pathEl = el.closest('[data-path]') as HTMLElement | null
    const path = pathEl?.dataset?.path
    if (path) {
      const hit =
        childrenRef.current.find(n => n.path === path)
        ?? masonryNodesRef.current.find(n => n.path === path)
        ?? findNodeByPath(tree, path)
      if (hit) {
        setSelectedPaths(prev => {
          if (prev.size > 0 && !prev.has(hit.path)) {
            setSelectionMode(false)
            return new Set()
          }
          return prev
        })
        setCtxMenu({ x, y, node: hit })
        return
      }
    }
    if (el.closest('[data-testid="folder-view"]')) {
      if (shareMode) {
        setCtxMenu(null)
        return
      }
      setCtxMenu({ x, y, node: null })
      return
    }
    setCtxMenu(null)
  }, [tree, shareMode])

  // ── 长按处理（移动端）────────────────────────────────────
  const handleLongPress = useCallback((targetNode: FileNode) => {
    setBottomSheet({ node: targetNode })
  }, [])

  // ── 工具栏事件 ─────────────────────────────────────────────
  const handleViewMode = (mode: FolderViewPref) => {
    setNavFocus('folder')
    // 列视图钻入只改本地 stack；切到其它视图时把当前最深目录提交给外层
    if (effectiveView === 'column' && mode !== 'column') {
      const folder = columnActiveFolderRef.current
      if (folder && folder.path !== node.path) {
        onSelect(folder)
      }
    }
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
    onClearSelection: clearMultiSelect,
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
      class={`folder-view${dropActive ? ' folder-view-drop-active' : ''}`}
      data-testid="folder-view"
      onPointerDown={() => setNavFocus('folder')}
      // 捕获阶段统一吃掉浏览器菜单，避免卡片间隙等漏网
      onContextMenuCapture={(e) => { e.preventDefault() }}
      onDragEnter={(e) => {
        if (shareMode) return
        e.preventDefault()
        dragDepthRef.current++
        setDropActive(true)
      }}
      onDragLeave={() => {
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
        if (dragDepthRef.current === 0) setDropActive(false)
      }}
      onDragOver={(e) => {
        if (shareMode) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={async (e) => {
        if (shareMode) return
        e.preventDefault()
        dragDepthRef.current = 0
        setDropActive(false)
        let targetDir = currentBrowsePath()
        const pathEl = (e.target as HTMLElement | null)?.closest?.('[data-path]') as HTMLElement | null
        const hitPath = pathEl?.dataset?.path
        if (hitPath) {
          const hit =
            children.find(n => n.path === hitPath)
            ?? findNodeByPath(tree, hitPath)
          if (hit?.type === 'folder') targetDir = hit.path
        }
        const picked = await filesFromDataTransfer(e.dataTransfer)
        startUpload(picked, targetDir)
      }}
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
            class={`btn folder-view-btn ${effectiveView === 'list' ? 'active' : ''}`}
            data-testid="view-btn-list"
            onClick={() => handleViewMode('list')}
            title="列表视图"
          ><Icon name="list" size={14} aria-hidden="true" /> 列表</button>
          <button
            class={`btn folder-view-btn ${effectiveView === 'grid' ? 'active' : ''}`}
            data-testid="view-btn-grid"
            onClick={() => handleViewMode('grid')}
            title="网格视图"
          ><Icon name="grid" size={14} aria-hidden="true" /> 网格</button>
          <button
            class={`btn folder-view-btn ${effectiveView === 'column' ? 'active' : ''}`}
            data-testid="view-btn-column"
            onClick={() => handleViewMode('column')}
            title="列视图"
          ><Icon name="columns" size={14} aria-hidden="true" /> 列</button>
          {hasMedia && (
            <button
              class={`btn folder-view-btn ${effectiveView === 'masonry' ? 'active' : ''}`}
              data-testid="view-btn-masonry"
              onClick={() => handleViewMode('masonry')}
              title="瀑布流视图"
            ><Icon name="masonry" size={14} aria-hidden="true" /> 瀑布流</button>
          )}
          {effectiveView === 'grid' && (
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
          {/* 新建 / 上传按钮组 */}
          {!shareMode && (
            <div class="folder-toolbar-upload-wrap">
              <button
                class="btn"
                title="上传"
                data-testid="upload-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  setUploadMenuOpen(v => !v)
                }}
              >
                上传
              </button>
              {uploadMenuOpen && (
                <div class="upload-menu" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    data-testid="upload-menu-files"
                    onClick={() => openFilePicker(currentBrowsePath(), false)}
                  >
                    上传文件
                  </button>
                  <button
                    type="button"
                    data-testid="upload-menu-folder"
                    onClick={() => openFilePicker(currentBrowsePath(), true)}
                  >
                    上传文件夹
                  </button>
                </div>
              )}
            </div>
          )}
          <button class="btn" title="新建文件夹" onClick={() => setModal({ mode: 'mkdir' })}>+ 文件夹</button>
          <button class="btn" title="新建文件" onClick={() => setModal({ mode: 'touch' })}>+ 文件</button>          {clipboard && (
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
        path={effectiveView === 'column' && columnBrowsePath != null ? columnBrowsePath : node.path}
        rootName={dirName}
        onNavigate={handleBreadcrumbNavigate}
        tree={tree}
      />

      {/* ── 内容区 ─────────────────────────────────────────── */}
      {children.length === 0 ? (
        <div class="empty-state" data-testid="folder-empty" style={{ flex: 1 }}
          onContextMenu={openBgCtxMenu}
        >
          <div class="empty-state-icon"><Icon name="inbox" size={40} aria-hidden="true" /></div>
          <div class="empty-state-text">空文件夹</div>
        </div>
      ) : effectiveView === 'list' ? (
        <FolderListView
          nodes={children}
          currentPath={currentFilePath}
          onSelect={openNode}
          selectionProps={selectionProps}
          onBgContextMenu={openBgCtxMenu}
          sortField={sortPref.field}
          sortOrder={sortPref.order}
          onSortChange={handleSortChange}
          onMarqueeSelect={handleMarqueeSelect}
        />
      ) : effectiveView === 'grid' ? (
        <FolderGridView
          nodes={children}
          cardSize={cardSize}
          currentPath={null}
          focusPath={selectionMode ? null : gridFocusPath}
          onSelect={openNodeFromGrid}
          selectionProps={selectionProps}
          onBgContextMenu={openBgCtxMenu}
          onMarqueeSelect={handleMarqueeSelect}
          onBlankClick={clearGridSelection}
        />
      ) : effectiveView === 'masonry' ? (
        <FolderMasonryView
          nodes={masonryNodes}
          currentPath={null}
          focusPath={selectionMode ? null : gridFocusPath}
          onSelect={openNodeFromGrid}
          selectionProps={selectionProps}
          onBgContextMenu={openBgCtxMenu}
          onMarqueeSelect={handleMarqueeSelect}
        />
      ) : (
        <FolderColumnView
          rootNode={node}
          tree={tree}
          onFileSelect={openNode}
          onOpenFull={onSelect}
          activeFolderRef={columnActiveFolderRef}
          onActiveFolderChange={handleColumnActiveFolder}
          truncateRequest={columnTruncateRequest}
          loadChildren={loadChildren}
          theme={theme}
          onContextMenu={handleContextMenu}
          onLongPress={handleLongPress}
          onBgContextMenu={openBgCtxMenu}
          showHidden={showHidden}
          sortField={sortPref.field}
          sortOrder={sortPref.order}
        />
      )}

      {lightbox && (
        <MediaLightbox
          playlist={buildMediaPlaylist(children)}
          startPath={lightbox.startPath}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* ── 右键菜单 ───────────────────────────────────────── */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.node ? buildCtxMenuItems(ctxMenu.node) : buildBgCtxMenuItems()}
          onClose={() => setCtxMenu(null)}
          onContextMenuAt={handleCtxMenuRelocate}
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

      {!shareMode && <UploadStatusPanel />}
      {uploadConflict && (
        <UploadConflictModal
          path={uploadConflict.path}
          fileName={uploadConflict.fileName}
          onResolve={(d) => {
            const resolve = uploadConflict.resolve
            setUploadConflict(null)
            resolve(d)
          }}
        />
      )}
    </div>
  )
}

export default FolderView
