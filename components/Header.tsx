import Link from 'next/link'
import { Bell, BellOff, Star, House, Heart, Users, PackagePlus, Menu } from 'lucide-react'

interface HeaderProps {
  onBookmarkView: () => void
  viewingBookmarks: boolean
  onFollowView: () => void
  viewingFollowed: boolean
  onPushToggle: () => void
  pushSubscribed: boolean
  /** 카테고리 드롭다운을 여는 버튼 — 항상 같은 자리에 고정해 둔다. 스크롤에 따라
   * 나타났다 사라지면 로고가 밀리는 느낌이 들어서(사장님 피드백), 접혔을 때만 보이게
   * 하는 대신 늘 자리를 차지하게 바꿨다. */
  onCategoryMenuToggle?: () => void
}

export default function Header({
  onBookmarkView, viewingBookmarks, onFollowView, viewingFollowed,
  onPushToggle, pushSubscribed, onCategoryMenuToggle,
}: HeaderProps) {
  return (
    <header>
      <div className="header-inner">
        <button className="btn-icon" onClick={onCategoryMenuToggle} title="카테고리" aria-label="카테고리">
          <Menu size={18} />
        </button>
        <Link href="/" className="logo" aria-label="홈으로">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-symbol.png" alt="" className="logo-symbol" width={20} height={20} />
          <span className="logo-text">꿀공구</span>
          <span className="logo-tagline">| 꿀 같은 공구만 모아드려요</span>
        </Link>
        <div style={{ flex: 1 }} />
        <Link href="/request" className="btn-icon" title="내 공구 등록 요청하기">
          <PackagePlus size={18} />
        </Link>
        <Link href="/influencers" className="btn-icon" title="인플루언서 목록">
          <Users size={18} />
        </Link>
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
