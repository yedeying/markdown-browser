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
import SettingsDialog from './components/SettingsDialog.js'
import { watchUrl, fetchPathStat } from './utils/fsApi.js'
import { revealHiddenForPath, isHiddenPath } from './utils/hiddenFiles.js'
import { getShowHidden, setShowHidden, subscribePref } from './utils/prefs.js'
import type { FileNode, WatchEvent } from '../types.js'
import type { ClipboardState } from './components/FolderView.js'
import { clientPerfLog } from './utils/perfLog.js'

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
  // 多挂载模式：URL 前缀 /m/alias（须先算出来，供首屏隐藏直链引导）
  const urlPrefix = mountAlias ? `/m/${mountAlias}` : ''
  const buildUrl = (p: string) => `${urlPrefix}${p ? `/${p}` : '/'}`
  const stripPrefix = (pathname: string) => {
    let raw = pathname
    if (urlPrefix && raw.startsWith(urlPrefix)) {
      raw = raw.slice(urlPrefix.length).replace(/^\/+/, '')
    } else {
      raw = raw.replace(/^\/+/, '')
    }
    // window.location.pathname 保持浏览器 URL 编码（中文 → %E9...），
    // 若不先解码，后续 loadFile 的 encodeURI 会二次编码（% → %25），
    // 服务端 decodeURIComponent 后仍是非中文字面量 → 404 → 直出空白。
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }

  // 隐藏文件显隐：与 usePref 等价，但首屏若 URL 含隐藏段则同步打开开关，
  // 使首轮 tree/stat/file 即带 showHidden=1（避免先 404 再重拉）。
  const [showHidden, setShowHiddenState] = useState(() => {
    revealHiddenForPath(stripPrefix(window.location.pathname))
    return getShowHidden()
  })
  useEffect(() => subscribePref('showHidden', setShowHiddenState), [])
  const handleToggleShowHidden = useCallback(() => {
    setShowHidden(!showHidden)
  }, [showHidden])

  const { tree, loading: treeLoading, childErrors, refresh, loadChildren, ensurePathLoaded } = useFileTree(showHidden)
  const { content, loadedPath, loading, error, currentPath, loadFile, selectFile, saveFile, setContentForPath } = useFileContent()
  const { query, setQuery, searchType, setSearchType, results, loading: searchLoading } = useSearch(tree, showHidden)

  // selectedNode 记录当前选中项（可以是文件夹或文件）
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null)
  // 移动端 Sidebar 抽屉开关
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
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
      // 是否静默重载还是提示冲突由 ContentArea 根据 unsaved/viewMode 决定
      window.dispatchEvent(new CustomEvent('vmd:file-reload', { detail: { path: currentPath } }))
    }
  }, [currentPath, loadFile, refresh])

  const watchConnected = useSSE(watchUrl(), handleSSEEvent)

  const dirName = window.__VMD_DIR_NAME__ || 'Markdown Browser'
  const deepLinkDoneRef = useRef(false)
  /** 导航世代：深链异步完成前若用户已点别处，丢弃过期 setSelectedNode */
  const navGenRef = useRef(0)

  const handleSelect = useCallback((node: FileNode, fromSwipe = false) => {
    // 选中隐藏路径时打开开关（与直链同一并集策略）
    revealHiddenForPath(node.path)
    navGenRef.current++
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

  // SSE 静默重载：返回是否真的重载了（self-save 窗口内会被抑制），
  // ContentArea 据此决定是否还要恢复滚动位置
  const handleSilentReload = useCallback(async (): Promise<boolean> => {
    if (!currentPath) return false
    return await loadFile(currentPath)
  }, [currentPath, loadFile])

  const handleSave = useCallback(async (path: string, text: string): Promise<boolean> => {
    const ok = await saveFile(path, text)
    if (ok) {
      setContentForPath(path, text)
    }
    return ok
  }, [saveFile, setContentForPath])

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

  // 页面初始加载：从 URL pathname 恢复文件或文件夹
  useEffect(() => {
    if (tree.length === 0) return
    if (deepLinkDoneRef.current) return

    const path = stripPrefix(window.location.pathname)
    if (!path) return

    // 隐藏直链：首屏已 reveal；若状态尚未为 true 则再推一把并等待
    if (isHiddenPath(path) && !showHidden) {
      revealHiddenForPath(path)
      setShowHidden(true)
      return
    }

    deepLinkDoneRef.current = true
    const gen = ++navGenRef.current

    void (async () => {
      const existing = findNodeByPath(tree, path)
      if (existing) {
        if (gen !== navGenRef.current) return
        clientPerfLog('deepLink:hit', { path, type: existing.type, treeReady: tree.length })
        setSelectedNode(existing)
        if (existing.type === 'file') selectFile(path)
        else if (existing.type === 'folder') await loadChildren(path)
        if (gen !== navGenRef.current) return
        window.history.replaceState({ path, isFolder: existing.type === 'folder' }, '', buildUrl(path))
        return
      }

      const stat = await fetchPathStat(path)
      if (gen !== navGenRef.current) return
      if (!stat) {
        clientPerfLog('deepLink:stat-miss', { path })
        setSelectedNode({ name: path.split('/').pop() || path, type: 'file', path })
        selectFile(path)
        window.history.replaceState({ path, isFolder: false }, '', buildUrl(path))
        return
      }

      clientPerfLog('deepLink:stat', { path, type: stat.type })
      if (stat.type === 'folder') {
        await ensurePathLoaded(path, true)
        if (gen !== navGenRef.current) return
        setSelectedNode({ name: stat.name, type: 'folder', path })
        window.history.replaceState({ path, isFolder: true }, '', buildUrl(path))
      } else {
        await ensurePathLoaded(path, false)
        if (gen !== navGenRef.current) return
        setSelectedNode({ name: stat.name, type: 'file', path })
        selectFile(path)
        window.history.replaceState({ path, isFolder: false }, '', buildUrl(path))
      }
    })()
  }, [tree.length > 0 ? 'loaded' : 'empty', showHidden])

  // tree 变化时：仅在 URL 对应节点「出现 / 类型变化 / 路径变化」时更新 selectedNode。
  // 同路径不重写——文件夹 children 已在渲染时从 tree 解析；避免延迟 load 触发无意义
  // setSelectedNode，把树/列光标拽回或清空浏览进度。
  useEffect(() => {
    if (tree.length === 0) return
    const path = stripPrefix(window.location.pathname)

    if (!path) {
      setSelectedNode((prev) => (prev?.path === '' ? prev : makeRootNode(tree, dirName)))
      return
    }

    const node = findNodeByPath(tree, path)
    if (!node) return
    setSelectedNode((prev) => {
      if (prev?.path === node.path && prev?.type === node.type) return prev
      return node
    })
  }, [tree])

  // 浏览器前进/后退
  const handlePopState = useCallback((e: PopStateEvent) => {
    const path = e.state?.path ?? stripPrefix(window.location.pathname)
    const isFolder = e.state?.isFolder
    revealHiddenForPath(path)

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
      const node = findNodeByPath(tree, path) ?? { name: path.split('/').pop() || path, type: 'file' as const, path }
      setSelectedNode(node)
    }
  }, [selectFile, tree, dirName, urlPrefix])

  useEffect(() => {
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [handlePopState])

  // 注意：不要用 currentPath（异步加载结果）回写 selectedNode。
  // 快速上下键时旧请求后完成会把树光标拽回去；选中态以 handleSelect 的实时选择为准。

  return (
    <>
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
          showHidden={showHidden}
          onToggleShowHidden={handleToggleShowHidden}
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
          contentReady={!!currentPath && loadedPath === currentPath}
          loading={loading}
          error={error}
          theme={theme}
          onSave={handleSave}
          onSilentReload={handleSilentReload}
          watchConnected={watchConnected}
          onNavigate={(path: string) => {
            // navigate-file 内部触发，path 是文件路径
            const node = findNodeByPath(tree, path) ?? { name: path.split('/').pop() || path, type: 'file' as const, path }
            handleSelect(node)
          }}
            onToggleSidebar={() => setSidebarOpen(o => !o)}
            themeToggle={<ThemeToggle theme={theme} onToggle={onThemeToggle} />}
            onOpenSettings={() => setSettingsOpen(true)}
          selectedNode={
            // 始终用 tree 上的最新节点渲染文件夹，避免 mkdir/SSE 后 selectedNode 快照 children 过期
            selectedNode?.type === 'folder'
              ? (selectedNode.path === ''
                ? makeRootNode(tree, dirName)
                : (findNodeByPath(tree, selectedNode.path) ?? selectedNode))
              : selectedNode
          }
          tree={tree}
          onSelectNode={handleSelect}
          loadChildren={loadChildren}
          folderLoadError={
            selectedNode?.type === 'folder' ? childErrors[selectedNode.path] ?? null : null
          }
          onRetryLoadChildren={(path: string) => { void loadChildren(path, true) }}
          clipboard={clipboard}
          onCopy={(nodes) => setClipboard({ nodes, mode: 'copy' })}
          onCut={(nodes) => setClipboard({ nodes, mode: 'cut' })}
          onClearClipboard={() => setClipboard(null)}
          onSwipe={handleSwipe}
          shareMode={!!window.__VMD_SHARE_TOKEN__}
            showHidden={showHidden}
          />
        </div>
      </div>
      {settingsOpen && (
        <SettingsDialog
          onClose={() => setSettingsOpen(false)}
          currentMountAlias={mountAlias}
          // 分享链接的访客不是管理员，挂载设置对他们不可见
          mountConfigurable={!window.__VMD_SHARE_TOKEN__}
        />
      )}
    </>
  )
}

export default App
