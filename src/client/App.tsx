import type { FunctionalComponent } from 'preact'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { useTheme } from './hooks/useTheme.js'
import { useFileTree } from './hooks/useFileTree.js'
import { useFileContent } from './hooks/useFileContent.js'
import { useSearch } from './hooks/useSearch.js'
import { useSSE } from './hooks/useSSE.js'
import Sidebar from './components/Sidebar.js'
import ContentArea from './components/ContentArea.js'
import SingleFileView from './components/SingleFileView.js'
import ShareFileView from './components/ShareFileView.js'
import ThemeToggle from './components/ThemeToggle.js'
import MountLanding from './components/MountLanding.js'
import AdminPanel from './components/AdminPanel.js'
import MountSelector from './components/MountSelector.js'
import { watchUrl } from './utils/fsApi.js'
import type { FileNode, WatchEvent } from '../types.js'
import type { ClipboardState } from './components/FolderView.js'

// 模式由服务端注入（'dir' | 'single' | 'multi'）
declare global {
  interface Window {
    __VMD_MODE__: 'dir' | 'single' | 'multi'
    __VMD_DIR_NAME__: string
    __VMD_SHARE_TOKEN__?: string
    __VMD_SHARE_TYPE__?: 'file' | 'folder'
    __VMD_SHARE_PATH__?: string
    __VMD_MOUNTS__?: Array<{ alias: string; name: string }>
    __VMD_CURRENT_MOUNT__?: string
  }
}

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

/** 根据 tree 构造虚拟根节点（path=''，children=tree） */
function makeRootNode(tree: FileNode[], dirName: string): FileNode {
  return { name: dirName, type: 'folder', path: '', children: tree }
}

const App: FunctionalComponent = () => {
  const { theme, toggle } = useTheme()
  const mode = window.__VMD_MODE__ || 'dir'

  // 单文件分享模式：直接渲染文件预览，无侧边栏
  if (window.__VMD_SHARE_TOKEN__ && window.__VMD_SHARE_TYPE__ === 'file') {
    return <ShareFileView />
  }

  if (mode === 'single') {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--header-bg)' }}>
          <ThemeToggle theme={theme} onToggle={toggle} />
        </div>
        <SingleFileView theme={theme} />
      </div>
    )
  }

  // 多挂载模式：根据 URL 分发
  if (mode === 'multi') {
    return <MultiModeApp theme={theme} onThemeToggle={toggle} />
  }

  // Dir mode
  return <DirModeApp theme={theme} onThemeToggle={toggle} />
}

// ============================================================
// 多挂载模式：landing / admin / mount
// ============================================================

interface MultiProps {
  theme: 'dark' | 'light'
  onThemeToggle: () => void
}

const MultiModeApp: FunctionalComponent<MultiProps> = ({ theme, onThemeToggle }) => {
  const [route, setRoute] = useState(() => parseMultiRoute(window.location.pathname))

  useEffect(() => {
    const onPop = () => setRoute(parseMultiRoute(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const mounts = window.__VMD_MOUNTS__ || []

  if (route.kind === 'admin') {
    return (
      <AdminPanel
        theme={theme}
        onThemeToggle={onThemeToggle}
        onNavigateHome={() => {
          window.history.pushState({}, '', '/')
          setRoute({ kind: 'landing' })
        }}
      />
    )
  }

  if (route.kind === 'mount') {
    // 设置当前挂载点供 fsApi 使用
    window.__VMD_CURRENT_MOUNT__ = route.alias
    const m = mounts.find(x => x.alias === route.alias)
    if (!m) {
      // 未知挂载点：回到 landing
      return (
        <MountLanding
          mounts={mounts}
          theme={theme}
          onThemeToggle={onThemeToggle}
          errorMsg={`挂载点不存在: ${route.alias}`}
          onOpenAdmin={() => {
            window.history.pushState({}, '', '/admin')
            setRoute({ kind: 'admin' })
          }}
        />
      )
    }
    // 挂载点内部文件路径（去掉 /m/alias 前缀）
    window.__VMD_DIR_NAME__ = m.name
    return <DirModeApp theme={theme} onThemeToggle={onThemeToggle} mountAlias={route.alias} />
  }

  // landing
  window.__VMD_CURRENT_MOUNT__ = undefined
  return (
    <MountLanding
      mounts={mounts}
      theme={theme}
      onThemeToggle={onThemeToggle}
      onOpenAdmin={() => {
        window.history.pushState({}, '', '/admin')
        setRoute({ kind: 'admin' })
      }}
    />
  )
}

type MultiRoute =
  | { kind: 'landing' }
  | { kind: 'admin' }
  | { kind: 'mount'; alias: string; inner: string }

function parseMultiRoute(pathname: string): MultiRoute {
  if (pathname === '/' || pathname === '') return { kind: 'landing' }
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return { kind: 'admin' }
  const m = pathname.match(/^\/m\/([a-zA-Z0-9_-]+)(\/.*)?$/)
  if (m) {
    return { kind: 'mount', alias: m[1], inner: m[2] || '/' }
  }
  return { kind: 'landing' }
}

interface DirModeProps {
  theme: 'dark' | 'light'
  onThemeToggle: () => void
  /** 多挂载模式下当前挂载点 alias，单挂载模式留空 */
  mountAlias?: string
}

const DirModeApp: FunctionalComponent<DirModeProps> = ({ theme, onThemeToggle, mountAlias }) => {
  const { tree, loading: treeLoading, refresh, loadChildren } = useFileTree()
  const { content, loading, error, currentPath, loadFile, selectFile, saveFile, setContent } = useFileContent()
  const { query, setQuery, searchType, setSearchType, results, loading: searchLoading } = useSearch(tree)

  // 多挂载模式：URL 前缀 /m/alias
  const urlPrefix = mountAlias ? `/m/${mountAlias}` : ''
  const buildUrl = (p: string) => `${urlPrefix}${p ? `/${p}` : '/'}`
  const stripPrefix = (pathname: string) => {
    if (urlPrefix && pathname.startsWith(urlPrefix)) {
      return pathname.slice(urlPrefix.length).replace(/^\/+/, '')
    }
    return pathname.replace(/^\/+/, '')
  }

  // selectedNode 记录当前选中项（可以是文件夹或文件）
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null)
  // 移动端 Sidebar 抽屉开关
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // 剪贴板（跨文件夹复制/剪切）
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null)
  // 应用内导航栈（手势前进/后退，不依赖浏览器历史，避免退到登录页）
  const navStackRef = useRef<FileNode[]>([])
  const navIndexRef = useRef<number>(-1)
  // 导航历史状态（用于手势判断）
  const [hasNavHistory, setHasNavHistory] = useState(false)

  const handleSSEEvent = useCallback((event: WatchEvent) => {
    if (event.type === 'tree-change') {
      refresh(event.affectedPath)
    } else if (event.type === 'reload' && currentPath) {
      loadFile(currentPath)
    }
  }, [currentPath, loadFile, refresh])

  const watchConnected = useSSE(watchUrl(), handleSSEEvent)

  const handleSelect = useCallback((node: FileNode, fromSwipe = false) => {
    setSelectedNode(node)
    // path='' 是根节点
    const url = buildUrl(node.path)
    window.history.pushState({ path: node.path, isFolder: node.type === 'folder' }, '', url)
    if (node.type === 'file') {
      selectFile(node.path)
    } else if (node.type === 'folder' && node.path) {
      // 懒加载：进入文件夹时预加载下一层
      loadChildren(node.path)
    }
    if (!fromSwipe) {
      const stack = navStackRef.current
      const idx = navIndexRef.current
      stack.splice(idx + 1)
      stack.push(node)
      navIndexRef.current = stack.length - 1
      setHasNavHistory(stack.length - 1 > 0)
    }
  }, [selectFile, loadChildren, urlPrefix])

  const handleSave = useCallback(async (path: string, text: string): Promise<boolean> => {
    const ok = await saveFile(path, text)
    if (ok) {
      setContent(text)
    }
    return ok
  }, [saveFile, setContent])

  // 应用内手势后退（右滑）：在导航栈里向前走
  const handleSwipeBack = useCallback(() => {
    const idx = navIndexRef.current
    if (idx <= 0) return false
    const prev = navStackRef.current[idx - 1]
    navIndexRef.current = idx - 1
    setHasNavHistory(idx - 1 > 0)
    handleSelect(prev, true)
    return true
  }, [handleSelect])

  // 应用内手势前进（左滑）：在导航栈里向后走
  const handleSwipeForward = useCallback(() => {
    const stack = navStackRef.current
    const idx = navIndexRef.current
    if (idx >= stack.length - 1) return false
    const next = stack[idx + 1]
    navIndexRef.current = idx + 1
    setHasNavHistory(idx + 1 > 0)
    handleSelect(next, true)
    return true
  }, [handleSelect])

  // 统一手势处理：右滑时，有历史则后退，无历史则展开侧边栏
  const handleSwipe = useCallback((direction: 'left' | 'right') => {
    if (direction === 'right') {
      // 右滑：有历史则后退，无历史则展开侧边栏
      const didGoBack = handleSwipeBack()
      if (!didGoBack) {
        setSidebarOpen(true)
      }
    } else {
      // 左滑：前进
      handleSwipeForward()
    }
  }, [handleSwipeBack, handleSwipeForward])

  const dirName = window.__VMD_DIR_NAME__ || 'Markdown Browser'

  // 页面初始加载：从 URL pathname 恢复文件或文件夹
  useEffect(() => {
    const path = stripPrefix(window.location.pathname)

    // 根路径：等 tree 加载完后设置根节点（见下方 effect）
    if (!path) return

    const node = findNodeByPath(tree, path)
    if (node) {
      setSelectedNode(node)
      if (node.type === 'file') selectFile(path)
      else if (node.type === 'folder') loadChildren(path)
      window.history.replaceState({ path, isFolder: node.type === 'folder' }, '', buildUrl(path))
    } else if (tree.length === 0) {
      selectFile(path)
      window.history.replaceState({ path }, '', buildUrl(path))
    } else {
      selectFile(path)
      window.history.replaceState({ path }, '', buildUrl(path))
    }
  }, [tree.length > 0 ? 'loaded' : 'empty'])

  // tree 变化时同步 selectedNode
  useEffect(() => {
    if (tree.length === 0) return
    const path = stripPrefix(window.location.pathname)

    if (!path) {
      setSelectedNode(makeRootNode(tree, dirName))
      return
    }

    const node = findNodeByPath(tree, path)
    if (node?.type === 'folder') {
      setSelectedNode(node)
    }
  }, [tree])

  // 浏览器前进/后退
  const handlePopState = useCallback((e: PopStateEvent) => {
    const path = e.state?.path ?? stripPrefix(window.location.pathname)
    const isFolder = e.state?.isFolder

    if (!path) {
      setSelectedNode(makeRootNode(tree, dirName))
      setHasNavHistory(false)
      return
    }

    if (isFolder) {
      const node = findNodeByPath(tree, path)
      if (node) setSelectedNode(node)
    } else {
      selectFile(path)
      const node = findNodeByPath(tree, path)
      if (node) setSelectedNode(node)
    }
  }, [selectFile, tree, dirName, urlPrefix])

  useEffect(() => {
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [handlePopState])

  // currentPath 变化时同步 selectedNode（针对文件选择）
  useEffect(() => {
    if (!currentPath) return
    if (selectedNode?.path === currentPath) return
    const node = findNodeByPath(tree, currentPath)
    if (node) setSelectedNode(node)
  }, [currentPath])

  return (
    <div class="app-layout">
      <Sidebar
        tree={tree}
        currentPath={selectedNode?.path ?? null}
        onSelect={handleSelect}
        onExpandFolder={(path) => loadChildren(path)}
        query={query}
        onQueryChange={setQuery}
        searchType={searchType}
        onTypeChange={setSearchType}
        searchResults={results}
        searchLoading={searchLoading}
        dirName={dirName}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        treeLoading={treeLoading}
        headerExtra={
          mountAlias ? (
            <MountSelector
              currentAlias={mountAlias}
              mounts={window.__VMD_MOUNTS__ || []}
            />
          ) : null
        }
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <ContentArea
          filePath={currentPath}
          content={content}
          loading={loading}
          error={error}
          theme={theme}
          onSave={handleSave}
          watchConnected={watchConnected}
          onNavigate={(path: string) => {
            // navigate-file 内部触发，path 是文件路径
            const node = findNodeByPath(tree, path) ?? { name: path.split('/').pop() || path, type: 'file' as const, path }
            handleSelect(node)
          }}
          onToggleSidebar={() => setSidebarOpen(o => !o)}
          themeToggle={<ThemeToggle theme={theme} onToggle={onThemeToggle} />}
          selectedNode={
            // 根节点（path=''）时动态带入最新 tree，避免 tree 更新后 children 过期
            selectedNode?.path === '' ? makeRootNode(tree, dirName) : selectedNode
          }
          tree={tree}
          onSelectNode={handleSelect}
          clipboard={clipboard}
          onCopy={(nodes) => setClipboard({ nodes, mode: 'copy' })}
          onCut={(nodes) => setClipboard({ nodes, mode: 'cut' })}
          onClearClipboard={() => setClipboard(null)}
          onSwipe={handleSwipe}
          shareMode={!!window.__VMD_SHARE_TOKEN__}
        />
      </div>
    </div>
  )
}

export default App
