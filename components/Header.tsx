interface HeaderProps {
  searchQuery: string
  onSearch: (q: string) => void
  onBookmarkView: () => void
  viewingBookmarks: boolean
  onFollowView: () => void
  viewingFollowed: boolean
  onPushToggle: () => void
  pushSubscribed: boolean
}

export default function Header({
  searchQuery, onSearch, onBookmarkView, viewingBookmarks, onFollowView, viewingFollowed,
  onPushToggle, pushSubscribed,
}: HeaderProps) {
  return (
    <header>
      <div className="header-inner">
        <div className="logo">딜조아 <span>🛍️</span></div>
        <input
          className="search-bar"
          type="search"
          placeholder="브랜드, 상품 검색..."
          value={searchQuery}
          onChange={e => onSearch(e.target.value)}
        />
        <button className="btn-icon" onClick={onPushToggle} title={pushSubscribed ? '마감 알림 끄기' : '찜한 공구 마감 알림 받기'}>
          {pushSubscribed ? '🔔' : '🔕'}
        </button>
        <button className="btn-icon" onClick={onFollowView} title="팔로우한 카테고리·인플루언서">
          {viewingFollowed ? '🏠' : '⭐'}
        </button>
        <button className="btn-icon" onClick={onBookmarkView} title="찜 목록">
          {viewingBookmarks ? '🏠' : '🤍'}
        </button>
      </div>
    </header>
  )
}
