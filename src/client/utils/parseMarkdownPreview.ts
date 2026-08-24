/**
 * Markdown 预览解析（隔离 Marked 实例）。
 *
 * 切勿对全局 `marked` 单例反复 `marked.use()`：扩展会永久叠乘，
 * 编辑态每键一 parse 时十几次后主线程即可卡死。
 */
import { Marked, type Renderer } from 'marked'
import { markedHighlight } from 'marked-highlight'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import scss from 'highlight.js/lib/languages/scss'
import less from 'highlight.js/lib/languages/less'
import json from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import markdown from 'highlight.js/lib/languages/markdown'
import sql from 'highlight.js/lib/languages/sql'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import java from 'highlight.js/lib/languages/java'
import cpp from 'highlight.js/lib/languages/cpp'
import c from 'highlight.js/lib/languages/c'
import csharp from 'highlight.js/lib/languages/csharp'
import kotlin from 'highlight.js/lib/languages/kotlin'
import scala from 'highlight.js/lib/languages/scala'
import swift from 'highlight.js/lib/languages/swift'
import dart from 'highlight.js/lib/languages/dart'
import objectivec from 'highlight.js/lib/languages/objectivec'
import php from 'highlight.js/lib/languages/php'
import ruby from 'highlight.js/lib/languages/ruby'
import perl from 'highlight.js/lib/languages/perl'
import lua from 'highlight.js/lib/languages/lua'
import r from 'highlight.js/lib/languages/r'
import haskell from 'highlight.js/lib/languages/haskell'
import groovy from 'highlight.js/lib/languages/groovy'
import clojure from 'highlight.js/lib/languages/clojure'
import yaml from 'highlight.js/lib/languages/yaml'
import ini from 'highlight.js/lib/languages/ini'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import makefile from 'highlight.js/lib/languages/makefile'
import powershell from 'highlight.js/lib/languages/powershell'
import plaintext from 'highlight.js/lib/languages/plaintext'
import { assetUrl } from './fsApi.js'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('jsx', javascript)
hljs.registerLanguage('mjs', javascript)
hljs.registerLanguage('cjs', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('tsx', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('zsh', bash)
hljs.registerLanguage('fish', bash)
hljs.registerLanguage('css', css)
hljs.registerLanguage('scss', scss)
hljs.registerLanguage('sass', scss)
hljs.registerLanguage('less', less)
hljs.registerLanguage('json', json)
hljs.registerLanguage('jsonc', json)
hljs.registerLanguage('jsonl', json)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('htm', xml)
hljs.registerLanguage('vue', xml)
hljs.registerLanguage('svelte', xml)
hljs.registerLanguage('svg', xml)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('md', markdown)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('go', go)
hljs.registerLanguage('golang', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('rs', rust)
hljs.registerLanguage('java', java)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('c++', cpp)
hljs.registerLanguage('cc', cpp)
hljs.registerLanguage('cxx', cpp)
hljs.registerLanguage('hpp', cpp)
hljs.registerLanguage('hh', cpp)
hljs.registerLanguage('hxx', cpp)
hljs.registerLanguage('c', c)
hljs.registerLanguage('h', c)
hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('cs', csharp)
hljs.registerLanguage('c#', csharp)
hljs.registerLanguage('kotlin', kotlin)
hljs.registerLanguage('kt', kotlin)
hljs.registerLanguage('kts', kotlin)
hljs.registerLanguage('scala', scala)
hljs.registerLanguage('swift', swift)
hljs.registerLanguage('dart', dart)
hljs.registerLanguage('objectivec', objectivec)
hljs.registerLanguage('objc', objectivec)
hljs.registerLanguage('mm', objectivec)
hljs.registerLanguage('php', php)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('rb', ruby)
hljs.registerLanguage('perl', perl)
hljs.registerLanguage('pl', perl)
hljs.registerLanguage('lua', lua)
hljs.registerLanguage('r', r)
hljs.registerLanguage('haskell', haskell)
hljs.registerLanguage('hs', haskell)
hljs.registerLanguage('groovy', groovy)
hljs.registerLanguage('gradle', groovy)
hljs.registerLanguage('clojure', clojure)
hljs.registerLanguage('clj', clojure)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('yml', yaml)
hljs.registerLanguage('ini', ini)
hljs.registerLanguage('toml', ini) // 近似；无独立 toml 包时用 ini
hljs.registerLanguage('conf', ini)
hljs.registerLanguage('properties', ini)
hljs.registerLanguage('dockerfile', dockerfile)
hljs.registerLanguage('docker', dockerfile)
hljs.registerLanguage('makefile', makefile)
hljs.registerLanguage('make', makefile)
hljs.registerLanguage('powershell', powershell)
hljs.registerLanguage('ps1', powershell)
hljs.registerLanguage('pwsh', powershell)
hljs.registerLanguage('plaintext', plaintext)
hljs.registerLanguage('text', plaintext)
hljs.registerLanguage('txt', plaintext)

/** fence 语言别名 → hljs 已注册 id */
export function resolveHljsLang(raw?: string | null): string {
  if (!raw) return 'plaintext'
  const lang = raw.trim().toLowerCase()
  if (!lang) return 'plaintext'
  return hljs.getLanguage(lang) ? lang : 'plaintext'
}

/** 只装一次到本模块的扩展对象上，再交给每次新建的 Marked */
const highlightExt = markedHighlight({
  langPrefix: 'hljs language-',
  highlight(code: string, lang: string) {
    if (lang === 'mermaid') return code
    const language = resolveHljsLang(lang)
    return hljs.highlight(code, { language }).value
  },
})

const headingCount: Record<string, number> = {}

function resolveRelativePath(currentFilePath: string, relativePath: string): string {
  if (!relativePath.startsWith('.')) return relativePath
  const currentDir = currentFilePath.split('/').slice(0, -1).join('/')
  const parts = (currentDir || '.').split('/')
  const pathParts = relativePath.split('/')

  for (const part of pathParts) {
    if (part === '..' && parts.length > 0 && parts[parts.length - 1] !== '.') {
      parts.pop()
    } else if (part !== '.' && part !== '') {
      parts.push(part)
    }
  }
  return parts.filter(p => p && p !== '.').join('/')
}

function buildRenderer(currentFilePath?: string): { renderer: Partial<Renderer>; taskCount: number[] } {
  const counter = [0]
  const renderer: Partial<Renderer> = {
    code(code: string, lang?: string) {
      if (lang === 'mermaid') {
        return `<div class="mermaid">${code}</div>`
      }
      const escaped = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
      const language = resolveHljsLang(lang)
      const highlighted = hljs.highlight(code, { language }).value
      return `<pre><button class="copy-btn" data-code="${escaped}">复制</button><code class="hljs language-${language}">${highlighted}</code></pre>`
    },
    heading(text: string, level: number) {
      const slug = text
        .toLowerCase()
        .replace(/<[^>]*>/g, '')
        .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'h'
      headingCount[slug] = headingCount[slug] === undefined ? 0 : headingCount[slug] + 1
      const id = headingCount[slug] ? `${slug}-${headingCount[slug]}` : slug
      return `<h${level} id="${id}">${text}</h${level}>`
    },
    image(href: string, title: string | null, text: string) {
      const src = href.startsWith('.')
        ? assetUrl(resolveRelativePath(currentFilePath || '', href))
        : href
      const titleAttr = title ? ` title="${title}"` : ''
      return `<img src="${src}" alt="${text}"${titleAttr} />`
    },
    link(href: string, title: string | null, text: string) {
      if (currentFilePath && (href.endsWith('.md') || href.match(/\.md[?#]/))) {
        const resolvedPath = resolveRelativePath(currentFilePath, href)
        return `<a href="#" onclick="window.dispatchEvent(new CustomEvent('navigate-file', {detail: {path: '${resolvedPath}'}})); return false;">${text}</a>`
      }
      const titleAttr = title ? ` title="${title}"` : ''
      return `<a href="${href}"${titleAttr}>${text}</a>`
    },
    listitem(text: string, task: boolean, checked: boolean) {
      if (!task) {
        return `<li>${text}</li>\n`
      }
      const idx = counter[0]++
      const checkedAttr = checked ? ' checked' : ''
      const withNewCheckbox = text.replace(
        /<input[^>]*type="checkbox"[^>]*>/,
        `<input type="checkbox"${checkedAttr} data-task-idx="${idx}" class="task-checkbox" />`
      )
      const inner = withNewCheckbox.replace(
        /(<input[^>]*class="task-checkbox"[^>]*\/>)(.*?)(<\/p>|(?=<ul)|(?=<ol)|$)/,
        `$1<span class="task-text">$2</span>$3`
      )
      return `<li class="task-list-item">${inner}</li>\n`
    },
  }
  return { renderer, taskCount: counter }
}

export function parseMarkdownPreview(markdown: string, filePath?: string): string {
  Object.keys(headingCount).forEach(k => delete headingCount[k])
  const { renderer } = buildRenderer(filePath)
  const instance = new Marked(highlightExt, { renderer, gfm: true, breaks: true })
  return instance.parse(markdown) as string
}
