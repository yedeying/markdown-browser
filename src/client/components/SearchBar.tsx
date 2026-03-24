import type { FunctionalComponent } from 'preact'
import type { SearchType } from '../hooks/useSearch.js'

interface Props {
  query: string
  onQueryChange: (q: string) => void
  searchType: SearchType
  onTypeChange: (t: SearchType) => void
  loading?: boolean
}

const SearchBar: FunctionalComponent<Props> = ({
  query,
  onQueryChange,
  searchType,
  onTypeChange,
  loading,
}) => {
  return (
    <div class="search-container">
      <input
        type="text"
        class="search-input"
        placeholder={searchType === 'name' ? '搜索文件名...' : '全文搜索...'}
        value={query}
        onInput={(e) => onQueryChange((e.target as HTMLInputElement).value)}
      />
      <button
        class={`btn search-type-btn ${searchType === 'content' ? 'active' : ''}`}
        onClick={() => onTypeChange(searchType === 'name' ? 'content' : 'name')}
        title={searchType === 'name' ? '切换到全文搜索' : '切换到文件名搜索'}
      >
        {loading ? '...' : searchType === 'name' ? '名' : '文'}
      </button>
    </div>
  )
}

export default SearchBar
