import type { FunctionalComponent } from 'preact'
import { useCallback, useEffect, useState } from 'preact/hooks'
import { useTheme } from './hooks/useTheme.js'
import { useFileTree } from './hooks/useFileTree.js'
import { useFileContent } from './hooks/useFileContent.js'
import { useSearch } from './hooks/useSearch.js'
import { useSSE } from './hooks/useSSE.js'
import Sidebar from './components/Sidebar.js'
import ContentArea from './components/ContentArea.js'
import SingleFileView from './components/SingleFileView.js'
import ThemeToggle from './components/ThemeToggle.js'
import type { FileNode, WatchEvent } from '../types.js'
import type { ClipboardState } from './components/FolderView.js'

// 模式由 window.__VMD_MODE__ 注入（'dir' | 'single'）
declare global {
  interface Window {
    __VMD_MODE__: 'dir' | 'single'
    __VMD_DIR_NAME__: string
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

  // Dir mode
  return <DirModeApp theme={theme} onThemeToggle={toggle} />
}

interface DirModeProps {
  theme: 'dark' | 'light'
  onThemeToggle: () => void
}

const DirModeApp: FunctionalComponent<DirModeProps> = ({ theme, onThemeToggle }) => {
  const { tree, refresh } = useFileTree()
  const { content, loading, error, currentPath, loadFile, selectFile, saveFile, setContent } = useFileContent()
  const { query, setQuery, searchType, setSearchType, results, loading: searchLoading } = useSearch(tree)

  // selectedNode 记录当前选中项（可以是文件夹或文件）
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null)
  // 移动端 Sidebar 抽屉开关
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // 剪贴板（跨文件夹复制/剪切）
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null)

  const handleSSEEvent = useCallback((event: WatchEvent) => {
    if (event.type === 'tree-change') {
      refresh()
    } else if (event.type === 'reload' && currentPath) {
      loadFile(currentPath)
    }
  }, [currentPath, loadFile, refresh])

  const watchConnected = useSSE('/api/watch', handleSSEEvent)

  const handleSelect = useCallback((node: FileNode) => {
    setSelectedNode(node)
    // path='' 是根节点，push 到 '/'
    const url = node.path ? `/${node.path}` : '/'
    window.history.pushState({ path: node.path, isFolder: node.type === 'folder' }, '', url)
    if (node.type === 'file') {
      selectFile(node.path)
    }
    // 文件夹：直接用 tree 中已有的 children 数据，不调 API
  }, [selectFile])

  const handleSave = useCallback(async (path: string, text: string): Promise<boolean> => {
    const ok = await saveFile(path, text)
    if (ok) {
      setContent(text)
    }
    return ok
  }, [saveFile, setContent])

  const dirName = window.__VMD_DIR_NAME__ || 'Markdown 文件'

  // 页面初始加载：从 URL pathname 恢复文件或文件夹
  // tree 加载完成后再恢复，否则文件夹节点找不到
  useEffect(() => {
    const path = window.location.pathname.replace(/^\//, '')

    // 根路径（path=''）：等 tree 加载完后设置根节点（见下方 effect）
    if (!path) return

    // 先尝试从 tree 中找节点（文件夹场景）
    const node = findNodeByPath(tree, path)
    if (node) {
      setSelectedNode(node)
      if (node.type === 'file') selectFile(path)
      window.history.replaceState({ path, isFolder: node.type === 'folder' }, '', `/${path}`)
    } else if (tree.length === 0) {
      // tree 尚未加载，先 selectFile，等 tree 加载后若是文件夹会被覆盖
      selectFile(path)
      window.history.replaceState({ path }, '', `/${path}`)
    } else {
      selectFile(path)
      window.history.replaceState({ path }, '', `/${path}`)
    }
  }, [tree.length > 0 ? 'loaded' : 'empty'])  // tree 从空到有内容时重新执行一次

  // tree 变化时同步 selectedNode（SSE 刷新后保持最新 children）
  useEffect(() => {
    if (tree.length === 0) return
    const path = window.location.pathname.replace(/^\//, '')

    if (!path) {
      // 根路径：始终用最新 tree 更新根节点（保证 children 刷新）
      setSelectedNode(makeRootNode(tree, dirName))
      return
    }

    // 非根路径：若当前是文件夹视图，用新 tree 中的节点替换（刷新 children）
    const node = findNodeByPath(tree, path)
    if (node?.type === 'folder') {
      setSelectedNode(node)
    }
  }, [tree])

  // 处理浏览器前进/后退
  const handlePopState = useCallback((e: PopStateEvent) => {
    const path = e.state?.path ?? window.location.pathname.replace(/^\//, '')
    const isFolder = e.state?.isFolder

    // 根路径：恢复根节点视图
    if (!path) {
      setSelectedNode(makeRootNode(tree, dirName))
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
  }, [selectFile, tree, dirName])

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
        query={query}
        onQueryChange={setQuery}
        searchType={searchType}
        onTypeChange={setSearchType}
        searchResults={results}
        searchLoading={searchLoading}
        dirName={dirName}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
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
          />
      </div>
    </div>
  )
}

export default App
