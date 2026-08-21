import { test, expect } from 'bun:test'
import { marked } from 'marked'
import { renderStMarkdown, isSafeHref } from './stMarkdown.ts'

test('code fence containing "<" renders as literal text once, not double-escaped', () => {
  const html = renderStMarkdown('```\nif (a < b) { return c; }\n```')
  // 期望原样的 "<" 被转义恰好一次成 &lt;，不应该出现 &amp;lt;（双重转义的典型症状）
  expect(html).toContain('&lt;')
  expect(html).not.toContain('&amp;lt;')
})

test('inline codespan containing "<" and "&" renders escaped exactly once', () => {
  const html = renderStMarkdown('`a < b & c`')
  expect(html).toContain('&lt;')
  expect(html).toContain('&amp;')
  expect(html).not.toContain('&amp;lt;')
  expect(html).not.toContain('&amp;amp;')
})

test('raw HTML tags in mes are passed through into the output HTML', () => {
  const html = renderStMarkdown('<div class="x">hi</div> and <b>bold</b>')
  expect(html).toContain('<div class="x">hi</div>')
  expect(html).toContain('<b>bold</b>')
  expect(html).not.toContain('&lt;div')
})

test('markdown link with javascript: href does not produce an executable href', () => {
  const html = renderStMarkdown('[click me](javascript:alert(1))')
  expect(html).not.toContain('javascript:')
  expect(html).not.toContain('<a ')
})

test('markdown link with safe http href renders a plain anchor without inline event handlers', () => {
  const html = renderStMarkdown('[click me](https://example.com/path)')
  expect(html).toContain('<a href="https://example.com/path"')
  expect(html).not.toContain('onclick')
})

test('malicious href crafted to break out of an inherited onclick-based renderer cannot execute script', () => {
  // 模拟设计里描述的攻击面：如果全局 marked 单例上曾经装过 MarkdownPreview 的
  // link renderer（把 href 未转义地拼进 onclick 字符串），一条精心构造的 mes
  // 链接就可能借助单引号从 onclick 里逃逸执行任意 JS。这里先污染全局单例，
  // 确认我们隔离出的渲染器完全不受影响。
  marked.use({
    renderer: {
      link(href: string, _title: string | null | undefined, text: string) {
        return `<a href="#" onclick="window.dispatchEvent(new CustomEvent('navigate-file', {detail: {path: '${href}'}})); return false;">${text}</a>`
      },
    },
  })
  const malicious = "evil'});alert(document.cookie);//.md"
  const html = renderStMarkdown(`[x](${malicious})`)
  expect(html).not.toContain('onclick')
  expect(html).not.toContain('dispatchEvent')
})

test('isSafeHref allows http/https/mailto and relative paths, rejects javascript: and data:', () => {
  expect(isSafeHref('https://example.com')).toBe(true)
  expect(isSafeHref('http://example.com')).toBe(true)
  expect(isSafeHref('mailto:a@b.com')).toBe(true)
  expect(isSafeHref('/relative/path')).toBe(true)
  expect(isSafeHref('relative/path')).toBe(true)
  expect(isSafeHref('#anchor')).toBe(true)
  expect(isSafeHref('javascript:alert(1)')).toBe(false)
  expect(isSafeHref('JAVASCRIPT:alert(1)')).toBe(false)
  expect(isSafeHref('java\tscript:alert(1)')).toBe(false)
  expect(isSafeHref('data:text/html,<script>alert(1)</script>')).toBe(false)
})

test('renderStMarkdown is isolated per call: does not mutate or depend on the global marked singleton', () => {
  const before = renderStMarkdown('[safe](https://example.com)')
  marked.use({ renderer: { link() { return '<a href="#" onclick="evil()">x</a>' } } })
  const after = renderStMarkdown('[safe](https://example.com)')
  expect(before).toBe(after)
  expect(after).not.toContain('onclick')
})

test('reasoning text: raw HTML may pass; javascript: links still blocked', () => {
  const html = renderStMarkdown('<img src="x" alt="a"> plan: [go](javascript:alert(2))')
  expect(html).toContain('<img')
  expect(html).not.toContain('javascript:')
  expect(html).not.toContain('<a ')
})
