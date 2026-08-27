/** Markdown 预览：按标题折叠辖区（DOM 后处理 + sessionStorage） */

const HEADING_RE = /^H([1-6])$/
export const FOLD_STORAGE_PREFIX = 'vmd_md_fold:'

function headingLevel(el: Element): number | null {
  const m = HEADING_RE.exec(el.tagName)
  return m ? Number(m[1]) : null
}

function ensureHeadingId(heading: HTMLElement, index: number): string {
  if (heading.id) return heading.id
  const id = `heading-${index}`
  heading.id = id
  return id
}

/**
 * 将 root 直系子节点中的 h1–h6 及其辖区包成 .md-fold。
 * 辖区：直到下一个「同级或更高级」标题之前的所有节点（含更低级标题，会递归再包）。
 */
export function wrapMarkdownHeadingFolds(root: HTMLElement): void {
  // 已处理过则跳过（幂等）
  if (root.querySelector(':scope > .md-fold')) return

  const kids = Array.from(root.childNodes)
  if (kids.length === 0) return

  const fragment = root.ownerDocument.createDocumentFragment()
  let i = 0
  let headingIndex = 0

  while (i < kids.length) {
    const node = kids[i]
    if (node.nodeType === 1) {
      const el = node as HTMLElement
      const level = headingLevel(el)
      if (level != null) {
        let j = i + 1
        while (j < kids.length) {
          const next = kids[j]
          if (next.nodeType === 1) {
            const nextLevel = headingLevel(next as Element)
            if (nextLevel != null && nextLevel <= level) break
          }
          j++
        }
        const section = buildFoldSection(el, kids.slice(i + 1, j), level, headingIndex++)
        fragment.appendChild(section)
        i = j
        continue
      }
    }
    fragment.appendChild(node)
    i++
  }

  root.replaceChildren(fragment)

  // 递归：每个 body 内可能还有更低级标题
  root.querySelectorAll<HTMLElement>('.md-fold-body').forEach((body) => {
    wrapMarkdownHeadingFolds(body)
  })
}

function buildFoldSection(
  heading: HTMLElement,
  bodyNodes: ChildNode[],
  level: number,
  headingIndex: number,
): HTMLElement {
  const doc = heading.ownerDocument
  const id = ensureHeadingId(heading, headingIndex)
  const section = doc.createElement('section')
  section.className = 'md-fold'
  section.dataset.headingId = id
  section.dataset.level = String(level)

  const head = doc.createElement('div')
  head.className = 'md-fold-head'

  const btn = doc.createElement('button')
  btn.type = 'button'
  btn.className = 'md-fold-toggle'
  btn.setAttribute('aria-expanded', 'true')
  btn.setAttribute('aria-label', '折叠章节')
  // 放进标题内，与文字同一行盒对齐（避免 absolute top 估偏）
  heading.insertBefore(btn, heading.firstChild)

  head.appendChild(heading)

  const body = doc.createElement('div')
  body.className = 'md-fold-body'
  for (const n of bodyNodes) body.appendChild(n)

  section.appendChild(head)
  section.appendChild(body)
  return section
}

export function getCollapsedHeadingIds(filePath: string): Set<string> {
  if (!filePath) return new Set()
  try {
    const raw = sessionStorage.getItem(FOLD_STORAGE_PREFIX + filePath)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

export function setCollapsedHeadingIds(filePath: string, ids: Set<string>): void {
  if (!filePath) return
  try {
    const key = FOLD_STORAGE_PREFIX + filePath
    if (ids.size === 0) {
      sessionStorage.removeItem(key)
      return
    }
    sessionStorage.setItem(key, JSON.stringify([...ids]))
  } catch {
    /* private mode etc. */
  }
}

export function applyCollapsedHeadingIds(root: HTMLElement, ids: Set<string>): void {
  root.querySelectorAll<HTMLElement>('.md-fold').forEach((section) => {
    const id = section.dataset.headingId
    const collapsed = !!(id && ids.has(id))
    setFoldCollapsed(section, collapsed)
  })
}

function setFoldCollapsed(section: HTMLElement, collapsed: boolean): void {
  section.classList.toggle('md-fold--collapsed', collapsed)
  const btn = section.querySelector('.md-fold-toggle')
  if (btn) btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
}

/** 切换折叠；若提供 filePath 则写入 sessionStorage */
export function toggleHeadingFold(section: HTMLElement, filePath?: string | null): void {
  const next = !section.classList.contains('md-fold--collapsed')
  setFoldCollapsed(section, next)
  const id = section.dataset.headingId
  if (!filePath || !id) return
  const ids = getCollapsedHeadingIds(filePath)
  if (next) ids.add(id)
  else ids.delete(id)
  setCollapsedHeadingIds(filePath, ids)
}

function escapeAttrValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** 按 id 查找（支持数字开头的 id；勿用 `#1-foo` 这种非法 CSS 选择器） */
export function findElementByDomId(root: ParentNode, id: string): Element | null {
  if (!id) return null
  if (typeof Document !== 'undefined' && root instanceof Document) {
    return root.getElementById(id)
  }
  return (root as Element).querySelector(`[id="${escapeAttrValue(id)}"]`)
}

function cssEscapeIdent(value: string): string {
  // 仅用于 attribute / data-heading-id 字符串，不用作 #id 选择器
  return escapeAttrValue(value)
}

/** 展开包含指定 heading id 的所有祖先 .md-fold（含自身）；可选同步 sessionStorage */
export function expandHeadingAncestors(
  root: HTMLElement,
  headingId: string,
  filePath?: string | null,
): void {
  const esc = cssEscapeIdent(headingId)
  const target =
    root.querySelector(`.md-fold[data-heading-id="${esc}"]`)
    ?? findElementByDomId(root, headingId)?.closest('.md-fold')
  if (!target) return
  const opened: string[] = []
  let el: Element | null = target
  while (el && el !== root) {
    if (el.classList.contains('md-fold')) {
      const section = el as HTMLElement
      if (section.classList.contains('md-fold--collapsed')) {
        setFoldCollapsed(section, false)
        const id = section.dataset.headingId
        if (id) opened.push(id)
      }
    }
    el = el.parentElement
  }
  if (filePath && opened.length > 0) {
    const ids = getCollapsedHeadingIds(filePath)
    for (const id of opened) ids.delete(id)
    setCollapsedHeadingIds(filePath, ids)
  }
}

/** 渲染后一站式：包折叠 + 恢复会话状态 */
export function setupMarkdownHeadingFolds(root: HTMLElement, filePath?: string | null): void {
  wrapMarkdownHeadingFolds(root)
  if (filePath) {
    applyCollapsedHeadingIds(root, getCollapsedHeadingIds(filePath))
  }
}
