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

/** tree 未展开时仍可导航：合成文件夹节点，由 App loadChildren 补全 */
function folderNodeForPath(tree: FileNode[], fullPath: string, name: string): FileNode {
  return findNodeByPath(tree, fullPath) ?? {
    name,
    type: 'folder',
    path: fullPath,
  }
}

interface Props {
  path: string            // e.g. "learning/ai/notes"；'' 表示根目录
  rootName: string        // 根目录名称
  onNavigate: (node: FileNode) => void
  tree: FileNode[]
}

const FolderBreadcrumb: FunctionalComponent<Props> = ({ path, rootName, onNavigate, tree }) => {
  const parts = path ? path.split('/') : []

  const segments: Array<{ name: string; fullPath: string }> = []
  for (let i = 0; i < parts.length; i++) {
    segments.push({
      name: parts[i],
      fullPath: parts.slice(0, i + 1).join('/'),
    })
  }

  const handleSegmentClick = (segPath: string, name: string) => {
    onNavigate(folderNodeForPath(tree, segPath, name))
  }

  const handleRootClick = () => {
    if (segments.length === 0) return
    onNavigate({ name: rootName, type: 'folder', path: '', children: tree })
  }

  const isRoot = segments.length === 0

  return (
    <div class="folder-breadcrumb" data-testid="folder-breadcrumb">
      {isRoot ? (
        <span class="folder-breadcrumb-seg" style={{ cursor: 'default', fontWeight: 600, color: 'var(--text)' }}>
          {rootName}
        </span>
      ) : (
        <span class="folder-breadcrumb-seg" onClick={handleRootClick}>
          {rootName}
        </span>
      )}
      {segments.map((seg, i) => (
        <span key={seg.fullPath} class="folder-breadcrumb-seg-wrap">
          <span class="folder-breadcrumb-sep">›</span>
          {i < segments.length - 1 ? (
            <span
              class="folder-breadcrumb-seg"
              onClick={() => handleSegmentClick(seg.fullPath, seg.name)}
            >
              {seg.name}
            </span>
          ) : (
            <span class="folder-breadcrumb-seg" style={{ cursor: 'default', fontWeight: 600, color: 'var(--text)' }}>
              {seg.name}
            </span>
          )}
        </span>
      ))}
    </div>
  )
}

export default FolderBreadcrumb
