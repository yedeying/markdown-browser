import { useRef, useState, useEffect, useCallback } from 'preact/hooks'
import type { FunctionalComponent, ComponentChildren } from 'preact'
import type { FileNode, SearchResult } from '../../types.js'
import type { SearchType } from '../hooks/useSearch.js'
import FileTree, { type FileTreeHandle } from './FileTree.js'
import SearchBar from './SearchBar.js'
import Icon from './ui/Icon.js'
import { filterTree, isHiddenPath } from '../utils/hiddenFiles.js'
import { getSidebarWidth, setSidebarWidth } from '../utils/prefs.js'

interface Props {
  tree: FileNode[]
  currentPath: string | null
  onSelect: (node: FileNode) => void
  /** 文件夹展开时触发（用于懒加载 children） */
  onExpandFolder?: (path: string) => void
  query: string
  onQueryChange: (q: string) => void
  searchType: SearchType
  onTypeChange: (t: SearchType) => void
  searchResults: SearchResult[] | null
  searchLoading: boolean
  dirName: string
  // 移动端抽屉
  open?: boolean
  onClose?: () => void
  treeLoading?: boolean
  /** 额外的 header 内容（如多挂载切换器） */
  headerExtra?: ComponentChildren
  /** 是否显示隐藏文件（点文件），默认隐藏 */
  showHidden: boolean
  onToggleShowHidden: () => void
}

const Sidebar: FunctionalComponent<Props> = ({
  tree,
  currentPath,
  onSelect,
  onExpandFolder,
  query,
  onQueryChange,
  searchType,
  onTypeChange,
  searchResults,
  searchLoading,
  dirName,
  open,
  onClose,
  treeLoading,
  headerExtra,
  showHidden,
  onToggleShowHidden,
}) => {
  const treeRef = useRef<FileTreeHandle>(null)
  const asideRef = useRef<HTMLElement>(null)

  // ── 宽度拖拽调整（200–480px），初始值从 localStorage 读取 ──
  const [width, setWidth] = useState<number>(() => getSidebarWidth())
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    asideRef.current?.style.setProperty('--sidebar-width', `${width}px`)
  }, [width])

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const next = setSidebarWidth(drag.startWidth + (e.clientX - drag.startX))
    setWidth(next)
  }, [])

  const handlePointerUp = useCallback(() => {
    dragRef.current = null
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
  }, [handlePointerMove])

  const handleResizeStart = (e: PointerEvent) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startWidth: width }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  const handleSelect = (node: FileNode) => {
    onSelect(node)
    onClose?.()
  }

  const visibleTree = filterTree(tree, showHidden)
  const visibleSearchResults = searchResults
    ? (showHidden ? searchResults : searchResults.filter(r => !isHiddenPath(r.filePath)))
    : searchResults

  return (
    <>
      {open && (
        <div class="sidebar-overlay" onClick={onClose} />
      )}
      <aside class="sidebar" data-open={String(!!open)} ref={asideRef}>
        <div class="sidebar-header">
          {headerExtra && <div style={{ marginBottom: '8px' }}>{headerExtra}</div>}
          <div class="sidebar-title">
            <Icon name="book" size={16} aria-hidden="true" />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{dirName}</span>
            <button
              class="sidebar-hidden-toggle-btn"
              data-testid="toggle-hidden-files"
              aria-label={showHidden ? '隐藏点文件' : '显示隐藏文件'}
              aria-pressed={showHidden}
              title={showHidden ? '隐藏点文件' : '显示隐藏文件'}
              onClick={onToggleShowHidden}
            >
              <Icon name={showHidden ? 'eye' : 'eye-off'} size={15} aria-hidden="true" />
            </button>
          </div>
          <SearchBar
            query={query}
            onQueryChange={onQueryChange}
            searchType={searchType}
            onTypeChange={onTypeChange}
            loading={searchLoading}
          />
        </div>
        <div class="file-list">
          {/* 根节点行 */}
          <div
            class={`folder-row sidebar-root-row ${currentPath === '' ? 'active' : ''}`}
            style={{ paddingLeft: '8px' }}
            onClick={() => handleSelect({ name: dirName, type: 'folder', path: '', children: [] })}
          >
            <Icon name="home" size={15} class="folder-icon" aria-hidden="true" />
            <span class="folder-name" style={{ fontSize: '13px', flex: 1 }}>{dirName}</span>
            <button
              class="sidebar-collapse-btn"
              title="折叠全部"
              onClick={(e) => { e.stopPropagation(); treeRef.current?.collapseAll() }}
            >⊖</button>
          </div>
          {treeLoading ? (
            <div class="tree-skeleton">
              {[0.7, 0.5, 0.85, 0.6, 0.75, 0.45, 0.9, 0.55].map((w, i) => (
                <div key={i} class="tree-skeleton-row" style={{ paddingLeft: `${8 + (i % 3) * 12}px` }}>
                  <div class="tree-skeleton-icon" />
                  <div class="tree-skeleton-line" style={{ width: `${w * 100}%` }} />
                </div>
              ))}
            </div>
          ) : visibleSearchResults && visibleSearchResults.length === 0 && query ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '12px 8px', textAlign: 'center' }}>
              无匹配结果
            </div>
          ) : (
            <FileTree
              ref={treeRef}
              nodes={visibleTree}
              currentPath={currentPath}
              onSelect={handleSelect}
              onExpand={onExpandFolder}
              searchResults={visibleSearchResults && query ? visibleSearchResults : null}
              mobileMode={!!open}
            />
          )}
        </div>
        <div
          class="sidebar-resize-handle"
          data-testid="sidebar-resize-handle"
          onPointerDown={handleResizeStart}
        />
      </aside>
    </>
  )
}

export default Sidebar
