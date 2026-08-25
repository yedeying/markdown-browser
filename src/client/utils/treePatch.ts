import type { FileNode } from '../../types.js'

/**
 * 合并新旧 children：浅层刷新不得抹掉已懒加载的更深子树。
 * - 新节点无 children → 保留旧子树
 * - 两边都有 → 按 path 对齐后递归合并
 * - 旧有新无 → 视为已删除（不保留）
 */
export function mergeChildLists(
  prevChildren: FileNode[] | undefined,
  nextChildren: FileNode[],
): FileNode[] {
  if (!prevChildren?.length) return nextChildren
  const prevByPath = new Map(prevChildren.map((c) => [c.path, c]))
  return nextChildren.map((next) => {
    const prev = prevByPath.get(next.path)
    if (!prev || prev.type !== 'folder' || next.type !== 'folder') return next
    if (next.children == null && prev.children != null) {
      return { ...next, children: prev.children }
    }
    if (next.children != null && prev.children != null) {
      return { ...next, children: mergeChildLists(prev.children, next.children) }
    }
    return next
  })
}

/** 将 target path 的 children 替换为 newChildren（与已加载子树合并） */
export function patchChildren(
  nodes: FileNode[],
  targetPath: string,
  newChildren: FileNode[],
): FileNode[] {
  if (targetPath === '') return mergeChildLists(nodes, newChildren)
  return nodes.map((n) => {
    if (n.type !== 'folder') return n
    if (n.path === targetPath) {
      return { ...n, children: mergeChildLists(n.children, newChildren) }
    }
    if (targetPath.startsWith(n.path + '/') && n.children) {
      return { ...n, children: patchChildren(n.children, targetPath, newChildren) }
    }
    return n
  })
}
