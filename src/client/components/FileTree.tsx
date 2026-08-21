import { useState, useEffect, useImperativeHandle, useRef, useCallback } from 'preact/hooks'
import type { Ref } from 'preact'
import { forwardRef } from 'preact/compat'
import type { FileNode, SearchResult } from '../../types.js'
import Icon from './ui/Icon.js'
import { getFileIconName } from '../utils/nodeIcon.js'
import {
  flattenVisibleTree,
  isFolderViewMounted,
  isOverlayBlocking,
  isTypingTarget,
  getNavFocus,
  normalizeNavKey,
  requestColumnSelectFirst,
  scrollNavTarget,
  setNavFocus,
  stepIndex,
  treeNodeTestId,
  collectCompactPaths,
} from '../utils/keyboardNav.js'
import { setPref } from '../utils/prefs.js'

const STORAGE_KEY = 'vmd_expanded_folders'

function loadExpanded(): Set<string> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? new Set(JSON.parse(saved)) : new Set()
  } catch {
    return new Set()
  }
}

function saveExpanded(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]))
  } catch {}
}

export interface FileTreeHandle {
  collapseAll: () => void
}

interface FileTreeProps {
  nodes: FileNode[]
  currentPath: string | null
  onSelect: (node: FileNode) => void
  /** 文件夹展开时触发（懒加载 children） */
  onExpand?: (path: string) => void
  level?: number
  searchResults?: SearchResult[] | null
  mobileMode?: boolean
  /** 由根实例注入，子树共享同一份展开态 */
  expanded?: Set<string>
  onToggleFolder?: (node: FileNode) => void
  /** 根注入：实时高亮路径（子树只读） */
  cursorPath?: string | null
  onMoveCursor?: (path: string) => void
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

function isSpaceKey(e: KeyboardEvent): boolean {
  return e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar' || e.keyCode === 32
}

const FileTree = forwardRef<FileTreeHandle, FileTreeProps>(({
  nodes,
  currentPath,
  onSelect,
  onExpand,
  level = 0,
  searchResults,
  mobileMode = false,
  expanded: expandedProp,
  onToggleFolder: onToggleFolderProp,
  cursorPath: cursorPathProp,
  onMoveCursor: onMoveCursorProp,
}, ref) => {
  // 仅根实例持有展开态；子树通过 props 共享，避免「键盘已展开、UI 仍折叠」
  const [expandedLocal, setExpandedLocal] = useState<Set<string>>(loadExpanded)
  const expanded = expandedProp ?? expandedLocal

  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const currentPathRef = useRef(currentPath)
  currentPathRef.current = currentPath

  // 实时光标：根持有 state；子树用 props
  const [cursorPathLocal, setCursorPathLocal] = useState(currentPath)
  const cursorPathRef = useRef(currentPath)
  const pendingCursorRef = useRef<string | null>(null)
  const isCursorRoot = cursorPathProp === undefined
  const cursorPath = isCursorRoot ? cursorPathLocal : cursorPathProp

  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  const onExpandRef = useRef(onExpand)
  onExpandRef.current = onExpand

  const moveCursorLocal = useCallback((path: string) => {
    pendingCursorRef.current = path
    cursorPathRef.current = path
    setCursorPathLocal(path)
  }, [])
  const moveCursor = onMoveCursorProp ?? moveCursorLocal

  // 外部选中追上 pending，或无 pending 时（如 popstate）对齐光标 —— 仅根
  useEffect(() => {
    if (!isCursorRoot) return
    const pending = pendingCursorRef.current
    if (pending != null) {
      if (currentPath === pending) {
        pendingCursorRef.current = null
        cursorPathRef.current = currentPath
        setCursorPathLocal(currentPath)
      }
      return
    }
    cursorPathRef.current = currentPath
    setCursorPathLocal(currentPath)
  }, [currentPath, isCursorRoot])

  const applyExpanded = useCallback((next: Set<string>) => {
    expandedRef.current = next
    saveExpanded(next)
    setExpandedLocal(new Set(next))
  }, [])

  const toggleFolder = useCallback((node: FileNode) => {
    if (onToggleFolderProp) {
      onToggleFolderProp(node)
      return
    }
    const prev = expandedRef.current
    const next = new Set(prev)
    const expanding = !next.has(node.path)
    if (!expanding) {
      next.delete(node.path)
    } else {
      for (const p of collectCompactPaths(node)) {
        next.add(p)
      }
      next.add(node.path)
    }
    applyExpanded(next)
    // 副作用放在 setState 外，避免与父树 lazy-load 更新打架
    if (expanding) {
      for (const p of collectCompactPaths(node)) {
        onExpandRef.current?.(p)
      }
      onExpandRef.current?.(node.path)
    }
  }, [onToggleFolderProp, applyExpanded])

  useImperativeHandle(ref, () => ({
    collapseAll: () => {
      applyExpanded(new Set())
    },
  }))

  // 当前文件变化时自动展开父目录（不展开当前选中的目录本身）
  useEffect(() => {
    if (level !== 0) return
    if (!currentPath) return
    const parts = currentPath.split('/')
    if (parts.length <= 1) return

    const prev = expandedRef.current
    const next = new Set(prev)
    let changed = false
    let path = ''
    const toLoad: string[] = []
    for (let i = 0; i < parts.length - 1; i++) {
      path = path ? `${path}/${parts[i]}` : parts[i]
      if (!next.has(path)) {
        next.add(path)
        toLoad.push(path)
        changed = true
      }
    }
    if (!changed) return
    applyExpanded(next)
    for (const p of toLoad) onExpandRef.current?.(p)
  }, [currentPath, level, applyExpanded])

  // 侧栏树键盘导航（仅根实例）
  useEffect(() => {
    if (level !== 0 || mobileMode) return

    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      if (isOverlayBlocking()) return

      // 空格：toggle 当前选中目录（不依赖可见列表索引，避免 curIdx<0 静默失败）
      if (isSpaceKey(e)) {
        if (e.metaKey || e.ctrlKey || e.altKey) return
        const path = cursorPathRef.current
          ?? currentPathRef.current
          ?? (document.querySelector('.file-list .folder-row.active') as HTMLElement | null)?.dataset?.path
          ?? null
        if (!path) return
        const cur = findNodeByPath(nodesRef.current, path)
        if (!cur || cur.type !== 'folder') return
        e.preventDefault()
        e.stopImmediatePropagation()
        setNavFocus('tree')
        toggleFolder(cur)
        return
      }

      const dir = normalizeNavKey(e)
      if (!dir) return

      // 焦点在文件夹内容区时整组方向键让出
      if (getNavFocus() === 'folder' && isFolderViewMounted()) return

      const matchPaths = searchResults
        ? new Set(searchResults.map((r) => r.filePath))
        : null
      const visible = flattenVisibleTree(nodesRef.current, expandedRef.current, matchPaths)
      if (visible.length === 0) return

      const curPath = cursorPathRef.current ?? currentPathRef.current
      const curIdx = curPath
        ? visible.findIndex((n) => n.path === curPath)
        : -1

      if (dir === 'down' || dir === 'up') {
        e.preventDefault()
        e.stopImmediatePropagation()
        const nextIdx = stepIndex(curIdx, visible.length, dir === 'down' ? 1 : -1)
        // 已在边界或仅一项：索引不变，勿重复 onSelect（避免无意义 state 更新）
        if (nextIdx < 0 || nextIdx === curIdx) return
        const next = visible[nextIdx]
        moveCursor(next.path)
        setNavFocus('tree')
        onSelect(next)
        requestAnimationFrame(() => {
          scrollNavTarget(document.querySelector(`[data-testid="${treeNodeTestId(next.path)}"]`))
        })
        return
      }

      if (curIdx < 0) return
      const cur = visible[curIdx]

      // ← / h：目录树禁用
      if (dir === 'left') {
        e.preventDefault()
        e.stopImmediatePropagation()
        return
      }

      // Enter / → / l：打开目录并聚焦列视图第一列第一项；文件则照常打开
      if (dir === 'enter' || dir === 'right') {
        e.preventDefault()
        e.stopImmediatePropagation()
        moveCursor(cur.path)
        if (cur.type === 'folder') {
          setPref('folderView', 'column')
          requestColumnSelectFirst()
          onSelect(cur)
          // onSelect → Sidebar 会 setNavFocus('tree')，此处再夺回内容区焦点
          setNavFocus('folder')
        } else if (dir === 'enter') {
          onSelect(cur)
        }
        return
      }
    }

    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [level, mobileMode, searchResults, onSelect, toggleFolder, moveCursor])

  const matchPaths = searchResults
    ? new Set(searchResults.map(r => r.filePath))
    : null

  function folderHasMatch(folder: FileNode): boolean {
    if (!matchPaths) return true
    for (const child of folder.children || []) {
      if (child.type === 'file' && matchPaths.has(child.path)) return true
      if (child.type === 'folder' && folderHasMatch(child)) return true
    }
    return false
  }

  return (
    <>
      {nodes.map((node) => {
        if (node.type === 'folder') {
          if (matchPaths && !folderHasMatch(node)) return null

          const isExpanded = expanded.has(node.path)
          const isActive = cursorPath === node.path

          const compactPaths = collectCompactPaths(node)
          const compactChain: FileNode[] = [node]
          if (isExpanded && compactPaths.length > 1) {
            let cur = node
            for (let i = 1; i < compactPaths.length; i++) {
              const child = (cur.children || []).find(c => c.path === compactPaths[i])
              if (child) { compactChain.push(child); cur = child }
            }
          }
          const displayNode = compactChain[compactChain.length - 1]

          return (
            <div key={node.path} class="tree-item">
              <div
                class={`folder-row ${isActive ? 'active' : ''}`}
                style={{ paddingLeft: `${level * 12 + 8}px` }}
                data-testid={`tree-node-${node.path.replace(/\//g, '-')}`}
                data-path={node.path}
                onClick={() => {
                  moveCursor(node.path)
                  onSelect(node)
                }}
              >
                <span
                  class={`folder-toggle ${isExpanded ? 'expanded' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleFolder(node)
                  }}
                  aria-label={isExpanded ? '折叠' : '展开'}
                >▶</span>
                <Icon name="folder" size={15} class="folder-icon" aria-hidden="true" />
                <span class="folder-name" style={{ fontSize: '13px', flex: 1 }}>
                  {compactChain.map((n, i) => (
                    <>
                      {i > 0 && <span class="compact-sep">/</span>}
                      <span
                        key={n.path}
                        onClick={i > 0 ? (e) => {
                          e.stopPropagation()
                          moveCursor(n.path)
                          onSelect(n)
                        } : undefined}
                        class={i > 0 ? 'compact-seg' : ''}
                      >{n.name}</span>
                    </>
                  ))}
                </span>
                {mobileMode && (
                  <span
                    class="folder-goto-btn"
                    title="进入文件夹"
                    onClick={(e) => {
                      e.stopPropagation()
                      moveCursor(node.path)
                      onSelect(node)
                    }}
                  >
                    →
                  </span>
                )}
              </div>
              {isExpanded && (
                <div class="folder-children">
                  {displayNode.children == null ? (
                    <div class="tree-skeleton-row" style={{ paddingLeft: `${(level + 1) * 12 + 8}px` }}>
                      <div class="tree-skeleton-icon" />
                      <div class="tree-skeleton-line" style={{ width: '40%' }} />
                    </div>
                  ) : (
                    <FileTree
                      nodes={displayNode.children}
                      currentPath={currentPath}
                      onSelect={onSelect}
                      onExpand={onExpand}
                      level={level + 1}
                      searchResults={searchResults}
                      mobileMode={mobileMode}
                      expanded={expanded}
                      onToggleFolder={toggleFolder}
                      cursorPath={cursorPath}
                      onMoveCursor={moveCursor}
                    />
                  )}
                </div>
              )}
            </div>
          )
        }

        if (matchPaths && !matchPaths.has(node.path)) return null

        return (
          <div
            key={node.path}
            class={`file-row ${cursorPath === node.path ? 'active' : ''}`}
            style={{ marginLeft: `${level * 12}px` }}
            data-testid={`tree-node-${node.path.replace(/\//g, '-')}`}
            data-path={node.path}
            onClick={() => {
              moveCursor(node.path)
              onSelect(node)
            }}
          >
            <Icon name={getFileIconName(node.name)} size={15} class="file-icon" aria-hidden="true" />
            <div class="file-info">
              <div class="file-name">{node.name}</div>
              <div class="file-meta">{node.size}</div>
            </div>
          </div>
        )
      })}
    </>
  )
}) as (props: FileTreeProps & { ref?: Ref<FileTreeHandle> }) => JSX.Element

export default FileTree
