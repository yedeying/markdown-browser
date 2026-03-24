import type { FunctionalComponent } from 'preact'
import type { FileNode } from '../../types.js'

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

interface Props {
  path: string            // e.g. "learning/ai/notes"；'' 表示根目录
  rootName: string        // 根目录名称
  onNavigate: (node: FileNode) => void
  tree: FileNode[]
}

const FolderBreadcrumb: FunctionalComponent<Props> = ({ path, rootName, onNavigate, tree }) => {
  // 将 path 分割为段，并计算每段对应的路径
  const parts = path ? path.split('/') : []

  // 每段对应路径：parts[0] → parts[0], parts[0]+'/'+parts[1] → ...
  const segments: Array<{ name: string; fullPath: string }> = []
  for (let i = 0; i < parts.length; i++) {
    segments.push({
      name: parts[i],
      fullPath: parts.slice(0, i + 1).join('/'),
    })
  }

  const handleSegmentClick = (segPath: string) => {
    const node = findNodeByPath(tree, segPath)
    if (node) onNavigate(node)
  }

  // 点击根节点：构造虚拟根节点（path=''，children=tree）
  const handleRootClick = () => {
    // 只有不在根目录时才可点击
    if (segments.length === 0) return
    onNavigate({ name: rootName, type: 'folder', path: '', children: tree })
  }

  const isRoot = segments.length === 0

  return (
    <div class="folder-breadcrumb">
      {/* 根节点 */}
      {isRoot ? (
        // 当前就是根，不可点击
        <span class="folder-breadcrumb-seg" style={{ cursor: 'default', fontWeight: 600, color: 'var(--text)' }}>
          {rootName}
        </span>
      ) : (
        // 非根：可点击跳回根目录
        <span class="folder-breadcrumb-seg" onClick={handleRootClick}>
          {rootName}
        </span>
      )}
      {segments.map((seg, i) => (
        <>
          <span class="folder-breadcrumb-sep">›</span>
          {i < segments.length - 1 ? (
            // 非最后段：可点击
            <span
              class="folder-breadcrumb-seg"
              onClick={() => handleSegmentClick(seg.fullPath)}
            >
              {seg.name}
            </span>
          ) : (
            // 最后一段（当前目录）不可点击
            <span class="folder-breadcrumb-seg" style={{ cursor: 'default', fontWeight: 600, color: 'var(--text)' }}>
              {seg.name}
            </span>
          )}
        </>
      ))}
    </div>
  )
}

export default FolderBreadcrumb
