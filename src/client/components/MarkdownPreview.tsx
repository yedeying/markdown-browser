import { useEffect, useRef } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'
import { marked, type Renderer } from 'marked'
import { markedHighlight } from 'marked-highlight'
import hljs from 'highlight.js/lib/core'
// 常用语言
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import json from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import markdown from 'highlight.js/lib/languages/markdown'
import sql from 'highlight.js/lib/languages/sql'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import java from 'highlight.js/lib/languages/java'
import cpp from 'highlight.js/lib/languages/cpp'
import yaml from 'highlight.js/lib/languages/yaml'
import plaintext from 'highlight.js/lib/languages/plaintext'
import mermaid from 'mermaid'
import 'katex/dist/katex.min.css'
import renderMathInElement from 'katex/dist/contrib/auto-render'
import { assetUrl } from '../utils/fsApi.js'

// 注册语言
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('css', css)
hljs.registerLanguage('json', json)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('java', java)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('c', cpp)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('yml', yaml)
hljs.registerLanguage('plaintext', plaintext)
hljs.registerLanguage('text', plaintext)

mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' })

// 配置 marked
marked.use(markedHighlight({
  langPrefix: 'hljs language-',
  highlight(code: string, lang: string) {
    if (lang === 'mermaid') return code
    const language = hljs.getLanguage(lang) ? lang : 'plaintext'
    return hljs.highlight(code, { language }).value
  }
}))

const headingCount: Record<string, number> = {}

/**
 * 解析相对路径
 * 例如：
 *   - 当前文件: docs/folder/file.md
 *   - 相对路径: ../images/foo.png
 *   - 结果: docs/images/foo.png
 */
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
  // 用闭包数组存计数（数组引用不变，值可变）
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
      const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
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
      // 相对路径转换为 /api/asset/ 代理（自动带分享/挂载前缀）
      const src = href.startsWith('.')
        ? assetUrl(resolveRelativePath(currentFilePath || '', href))
        : href
      const titleAttr = title ? ` title="${title}"` : ''
      return `<img src="${src}" alt="${text}"${titleAttr} />`
    },
    link(href: string, title: string | null, text: string) {
      // Markdown 内部链接（.md 文件）：转换为应用内导航
      if (currentFilePath && (href.endsWith('.md') || href.match(/\.md[?#]/))) {
        const resolvedPath = resolveRelativePath(currentFilePath, href)
        return `<a href="#" onclick="window.dispatchEvent(new CustomEvent('navigate-file', {detail: {path: '${resolvedPath}'}})); return false;">${text}</a>`
      }
      // 外部链接保持不变
      const titleAttr = title ? ` title="${title}"` : ''
      return `<a href="${href}"${titleAttr}>${text}</a>`
    },
    listitem(text: string, task: boolean, checked: boolean) {
      if (!task) {
        return `<li>${text}</li>\n`
      }
      // 闭包计数器：每次 buildRenderer 都是全新的，不污染全局
      const idx = counter[0]++
      const checkedAttr = checked ? ' checked' : ''
      // 替换 marked 生成的 disabled checkbox
      // 注意：父级 li（含子列表）的 text 会被 marked 包在 <p> 里，input 不在行首
      // 所以不用 ^ 锚定，直接全文匹配第一个 <input type="checkbox">
      const withNewCheckbox = text.replace(
        /<input[^>]*type="checkbox"[^>]*>/,
        `<input type="checkbox"${checkedAttr} data-task-idx="${idx}" class="task-checkbox" />`
      )
      // checkbox 后文本包一层 span，供删除线 CSS 精确定位
      // 注意：不能用 s flag，否则会把子列表 <ul> 也吃进 task-text
      // 匹配到 </p>、<ul、<ol 任意一个就停止
      const inner = withNewCheckbox.replace(
        /(<input[^>]*class="task-checkbox"[^>]*\/>)(.*?)(<\/p>|(?=<ul)|(?=<ol)|$)/,
        `$1<span class="task-text">$2</span>$3`
      )
      return `<li class="task-list-item">${inner}</li>\n`
    }
  }
  return { renderer, taskCount: counter }
}

interface Props {
  markdown: string
  contentRef?: { current: HTMLElement | null }
  className?: string
  filePath?: string
  onCheckboxToggle?: (index: number, checked: boolean) => void
}

const MarkdownPreview: FunctionalComponent<Props> = ({ markdown, contentRef, className, filePath, onCheckboxToggle }) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // 重置标题计数
    Object.keys(headingCount).forEach(k => delete headingCount[k])

    const { renderer } = buildRenderer(filePath)
    marked.use({ renderer, gfm: true, breaks: true })
    containerRef.current.innerHTML = marked.parse(markdown) as string

    // 渲染后按 DOM 文档顺序重新给 checkbox 编号
    // （marked 的 listitem 是从内到外渲染，导致索引是后序；DOM 顺序是先序，和源码行顺序一致）
    containerRef.current.querySelectorAll<HTMLInputElement>('.task-checkbox').forEach((cb, i) => {
      cb.dataset.taskIdx = String(i)
    })

    // 渲染 Mermaid
    const mermaidEls = containerRef.current.querySelectorAll('.mermaid')
    if (mermaidEls.length > 0) {
      mermaid.run({ nodes: Array.from(mermaidEls) as HTMLElement[] })
    }

    // 渲染 KaTeX
    renderMathInElement(containerRef.current, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
      ],
      throwOnError: false,
    })

    // 表格排序
    containerRef.current.querySelectorAll('table').forEach((table) => {
      table.querySelectorAll('th').forEach((th, i) => {
        (th as HTMLElement).onclick = () => {
          const tbody = table.querySelector('tbody') || table
          const rows = Array.from(tbody.querySelectorAll('tr')).filter(r => r.querySelector('td'))
          const asc = !th.classList.contains('sort-asc')
          table.querySelectorAll('th').forEach(h => h.classList.remove('sort-asc', 'sort-desc'))
          th.classList.add(asc ? 'sort-asc' : 'sort-desc')
          rows.sort((a, b) => {
            const av = (a as HTMLTableRowElement).cells[i]?.textContent?.trim() || ''
            const bv = (b as HTMLTableRowElement).cells[i]?.textContent?.trim() || ''
            const an = parseFloat(av), bn = parseFloat(bv)
            if (!isNaN(an) && !isNaN(bn)) return asc ? an - bn : bn - an
            return asc ? av.localeCompare(bv) : bv.localeCompare(av)
          })
          rows.forEach(r => tbody.appendChild(r))
        }
      })
    })

    // 暴露 ref
    if (contentRef) {
      contentRef.current = containerRef.current
    }
  }, [markdown, filePath])

  // 复制按钮 + checkbox 事件委托
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement

      // 复制按钮
      if (target.classList.contains('copy-btn')) {
        const code = target.dataset.code || ''
        const decoded = code
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
        navigator.clipboard.writeText(decoded).then(() => {
          target.textContent = '已复制'
          target.classList.add('copied')
          setTimeout(() => {
            target.textContent = '复制'
            target.classList.remove('copied')
          }, 2000)
        })
        return
      }

      // checkbox 勾选
      // 支持点击 checkbox 本身、.task-text 文字、或整个 .task-list-item 行
      // 注意：直接点 checkbox 时浏览器已翻转 checked；点文字时需手动翻转
      {
        let cb: HTMLInputElement | null = null
        let browserAlreadyToggled = false

        if (target.classList.contains('task-checkbox')) {
          // 直接点 checkbox：浏览器已翻转
          cb = target as HTMLInputElement
          browserAlreadyToggled = true
        } else {
          // 点文字或行：找最近的 task-list-item 里的 checkbox
          // 但如果点的是链接、按钮等交互元素则不拦截
          if ((target as HTMLElement).closest('a, button')) return
          const li = target.closest('.task-list-item')
          if (li) {
            // 只取本层直属 checkbox（不跨子列表）
            cb = li.querySelector(':scope > .task-checkbox, :scope > p > .task-checkbox')
          }
        }

        if (cb) {
          const idx = cb.dataset.taskIdx
          if (idx !== undefined && onCheckboxToggle) {
            if (!browserAlreadyToggled) {
              // 手动翻转 DOM，保证视觉立即响应
              cb.checked = !cb.checked
            }
            onCheckboxToggle(parseInt(idx, 10), cb.checked)
          }
        }
      }
    }

    el.addEventListener('click', handleClick)
    return () => el.removeEventListener('click', handleClick)
  }, [onCheckboxToggle])

  return (
    <div
      ref={containerRef}
      class={`markdown-body ${className || ''}`}
    />
  )
}

export default MarkdownPreview
