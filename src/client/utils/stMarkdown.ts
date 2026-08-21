// 隔离的 Markdown 渲染管线，专供 ST 聊天气泡（mes / extra.reasoning）使用。
// 设计见 docs/superpowers/specs/2026-08-20-st-chat-html-layout-design.md
// 与 docs/superpowers/specs/2026-08-20-jsonl-st-preview-design.md §3。
//
// 为什么不能像最初实现那样直接用从 'marked' 导入的全局单例：
// MarkdownPreview 每次渲染都会调用 `marked.use({ renderer, ... })`，把自己的
// link renderer 装到这个全局单例上——其中把 href 未经转义地拼进内联
// onclick 字符串（用于站内 .md 跳转）。这个装载是**永久性**的：只要应用里
// 渲染过一次任意 .md 文件，全局单例就会一直带着这个 renderer。此后任何直接
// `marked.parse()` 的地方（包括气泡）都会继承它——精心构造的 mes 链接的 href
// 若包含单引号，就可能从 onclick 属性里逃逸执行任意 JS。
//
// 因此这里每次渲染都创建全新的 `Marked` 实例，与全局单例、与其他气泡都完全
// 隔离，且自带的 renderer 从不生成任何内联事件属性（onclick 等）。
import { Marked } from 'marked'

// href 是 marked 里唯一没有被预先转义/转换过的原始字段，手工拼进 HTML 属性前
// 必须自己转义引号，否则精心构造的 href 可以直接从属性里逃逸出去。
function escapeHrefAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

const SAFE_URL_SCHEMES = new Set(['http', 'https', 'mailto'])

/**
 * href 协议白名单：http / https / mailto，或没有 scheme 的相对路径・锚点。
 * 拒绝 javascript: / data: / vbscript: 等可执行或可注入的协议。
 */
export function isSafeHref(rawHref: string): boolean {
  // 浏览器解析 URL scheme 时会忽略其中的 tab / 换行 / 回车等控制字符
  // （常见的 "java\tscript:alert(1)" 过滤绕过手法），先剔除再判断协议。
  const cleaned = rawHref.replace(/[\u0000-\u001F\u007F]/g, '')
  const schemeMatch = cleaned.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)
  if (!schemeMatch) return true // 无 scheme：相对路径 / #锚点，允许
  return SAFE_URL_SCHEMES.has(schemeMatch[1].toLowerCase())
}

/**
 * 构造一次性、隔离的 Marked 实例。
 * - HTML 与普通 Markdown 预览一致：原样进 DOM。
 * - text/title 参数在到达这里之前已经由 marked 自身转义过一次，绝不再转义。
 * - href 是唯一的原始字段，只在这里做协议校验 + 属性转义。
 */
function createStMarked(): Marked {
  const instance = new Marked({ gfm: true, breaks: true })
  instance.use({
    renderer: {
      link(href: string, title: string | null | undefined, text: string): string {
        if (!isSafeHref(href)) return text
        const titleAttr = title ? ` title="${title}"` : ''
        return `<a href="${escapeHrefAttr(href)}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`
      },
      image(href: string, title: string | null, text: string): string {
        if (!isSafeHref(href)) return text
        const titleAttr = title ? ` title="${title}"` : ''
        return `<img src="${escapeHrefAttr(href)}" alt="${text}"${titleAttr} />`
      },
    },
  })
  return instance
}

/** mes / reasoning 共用的渲染入口：每次调用都是全新、隔离的实例，互不影响。 */
export function renderStMarkdown(text: string): string {
  return createStMarked().parse(text) as string
}
