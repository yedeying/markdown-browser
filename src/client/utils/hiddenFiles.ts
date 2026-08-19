// 隐藏文件（点文件）过滤：用于文件树 / 文件夹视图 / 搜索结果的显隐切换。

export function isDotfile(name: string): boolean {
  return name.startsWith('.')
}

/**
 * 判断一个相对路径是否应视为隐藏：只要任意路径分段是点文件/点文件夹即为隐藏。
 * 例如 ".private/plain-name.md" 中文件名本身不是点文件，但父目录 ".private" 是，
 * 因此整条路径仍应视为隐藏，避免搜索结果泄露隐藏目录下的文件。
 */
export function isHiddenPath(path: string): boolean {
  return path.split('/').some(seg => seg !== '' && isDotfile(seg))
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
