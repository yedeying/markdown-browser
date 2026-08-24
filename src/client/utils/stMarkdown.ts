// 隔离的 Markdown 渲染管线，专供 ST 聊天气泡（mes / extra.reasoning）使用。
// 设计见 docs/superpowers/specs/2026-08-20-st-chat-html-layout-design.md
// 与 docs/superpowers/specs/2026-08-20-jsonl-st-preview-design.md §3。
//
// 为何不用从 'marked' 导入的全局单例：历史上 MarkdownPreview 曾在每次渲染
// 调用 `marked.use({ renderer })`，扩展会永久叠到全局单例上（编辑连打会卡死，
// 且不安全的 link renderer 会泄漏到其它 parse 调用）。气泡侧始终用全新
// `Marked` 实例；主预览亦已改为 `parseMarkdownPreview` 隔离实例。
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
