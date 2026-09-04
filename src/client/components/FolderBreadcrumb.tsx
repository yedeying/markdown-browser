import type { FunctionalComponent } from 'preact'
import type { FileNode } from '../../types.js'
import Icon from './ui/Icon.js'

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
    <nav class="folder-breadcrumb" data-testid="folder-breadcrumb" aria-label="路径">
      {isRoot ? (
        <span class="folder-breadcrumb-seg is-first is-current" aria-current="page">
          <Icon name="home" size={14} aria-hidden="true" />
          <span class="folder-breadcrumb-label">{rootName}</span>
        </span>
      ) : (
        <button
          type="button"
          class="folder-breadcrumb-seg is-first"
          onClick={handleRootClick}
          title={rootName}
        >
          <Icon name="home" size={14} aria-hidden="true" />
          <span class="folder-breadcrumb-label">{rootName}</span>
        </button>
      )}
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1
        if (isLast) {
          return (
            <span
              key={seg.fullPath}
              class="folder-breadcrumb-seg is-current"
              aria-current="page"
              title={seg.name}
            >
              <span class="folder-breadcrumb-label">{seg.name}</span>
            </span>
          )
        }
        return (
          <button
            key={seg.fullPath}
            type="button"
            class="folder-breadcrumb-seg"
            onClick={() => handleSegmentClick(seg.fullPath, seg.name)}
            title={seg.name}
          >
            <span class="folder-breadcrumb-label">{seg.name}</span>
          </button>
        )
      })}
    </nav>
  )
}

export default FolderBreadcrumb
