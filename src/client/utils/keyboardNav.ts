import type { FileNode } from '../../types.js'

export type NavDir = 'up' | 'down' | 'left' | 'right' | 'enter'

/** 焦点在可编辑控件时，导航快捷键应让出（checkbox/radio 不算输入）。 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as { closest?: unknown }).closest !== 'function') return false
  const el = target as Element
  if (el.closest('textarea, select, [contenteditable="true"], [contenteditable=""], .cm-editor, .cm-content')) {
    return true
  }
  const input = el.closest('input')
  if (!input) return false
  const type = (input.getAttribute('type') || 'text').toLowerCase()
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color'].includes(type)
}

/** 对话框 / 菜单 / 底栏打开时禁用导航。 */
export function isOverlayBlocking(root: ParentNode = document): boolean {
  return !!(
    root.querySelector(
      '.modal-overlay, .dialog-overlay, .ctx-menu, .context-menu, .bottom-sheet-overlay, .share-dialog-overlay, .media-lightbox-overlay',
    )
    || root.querySelector('.bottom-sheet.open, .bottom-sheet[data-open="true"]')
  )
}

/** 文件夹内容区已挂载时，侧栏树默认不抢 j/k（可由 navFocus 覆盖）。 */
export function isFolderViewMounted(root: ParentNode = document): boolean {
  return !!root.querySelector('[data-testid="folder-view"]')
}

/** 键盘导航焦点：tree=侧栏目录树；folder=内容区文件夹视图（列/列表/网格） */
export type NavFocus = 'tree' | 'folder'

let navFocus: NavFocus = 'tree'
const navFocusListeners = new Set<() => void>()

export function getNavFocus(): NavFocus {
  return navFocus
}

export function setNavFocus(next: NavFocus): void {
  if (navFocus === next) return
  navFocus = next
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.navFocus = next
  }
  for (const listener of navFocusListeners) listener()
}

// 测试 / 调试：与模块状态同步的读写入口
if (typeof window !== 'undefined') {
  ;(window as unknown as { __VMD_SET_NAV_FOCUS__?: typeof setNavFocus }).__VMD_SET_NAV_FOCUS__ = setNavFocus
  ;(window as unknown as { __VMD_GET_NAV_FOCUS__?: typeof getNavFocus }).__VMD_GET_NAV_FOCUS__ = getNavFocus
}

export function subscribeNavFocus(listener: () => void): () => void {
  navFocusListeners.add(listener)
  return () => { navFocusListeners.delete(listener) }
}

export function isColumnViewMounted(root: ParentNode = document): boolean {
  return !!root.querySelector('.folder-columns-outer')
}

/** 树 Enter 打开目录后，通知列视图选中第一列第一项 */
let pendingColumnSelectFirst = false
const columnSelectFirstListeners = new Set<() => void>()

export function requestColumnSelectFirst(): void {
  pendingColumnSelectFirst = true
  const notify = () => {
    for (const listener of columnSelectFirstListeners) listener()
  }
  // 多次通知：覆盖「列视图尚未 subscribe」与「同路径不触发 path effect」两种时序
  queueMicrotask(notify)
  setTimeout(notify, 0)
  setTimeout(notify, 32)
}

export function consumeColumnSelectFirst(): boolean {
  if (!pendingColumnSelectFirst) return false
  pendingColumnSelectFirst = false
  return true
}

export function subscribeColumnSelectFirst(listener: () => void): () => void {
  columnSelectFirstListeners.add(listener)
  return () => { columnSelectFirstListeners.delete(listener) }
}

export function normalizeNavKey(e: KeyboardEvent): NavDir | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null
  switch (e.key) {
    case 'j':
    case 'ArrowDown':
      return 'down'
    case 'k':
    case 'ArrowUp':
      return 'up'
    case 'h':
    case 'ArrowLeft':
      return 'left'
    case 'l':
    case 'ArrowRight':
      return 'right'
    case 'Enter':
      return 'enter'
    default:
      return null
  }
}

export function clampIndex(index: number, length: number): number {
  if (length <= 0) return -1
  if (index < 0) return 0
  if (index >= length) return length - 1
  return index
}

/**
 * 快展：与 FileTree.collectCompactPaths 一致——连续「仅一个子文件夹」链。
 */
export function collectCompactPaths(node: FileNode): string[] {
  const paths: string[] = [node.path]
  let cur = node
  while (true) {
    const children = cur.children || []
    if (children.length === 1 && children[0].type === 'folder') {
      cur = children[0]
      paths.push(cur.path)
    } else {
      break
    }
  }
  return paths
}

export function parentPath(path: string): string | null {
  if (!path) return null
  const i = path.lastIndexOf('/')
  if (i === -1) return ''
  return path.slice(0, i)
}

function folderHasMatch(folder: FileNode, matchPaths: Set<string>): boolean {
  for (const child of folder.children || []) {
    if (child.type === 'file' && matchPaths.has(child.path)) return true
    if (child.type === 'folder' && folderHasMatch(child, matchPaths)) return true
  }
  return false
}

/**
 * 按当前展开态生成与侧栏树可见顺序一致的节点列表（含文件夹行）。
 * compact 展开时只露出链尾文件夹的 children，中间链节点不单独占行（与 FileTree UI 一致）。
 */
export function flattenVisibleTree(
  nodes: FileNode[],
  expanded: Set<string>,
  matchPaths: Set<string> | null = null,
): FileNode[] {
  const out: FileNode[] = []

  const walk = (list: FileNode[]) => {
    for (const node of list) {
      if (node.type === 'folder') {
        if (matchPaths && !folderHasMatch(node, matchPaths)) continue
        out.push(node)
        if (!expanded.has(node.path)) continue

        const compactPaths = collectCompactPaths(node)
        let displayNode = node
        if (compactPaths.length > 1) {
          let cur = node
          for (let i = 1; i < compactPaths.length; i++) {
            const child = (cur.children || []).find((c) => c.path === compactPaths[i])
            if (child) {
              cur = child
              displayNode = child
            }
          }
        }
        if (displayNode.children) walk(displayNode.children)
      } else {
        if (matchPaths && !matchPaths.has(node.path)) continue
        out.push(node)
      }
    }
  }

  walk(nodes)
  return out
}

export function stepIndex(current: number, length: number, delta: number): number {
  if (length <= 0) return -1
  if (current < 0) return delta > 0 ? 0 : length - 1
  return clampIndex(current + delta, length)
}

/** 网格：按列数做二维步进。cols < 1 时当 1 列。无当前项时落到 0。 */
export function stepGridIndex(current: number, length: number, cols: number, dir: NavDir): number {
  if (length <= 0) return -1
  if (current < 0) return 0
  const c = Math.max(1, cols | 0)
  const i = current
  switch (dir) {
    case 'down':
      return i + c < length ? i + c : i
    case 'up':
      return i - c >= 0 ? i - c : i
    case 'right':
      return i + 1 < length ? i + 1 : i
    case 'left':
      return i - 1 >= 0 ? i - 1 : i
    default:
      return i
  }
}

export function scrollNavTarget(el: Element | null | undefined): void {
  el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

export function treeNodeTestId(path: string): string {
  return `tree-node-${path.replace(/\//g, '-')}`
}
