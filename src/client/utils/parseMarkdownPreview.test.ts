import { test, expect } from 'bun:test'
import { parseMarkdownPreview, resolveHljsLang } from './parseMarkdownPreview.ts'

test('parseMarkdownPreview stays fast across many calls (no stacked marked.use)', () => {
  const t0 = performance.now()
  for (let i = 0; i < 80; i++) {
    const html = parseMarkdownPreview(`# hello ${i}\n\npara with **bold** and a [link](https://example.com)`)
    expect(html).toContain('<h1')
    expect(html).toContain('bold')
  }
  const ms = performance.now() - t0
  // 叠乘 marked.use 时 80 次会飙到数秒～卡死；隔离实例应远低于此
  expect(ms).toBeLessThan(2000)
})

test('parseMarkdownPreview renders basic markdown', () => {
  const html = parseMarkdownPreview('hello **world**', 'notes/a.md')
  expect(html).toContain('<strong>world</strong>')
})

test('fence langs cc/cpp/c get real hljs highlighting, not plaintext', () => {
  expect(resolveHljsLang('cc')).toBe('cc')
  expect(resolveHljsLang('cpp')).toBe('cpp')
  expect(resolveHljsLang('c')).toBe('c')
  expect(resolveHljsLang('CXX')).toBe('cxx')
  expect(resolveHljsLang('nope')).toBe('plaintext')

  const html = parseMarkdownPreview('```cc\nint main() { return 0; }\n```')
  expect(html).toContain('language-cc')
  expect(html).toContain('hljs')
  // 关键字应被着色（plain 时通常没有 span）
  expect(html).toMatch(/hljs-\w+/)
})
