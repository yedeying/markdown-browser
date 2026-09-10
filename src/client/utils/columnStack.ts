import type { FileNode } from '../../types.js'

export function findNodeByPath(nodes: FileNode[], path: string): FileNode | null {
  for (const n of nodes) {
    if (n.path === path) return n
    if (n.children) {
      const hit = findNodeByPath(n.children, path)
      if (hit) return hit
    }
  }
  return null
}

/**
 * tree 更新后同步列栈：刷新各列节点引用，已删除路径截断。
 * 虚拟根 path==='' 不在 tree 数组内，不得当作「找不到」而整栈回退。
 */
export function syncColumnStackFromTree(
  prev: FileNode[],
  tree: FileNode[],
  rootNode: FileNode,
): FileNode[] {
  const next: FileNode[] = []
  for (let i = 0; i < prev.length; i++) {
    const n = prev[i]
    if (i === 0 && n.path === '') {
      next.push({ ...n, children: tree })
      continue
    }
    const fresh = findNodeByPath(tree, n.path)
    if (!fresh || fresh.type !== 'folder') break
    next.push(fresh)
  }

  if (next.length === 0) {
    if (!rootNode.path) {
      return [{ ...rootNode, children: tree }]
    }
    return [findNodeByPath(tree, rootNode.path) ?? rootNode]
  }

  if (!rootNode.path) {
    next[0] = { ...next[0], children: tree }
  }

  if (
    next.length === prev.length
    && next.every((n, i) => {
      const p = prev[i]
      if (n === p) return true
      // 虚拟根每次都会换 children 引用；路径与其余列引用一致即可视为未变深
      if (i === 0 && n.path === '' && p.path === '' && n.children === tree && p.children === tree) {
        return true
      }
      return false
    })
  ) {
    return prev
  }
  return next
}
