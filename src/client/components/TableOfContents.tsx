import { useEffect, useState } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'

interface TocItem {
  id: string
  text: string
  level: number
}

interface Props {
  contentRef: { current: HTMLElement | null }
}

const TableOfContents: FunctionalComponent<Props> = ({ contentRef }) => {
  const [items, setItems] = useState<TocItem[]>([])
  const [activeId, setActiveId] = useState('')

  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    const headings = el.querySelectorAll('h1, h2, h3, h4')
    const tocItems: TocItem[] = []
    headings.forEach((h) => {
      const id = h.getAttribute('id') || ''
      const level = parseInt(h.tagName[1])
      tocItems.push({ id, text: h.textContent || '', level })
    })
    setItems(tocItems)
  })

  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    const handleScroll = () => {
      const headings = el.querySelectorAll('h1, h2, h3, h4')
      let current = ''
      headings.forEach((h) => {
        if (h.getBoundingClientRect().top <= 100) {
          current = h.getAttribute('id') || ''
        }
      })
      setActiveId(current)
    }

    el.addEventListener('scroll', handleScroll)
    return () => el.removeEventListener('scroll', handleScroll)
  }, [contentRef.current])

  if (items.length === 0) return null

  return (
    <aside class="toc-panel">
      <div class="toc-header">📑 目录</div>
      <div class="toc-content">
        <ul class="toc-list">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                class={`toc-h${item.level}${activeId === item.id ? ' active' : ''}`}
                data-target={item.id}
                onClick={(e) => {
                  e.preventDefault()
                  const target = contentRef.current?.querySelector(`#${item.id}`)
                  target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
              >
                {item.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}

export default TableOfContents
