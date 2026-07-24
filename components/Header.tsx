import { Bell, BellOff, Star, House, Heart } from 'lucide-react'

interface HeaderProps {
  onBookmarkView: () => void
  viewingBookmarks: boolean
  onFollowView: () => void
  viewingFollowed: boolean
  onPushToggle: () => void
  pushSubscribed: boolean
}

export default function Header({
  onBookmarkView, viewingBookmarks, onFollowView, viewingFollowed,
  onPushToggle, pushSubscribed,
}: HeaderProps) {
  return (
    <header>
      <div className="header-inner">
        <div className="logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-symbol.png" alt="" className="logo-symbol" width={20} height={20} />
          <span className="logo-text">꿀공구</span>
          <span className="logo-tagline">| 꿀 같은 공구만 모아드려요</span>
        </div>
        <div style={{ flex: 1 }} />
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
          title="팔로우한 인플루언서"
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
