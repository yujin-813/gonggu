interface HeaderProps {
  searchQuery: string
  onSearch: (q: string) => void
  onBookmarkView: () => void
  viewingBookmarks: boolean
}

export default function Header({ searchQuery, onSearch, onBookmarkView, viewingBookmarks }: HeaderProps) {
  return (
    <header>
      <div className="header-inner">
        <div className="logo">공구모아 <span>🛍️</span></div>
        <input
          className="search-bar"
          type="search"
          placeholder="브랜드, 상품 검색..."
          value={searchQuery}
          onChange={e => onSearch(e.target.value)}
        />
        <button className="btn-icon" onClick={onBookmarkView} title="찜 목록">
          {viewingBookmarks ? '🏠' : '🤍'}
        </button>
      </div>
    </header>
  )
}
