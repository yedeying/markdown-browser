import { useState, useEffect, useImperativeHandle } from 'preact/hooks'
import type { Ref } from 'preact'
import { forwardRef } from 'preact/compat'
import type { FileNode, SearchResult } from '../../types.js'
import { getFileType } from '../utils/fileType.js'

function getFileIcon(name: string): string {
  switch (getFileType(name)) {
    case 'markdown':    return '📝'
    case 'image':       return '🖼'
    case 'video':       return '🎬'
    case 'code':        return '📄'
    case 'text':        return '📃'
    default:            return '📎'
  }
}

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

/**
 * 快展：从 node 开始，递归收集所有"仅有一个子目录（无文件）"的后代目录路径。
 * 返回的路径列表包含 node 本身及所有应自动展开的子孙目录。
 */
function collectCompactPaths(node: FileNode): string[] {
  const paths: string[] = [node.path]
  let cur = node
  while (true) {
    const children = cur.children || []
    // 只有一个子节点且该子节点是文件夹，才继续展开
    if (children.length === 1 && children[0].type === 'folder') {
      cur = children[0]
      paths.push(cur.path)
    } else {
      break
    }
  }
  return paths
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
}

const FileTree = forwardRef<FileTreeHandle, FileTreeProps>(({
  nodes,
  currentPath,
  onSelect,
  onExpand,
  level = 0,
  searchResults,
  mobileMode = false,
}, ref) => {
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded)

  useImperativeHandle(ref, () => ({
    collapseAll: () => {
      const empty = new Set<string>()
      setExpanded(empty)
      saveExpanded(empty)
    },
  }))

  // 当前文件变化时自动展开父目录
  useEffect(() => {
    if (!currentPath) return
    const parts = currentPath.split('/')
    let path = ''
    const newExpanded = new Set(expanded)
    for (let i = 0; i < parts.length - 1; i++) {
      path = path ? `${path}/${parts[i]}` : parts[i]
      newExpanded.add(path)
      // 懒加载：触发每个祖先目录的 children 加载
      onExpand?.(path)
    }
    if (newExpanded.size !== expanded.size) {
      setExpanded(newExpanded)
      saveExpanded(newExpanded)
    }
  }, [currentPath])

  const toggleFolder = (node: FileNode) => {
    const next = new Set(expanded)
    if (next.has(node.path)) {
      next.delete(node.path)
    } else {
      // 展开：快展——同时展开所有单子目录链
      for (const p of collectCompactPaths(node)) {
        next.add(p)
        onExpand?.(p)
      }
      // 顶层展开也要触发懒加载（即使 children 为空时也需要）
      onExpand?.(node.path)
    }
    setExpanded(next)
    saveExpanded(next)
  }

  // 搜索结果集合（快速查找）
  const matchPaths = searchResults
    ? new Set(searchResults.map(r => r.filePath))
    : null

  // 递归判断文件夹下是否有匹配的文件
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
          // 搜索模式下隐藏无匹配子节点的目录
          if (matchPaths && !folderHasMatch(node)) return null

          const isExpanded = expanded.has(node.path)
          const isActive = currentPath === node.path

          // 快展：若已展开且仅有一个子目录，把子目录名合并到标题显示
          // 收集连续的单子目录链，渲染为 "a / b / c" 形式
          const compactPaths = collectCompactPaths(node)
          // compactPaths[0] 是 node 本身，后续是自动合并的子孙
          // 只有在展开状态下才合并显示；未展开时只显示 node.name
          const compactChain: FileNode[] = [node]
          if (isExpanded && compactPaths.length > 1) {
            let cur = node
            for (let i = 1; i < compactPaths.length; i++) {
              const child = (cur.children || []).find(c => c.path === compactPaths[i])
              if (child) { compactChain.push(child); cur = child }
            }
          }
          // 实际渲染的子节点是 compactChain 末尾节点的 children
          const displayNode = compactChain[compactChain.length - 1]

          return (
            <div key={node.path} class="tree-item">
              <div
                class={`folder-row ${isActive ? 'active' : ''}`}
                style={{ paddingLeft: `${level * 12 + 8}px` }}
                data-testid={`tree-node-${node.path.replace(/\//g, '-')}`}
                onClick={() => {
                  if (mobileMode) {
                    toggleFolder(node)
                  } else {
                    toggleFolder(node)
                    onSelect(node)
                  }
                }}
              >
                <span class={`folder-toggle ${isExpanded ? 'expanded' : ''}`}>▶</span>
                <span class="folder-icon">📁</span>
                <span class="folder-name" style={{ fontSize: '13px', flex: 1 }}>
                  {compactChain.map((n, i) => (
                    <>
                      {i > 0 && <span class="compact-sep">/</span>}
                      <span
                        key={n.path}
                        onClick={i > 0 ? (e) => { e.stopPropagation(); onSelect(n) } : undefined}
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
                      onSelect(node)
                    }}
                  >
                    →
                  </span>
                )}
              </div>
              {isExpanded && displayNode.children && (
                <FileTree
                  nodes={displayNode.children}
                  currentPath={currentPath}
                  onSelect={onSelect}
                  onExpand={onExpand}
                  level={level + 1}
                  searchResults={searchResults}
                  mobileMode={mobileMode}
                />
              )}
            </div>
          )
        }

        // 搜索过滤
        if (matchPaths && !matchPaths.has(node.path)) return null

        return (
          <div
            key={node.path}
            class={`file-row ${currentPath === node.path ? 'active' : ''}`}
            style={{ marginLeft: `${level * 12}px` }}
            data-testid={`tree-node-${node.path.replace(/\//g, '-')}`}
            onClick={() => onSelect(node)}
          >
            <span class="file-icon">{getFileIcon(node.name)}</span>
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
