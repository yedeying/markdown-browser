import { test, expect } from 'bun:test'
import { highlightJson } from './highlightJson.ts'

test('highlightJson wraps JSON keys/strings in hljs spans', () => {
  const html = highlightJson(JSON.stringify({ name: 'Alice', n: 1 }, null, 2))
  expect(html).toContain('hljs-attr')
  expect(html).toContain('hljs-string')
  expect(html).toContain('&quot;name&quot;')
  expect(html).toContain('&quot;Alice&quot;')
})

test('highlightJson does not leave raw unescaped angle brackets from string values as executable tags', () => {
  // JSON.stringify already escapes < in strings; highlight should keep escaped form
  const code = JSON.stringify({ x: '<script>' }, null, 2)
  const html = highlightJson(code)
  expect(html).not.toContain('<script>')
  expect(html).toContain('&lt;script&gt;')
})
