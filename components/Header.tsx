'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Bell, BellOff, Star, Heart, Users, PackagePlus, Menu, Settings } from 'lucide-react'

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
  // 아이콘 5개를 오른쪽에 늘어놓던 걸 설정 아이콘 하나로 합쳤다 — 사장님 피드백:
  // 뭐가 뭔지 아이콘만 봐서는 구분이 안 됐다. 눌렀을 때 한글 목록으로 펼친다.
  const [menuOpen, setMenuOpen] = useState(false)

  function closeAnd(fn: () => void) {
    return () => { fn(); setMenuOpen(false) }
  }

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
        <button
          className={`btn-icon ${menuOpen ? 'active' : ''}`}
          onClick={() => setMenuOpen(v => !v)}
          title="메뉴"
          aria-label="메뉴"
        >
          <Settings size={18} />
        </button>
      </div>

      {menuOpen && (
        <>
          <div className="header-menu-overlay" onClick={() => setMenuOpen(false)} />
          <div className="header-menu-panel" onClick={e => e.stopPropagation()}>
            <Link href="/request" className="header-menu-item" onClick={() => setMenuOpen(false)}>
              <PackagePlus size={16} /> 내 공구 등록 요청하기
            </Link>
            <Link href="/influencers" className="header-menu-item" onClick={() => setMenuOpen(false)}>
              <Users size={16} /> 인플루언서 목록
            </Link>
            <button className="header-menu-item" onClick={closeAnd(onPushToggle)}>
              {pushSubscribed ? <Bell size={16} /> : <BellOff size={16} />}
              {pushSubscribed ? '마감 알림 끄기' : '찜한 공구 마감 알림 받기'}
            </button>
            <button className="header-menu-item" onClick={closeAnd(onFollowView)}>
              <Star size={16} /> {viewingFollowed ? '전체 목록으로 돌아가기' : '팔로우한 인플루언서 보기'}
            </button>
            <button className="header-menu-item" onClick={closeAnd(onBookmarkView)}>
              <Heart size={16} /> {viewingBookmarks ? '전체 목록으로 돌아가기' : '찜 목록 보기'}
            </button>
          </div>
        </>
      )}
    </header>
  )
}
