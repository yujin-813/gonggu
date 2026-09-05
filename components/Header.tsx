'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Menu, Settings } from 'lucide-react'
import { track } from '@/lib/track'

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

  function closeAnd(fn: () => void, label?: string) {
    return () => { if (label) track('menu', { label }); fn(); setMenuOpen(false) }
  }

  return (
    <header>
      <div className="header-inner">
        <button className="btn-icon" onClick={onCategoryMenuToggle} title="카테고리" aria-label="카테고리">
          <Menu size={18} />
        </button>
        {/* 로고는 일부러 Link가 아니라 진짜 <a>다 — Link(클라이언트 이동)는 검색어·필터·
            스크롤 위치 같은 홈의 로컬 상태를 안 지운다. 로고는 "처음으로 돌아가기"라
            실제로 새로고침돼서 깨끗한 상태로 열려야 한다(사장님 확인). */}
        <a href="/" className="logo" aria-label="홈으로">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-symbol.png" alt="" className="logo-symbol" width={20} height={20} />
          <span className="logo-text">꿀공구</span>
          <span className="logo-tagline">| 꿀 같은 공구만 모아드려요</span>
        </a>
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
            <Link href="/propose" className="header-menu-card" onClick={closeAnd(() => {}, '제휴 문의')}>
              <span className="header-menu-card-title">제휴 문의<ChevronRight size={15} /></span>
              <span className="header-menu-card-sub">브랜드·인플루언서 제안</span>
            </Link>
            <Link href="/influencers" className="header-menu-card" onClick={closeAnd(() => {}, '인플루언서')}>
              <span className="header-menu-card-title">인플루언서<ChevronRight size={15} /></span>
              <span className="header-menu-card-sub">전체 목록 보기</span>
            </Link>
            <Link href="/pick" className="header-menu-card" onClick={closeAnd(() => {}, '공구 모음')}>
              <span className="header-menu-card-title">공구 모음<ChevronRight size={15} /></span>
              <span className="header-menu-card-sub">브랜드·셀러별로 모아보기</span>
            </Link>
            <button className="header-menu-card" onClick={closeAnd(onPushToggle, '마감 알림')}>
              <span className="header-menu-card-title">마감 알림<ChevronRight size={15} /></span>
              <span className="header-menu-card-sub">{pushSubscribed ? '알림 끄기' : '찜한 공구 알림 받기'}</span>
            </button>
            <button className="header-menu-card" onClick={closeAnd(onFollowView, '팔로우')}>
              <span className="header-menu-card-title">팔로우<ChevronRight size={15} /></span>
              <span className="header-menu-card-sub">{viewingFollowed ? '전체 목록으로 돌아가기' : '팔로우한 인플루언서'}</span>
            </button>
            <button className="header-menu-card" onClick={closeAnd(onBookmarkView, '찜 목록')}>
              <span className="header-menu-card-title">찜 목록<ChevronRight size={15} /></span>
              <span className="header-menu-card-sub">{viewingBookmarks ? '전체 목록으로 돌아가기' : '찜한 공구 보기'}</span>
            </button>
          </div>
        </>
      )}
    </header>
  )
}
