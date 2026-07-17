import { ShoppingBag, Bell, BellOff, Star, House, Heart } from 'lucide-react'

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
        <div className="logo">
          <ShoppingBag size={20} strokeWidth={2.2} />
          <span className="logo-text">지니모아</span>
          <span className="logo-tagline">| 인스타 공구 모아보기</span>
        </div>
        <input
          className="search-bar"
          type="search"
          placeholder="브랜드, 상품 검색..."
          value={searchQuery}
          onChange={e => onSearch(e.target.value)}
        />
        <button
          className={`btn-icon ${pushSubscribed ? 'active' : ''}`}
          onClick={onPushToggle}
          title={pushSubscribed ? '마감 알림 끄기' : '찜한 공구 마감 알림 받기'}
        >
          {pushSubscribed ? <Bell size={18} /> : <BellOff size={18} />}
        </button>
        <button
          className={`btn-icon ${viewingFollowed ? 'active' : ''}`}
          onClick={onFollowView}
          title="팔로우한 카테고리·인플루언서"
        >
          {viewingFollowed ? <House size={18} /> : <Star size={18} />}
        </button>
        <button
          className={`btn-icon ${viewingBookmarks ? 'active' : ''}`}
          onClick={onBookmarkView}
          title="찜 목록"
        >
          {viewingBookmarks ? <House size={18} /> : <Heart size={18} />}
        </button>
      </div>
    </header>
  )
}
