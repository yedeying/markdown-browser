// 隐藏文件（点文件）过滤：用于文件树 / 文件夹视图 / 搜索结果的显隐切换。

export function isDotfile(name: string): boolean {
  return name.startsWith('.')
}

export function filterVisible<T extends { name: string }>(nodes: T[], showHidden: boolean): T[] {
  return showHidden ? nodes : nodes.filter(n => !isDotfile(n.name))
}

/**
 * 递归过滤树形结构：文件夹自身及其后代中的点文件/点文件夹同样按 showHidden 过滤。
 * showHidden=true 时原样返回（不拷贝），避免不必要的重渡染。
 */
export function filterTree<T extends { name: string; children?: T[] }>(nodes: T[], showHidden: boolean): T[] {
  if (showHidden) return nodes
  return filterVisible(nodes, showHidden).map(n =>
    n.children ? ({ ...n, children: filterTree(n.children, showHidden) } as T) : n
  )
}
