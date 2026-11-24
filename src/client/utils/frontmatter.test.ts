import { test, expect } from 'bun:test'
import { extractFrontmatter, renderFrontmatterHtml } from './frontmatter.ts'
import { parseMarkdownPreview } from './parseMarkdownPreview.ts'

test('extractFrontmatter parses standard YAML key/value pairs and strips block from body', () => {
  const md = [
    '---',
    'name: frontend-d2c',
    'description: Convert Figma designs into Vue 3 code.',
    '---',
    '',
    '# Frontend D2C',
    'Body text.',
  ].join('\n')

  const fm = extractFrontmatter(md)
  expect(fm).not.toBeNull()
  expect(fm!.entries).toEqual([
    { key: 'name', value: 'frontend-d2c' },
    { key: 'description', value: 'Convert Figma designs into Vue 3 code.' },
  ])
  expect(fm!.body.trimStart()).toStartWith('# Frontend D2C')
})

test('extractFrontmatter handles inline arrays, block lists, folded multiline values, and quotes', () => {
  const md = [
    '---',
    'title: "Hello: World"',
    'tags: [vue, "design, system", playwright]',
    'authors:',
    '  - Alice',
    '  - Bob',
    'summary: >',
    '  Line one',
    '  line two',
    '---',
    '# Heading',
  ].join('\n')

  const fm = extractFrontmatter(md)
  expect(fm).not.toBeNull()
  expect(fm!.entries).toEqual([
    { key: 'title', value: 'Hello: World' },
    { key: 'tags', value: ['vue', 'design, system', 'playwright'] },
    { key: 'authors', value: ['Alice', 'Bob'] },
    { key: 'summary', value: 'Line one line two' },
  ])
})

test('extractFrontmatter ignores documents starting with horizontal rule or non-YAML prose', () => {
  const hrDoc = '---\n\nJust a horizontal rule followed by prose.\n\n---\nMore text'
  expect(extractFrontmatter(hrDoc)).toBeNull()

  const noClose = '---\nname: test\nNo closing fence'
  expect(extractFrontmatter(noClose)).toBeNull()
})

test('renderFrontmatterHtml escapes HTML entities safely', () => {
  const html = renderFrontmatterHtml([
    { key: 'name', value: '<script>alert(1)</script>' },
    { key: 'tags', value: ['a&b', '<b>'] },
  ])
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  expect(html).not.toContain('<script>')
  expect(html).toContain('md-fm-tag')
})

test('parseMarkdownPreview renders frontmatter as table before body without leaking raw delimiters', () => {
  const md = [
    '---',
    'name: demo-skill',
    'description: Example description',
    '---',
    '',
    '# Demo Title',
  ].join('\n')

  const html = parseMarkdownPreview(md, 'docs/demo.md')
  expect(html).toContain('class="md-frontmatter"')
  expect(html).toContain('<td class="md-fm-key">name</td>')
  expect(html).toContain('<td class="md-fm-val">demo-skill</td>')
  expect(html).toContain('<h1 id="demo-title">Demo Title</h1>')
  expect(html).not.toContain('<hr>')
})
