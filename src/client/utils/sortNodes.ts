// 文件夹视图（列表 / 网格 / 列）共用的排序逻辑，保证三种视图排序结果一致。
import type { FileNode } from '../../types.js'
import { getFileType } from './fileType.js'
import type { SortField, SortOrder } from './prefs.js'

export function getTypeLabel(node: FileNode): string {
  if (node.type === 'folder') return '文件夹'
  switch (getFileType(node.name)) {
    case 'markdown': return 'Markdown'
    case 'image':    return '图片'
    case 'video':    return '视频'
    case 'code':     return '代码'
    case 'text':     return '文本'
    default:         return '文件'
  }
}

function parseSizeBytes(size?: string): number {
  if (!size) return 0
  const match = size.match(/^([\d.]+)\s*([KMGT]?)/)
  if (!match) return 0
  const num = parseFloat(match[1])
  const unit = match[2]
  const multipliers: Record<string, number> = { '': 1, K: 1024, M: 1024 * 1024, G: 1024 ** 3, T: 1024 ** 4 }
  return num * (multipliers[unit] ?? 1)
}

/** 文件夹优先，其余按 field/order 排序；返回新数组，不修改入参。 */
export function sortNodes<T extends FileNode>(nodes: T[], field: SortField, order: SortOrder): T[] {
  return [...nodes].sort((a, b) => {
    const folderFirst = (a.type === 'folder' ? 0 : 1) - (b.type === 'folder' ? 0 : 1)
    if (folderFirst !== 0) return folderFirst
    let cmp = 0
    if (field === 'name') cmp = a.name.localeCompare(b.name)
    else if (field === 'type') cmp = getTypeLabel(a).localeCompare(getTypeLabel(b))
    else if (field === 'size') cmp = parseSizeBytes(a.size) - parseSizeBytes(b.size)
    return order === 'asc' ? cmp : -cmp
  })
}
