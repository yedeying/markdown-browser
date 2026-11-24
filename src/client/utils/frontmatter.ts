/**
 * Markdown YAML Frontmatter 解析与表格渲染。
 *
 * 仅处理文档最开头的 `---` ... `---`（或 `...`）YAML 块，
 * 将顶层键值对提取为结构化数据，以紧凑两列元数据表格形式呈现在正文顶部。
 * 零外部依赖、全字段 HTML 转义；解析不出有效键值对时回退为普通 Markdown，
 * 不误伤以 `---` 水平线开头的普通文档。
 */

export interface FrontmatterEntry {
  key: string
  value: string | string[]
}

export interface ExtractedFrontmatter {
  entries: FrontmatterEntry[]
  body: string
}

const FM_OPEN_RE = /^(?:\uFEFF)?---[ \t]*\r?\n/
const FM_CLOSE_RE = /\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/
const TOP_KEY_RE = /^([A-Za-z0-9_\-.\u4e00-\u9fff][A-Za-z0-9_\-.\s\u4e00-\u9fff]*?):[ \t]*(.*)$/

function unquoteScalar(raw: string): string {
  const s = raw.trim()
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
  }
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) {
    return s.slice(1, -1).replace(/''/g, "'")
  }
  return s
}

/** 切分内联 YAML 数组 `[a, "b, c", d]`，尊重引号内逗号 */
function parseInlineArray(raw: string): string[] {
  const inner = raw.slice(1, -1).trim()
  if (!inner) return []
  const out: string[] = []
  let cur = ''
  let quote: '"' | "'" | null = null
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    if (quote) {
      if (ch === '\\' && quote === '"' && i + 1 < inner.length) {
        cur += ch + inner[++i]
        continue
      }
      if (ch === quote) quote = null
      cur += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      cur += ch
    } else if (ch === ',') {
      const v = unquoteScalar(cur)
      if (v) out.push(v)
      cur = ''
    } else {
      cur += ch
    }
  }
  const last = unquoteScalar(cur)
  if (last) out.push(last)
  return out
}

function parseYamlEntries(block: string): FrontmatterEntry[] | null {
  const lines = block.replace(/\r\n?/g, '\n').split('\n')
  const entries: FrontmatterEntry[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim() || /^\s*#/.test(line)) {
      i++
      continue
    }
    // 顶层行不能缩进；遇到非键值对顶层文本则说明不是合法 YAML frontmatter
    if (/^[ \t]/.test(line)) return null
    const m = TOP_KEY_RE.exec(line)
    if (!m) return null

    const key = m[1].trim()
    const rest = m[2].trim()
    i++

    // 1. 块标量：| / |- / |+ / > / >- / >+
    if (/^[|>][+-]?\d*$/.test(rest)) {
      const folded = rest.startsWith('>')
      const buf: string[] = []
      let baseIndent: number | null = null
      while (i < lines.length) {
        const sub = lines[i]
        if (!sub.trim()) {
          buf.push('')
          i++
          continue
        }
        const indentMatch = /^([ \t]+)/.exec(sub)
        if (!indentMatch) break
        const indent = indentMatch[1].length
        if (baseIndent === null) baseIndent = indent
        if (indent < baseIndent) break
        buf.push(sub.slice(baseIndent))
        i++
      }
      while (buf.length && buf[buf.length - 1] === '') buf.pop()
      const value = folded
        ? buf.map((l) => l.trim()).join(' ').replace(/\s+/g, ' ').trim()
        : buf.join('\n')
      entries.push({ key, value })
      continue
    }

    // 2. 内联数组：[a, b, c]
    if (rest.startsWith('[') && rest.endsWith(']')) {
      entries.push({ key, value: parseInlineArray(rest) })
      continue
    }

    // 3. 有值标量（支持后续缩进折行）
    if (rest) {
      const parts = [unquoteScalar(rest)]
      while (i < lines.length) {
        const next = lines[i]
        if (!next.trim() || /^\s*#/.test(next)) break
        if (!/^[ \t]+/.test(next)) break
        parts.push(unquoteScalar(next))
        i++
      }
      entries.push({ key, value: parts.join(' ') })
      continue
    }

    // 4. 空值后接缩进块：列表 `- item` 或嵌套对象 `sub: val`
    const listItems: string[] = []
    const nestedLines: string[] = []
    let isList = false
    while (i < lines.length) {
      const sub = lines[i]
      if (!sub.trim() || /^\s*#/.test(sub)) {
        i++
        continue
      }
      if (!/^[ \t]+/.test(sub)) {
        // 允许 0 缩进的 `- item`（常见于 Hexo / Hugo / Obsidian YAML）
        const zeroList = /^-\s+(.*)$/.exec(sub)
        if (zeroList) {
          isList = true
          listItems.push(unquoteScalar(zeroList[1]))
          i++
          continue
        }
        break
      }
      const listMatch = /^[ \t]+-\s+(.*)$/.exec(sub)
      if (listMatch) {
        isList = true
        listItems.push(unquoteScalar(listMatch[1]))
      } else {
        nestedLines.push(sub.trim())
      }
      i++
    }

    if (isList && listItems.length > 0) {
      entries.push({ key, value: listItems })
    } else if (nestedLines.length > 0) {
      entries.push({ key, value: nestedLines.join('\n') })
    } else {
      entries.push({ key, value: '' })
    }
  }

  return entries.length > 0 ? entries : null
}

/** 从 Markdown 源码顶部提取 YAML frontmatter；无合法 frontmatter 时返回 null。 */
export function extractFrontmatter(markdown: string): ExtractedFrontmatter | null {
  const open = FM_OPEN_RE.exec(markdown)
  if (!open) return null
  const afterOpen = markdown.slice(open[0].length)
  const close = FM_CLOSE_RE.exec(afterOpen)
  if (!close) return null

  const rawBlock = afterOpen.slice(0, close.index)
  const entries = parseYamlEntries(rawBlock)
  if (!entries) return null

  const body = afterOpen.slice(close.index + close[0].length)
  return { entries, body }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 将 Frontmatter 键值对渲染为顶部两列元数据表格 HTML。 */
export function renderFrontmatterHtml(entries: FrontmatterEntry[]): string {
  if (!entries.length) return ''
  const rows = entries.map(({ key, value }) => {
    const valHtml = Array.isArray(value)
      ? `<span class="md-fm-tags">${value.map((item) => `<span class="md-fm-tag">${escapeHtml(item)}</span>`).join('')}</span>`
      : escapeHtml(value).replace(/\n/g, '<br />')
    return `<tr><td class="md-fm-key">${escapeHtml(key)}</td><td class="md-fm-val">${valHtml}</td></tr>`
  }).join('')
  return `<div class="md-frontmatter-wrap" data-testid="md-frontmatter"><table class="md-frontmatter"><tbody>${rows}</tbody></table></div>\n`
}
