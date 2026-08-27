import { useEffect, useRef } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'
import mermaid from 'mermaid'
import 'katex/dist/katex.min.css'
import renderMathInElement from 'katex/dist/contrib/auto-render'
import { parseMarkdownPreview } from '../utils/parseMarkdownPreview.js'
import {
  setupMarkdownHeadingFolds,
  toggleHeadingFold,
  expandHeadingAncestors,
  findElementByDomId,
} from '../utils/mdHeadingFold.js'

mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' })

interface Props {
  markdown: string
  contentRef?: { current: HTMLElement | null }
  className?: string
  filePath?: string
  onCheckboxToggle?: (index: number, checked: boolean) => void
}

const MarkdownPreview: FunctionalComponent<Props> = ({ markdown, contentRef, className, filePath, onCheckboxToggle }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const filePathRef = useRef(filePath)
  filePathRef.current = filePath

  useEffect(() => {
    if (!containerRef.current) return

    containerRef.current.innerHTML = parseMarkdownPreview(markdown, filePath)
    setupMarkdownHeadingFolds(containerRef.current, filePath)

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

    // URL hash：展开祖先后滚动
    const hash = window.location.hash.replace(/^#/, '')
    if (hash) {
      expandHeadingAncestors(containerRef.current, hash, filePath)
      requestAnimationFrame(() => {
        findElementByDomId(containerRef.current!, hash)?.scrollIntoView({ block: 'start' })
      })
    }

    // 暴露 ref
    if (contentRef) {
      contentRef.current = containerRef.current
    }
  }, [markdown, filePath])

  // 复制按钮 + checkbox + 标题折叠 事件委托
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement

      const foldBtn = target.closest('.md-fold-toggle')
      if (foldBtn && el.contains(foldBtn)) {
        e.preventDefault()
        e.stopPropagation()
        const section = foldBtn.closest('.md-fold') as HTMLElement | null
        if (section) toggleHeadingFold(section, filePathRef.current)
        return
      }

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
      {
        let cb: HTMLInputElement | null = null
        let browserAlreadyToggled = false

        if (target.classList.contains('task-checkbox')) {
          cb = target as HTMLInputElement
          browserAlreadyToggled = true
        } else {
          if ((target as HTMLElement).closest('a, button')) return
          const li = target.closest('.task-list-item')
          if (li) {
            cb = li.querySelector(':scope > .task-checkbox, :scope > p > .task-checkbox')
          }
        }

        if (cb) {
          const idx = cb.dataset.taskIdx
          if (idx !== undefined && onCheckboxToggle) {
            if (!browserAlreadyToggled) {
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
      data-testid="markdown-preview"
    />
  )
}

export default MarkdownPreview
