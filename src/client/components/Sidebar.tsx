import { useRef } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'
import type { FileNode, SearchResult } from '../../types.js'
import type { SearchType } from '../hooks/useSearch.js'
import FileTree, { type FileTreeHandle } from './FileTree.js'
import SearchBar from './SearchBar.js'

interface Props {
  tree: FileNode[]
  currentPath: string | null
  onSelect: (node: FileNode) => void
  query: string
  onQueryChange: (q: string) => void
  searchType: SearchType
  onTypeChange: (t: SearchType) => void
  searchResults: SearchResult[] | null
  searchLoading: boolean
  dirName: string
  // 移动端抽屉控制
  open?: boolean
  onClose?: () => void
  // 文件树初始加载中
  treeLoading?: boolean
}

const Sidebar: FunctionalComponent<Props> = ({
  tree,
  currentPath,
  onSelect,
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
}) => {
  const treeRef = useRef<FileTreeHandle>(null)

  const handleSelect = (node: FileNode) => {
    onSelect(node)
    // 移动端：选择文件/文件夹后自动收起抽屉
    onClose?.()
  }

  return (
    <>
      {/* 移动端半透明遮罩，点击收起 Sidebar */}
      {open && (
        <div class="sidebar-overlay" onClick={onClose} />
      )}
      <aside class="sidebar" data-open={String(!!open)}>
        <div class="sidebar-header">
          <div class="sidebar-title">
            <span>📚</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dirName}</span>
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
            <span class="folder-icon">🏠</span>
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
          ) : searchResults && searchResults.length === 0 && query ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '12px 8px', textAlign: 'center' }}>
              无匹配结果
            </div>
          ) : (
            <FileTree
              ref={treeRef}
              nodes={tree}
              currentPath={currentPath}
              onSelect={handleSelect}
              searchResults={searchResults && query ? searchResults : null}
              mobileMode={!!open}
            />
          )}
        </div>
      </aside>
    </>
  )
}

export default Sidebar
