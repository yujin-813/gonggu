'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { Post } from '@/lib/types'
import { ArrowLeft } from 'lucide-react'
import PostCard from '@/components/PostCard'
import Toast from '@/components/Toast'
import { track } from '@/lib/track'

interface Props {
  brand: string
  active: Post[]
  ended: Post[]
}

// 브랜드 소개 문구 대신 지금 있는 실제 공구·가격 데이터로 본문을 채운다 — 카피가 아니라
// 숫자가 이 페이지의 콘텐츠다.
export default function BrandPageClient({ brand, active, ended }: Props) {
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set())
  const [toast, setToast] = useState({ message: '', visible: false })

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('gonggu_bookmarks') || '[]')
    setBookmarks(new Set(saved))
    track('view')
  }, [])

  function showToast(message: string) {
    setToast({ message, visible: true })
  }

  function toggleBookmark(id: number) {
    setBookmarks(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id); showToast('찜을 해제했어요') }
      else { next.add(id); showToast('찜 목록에 추가했어요!'); track('bookmark', { postId: id }) }
      localStorage.setItem('gonggu_bookmarks', JSON.stringify([...next]))
      return next
    })
  }

  function onJoin(id: number) { track('join', { postId: id }) }
  function onShare(id: number, result: string) {
    if (result === 'clipboard') showToast('링크가 복사되었어요')
    track('share', { postId: id })
  }

  return (
    <>
      <header>
        <div className="header-inner">
          <Link href="/" className="back-btn" aria-label="홈으로"><ArrowLeft size={16} /></Link>
          <div className="logo">
            <span className="logo-text">{brand} 공구</span>
          </div>
        </div>
      </header>

      <div className="landing-hero">
        <h1 className="landing-hero-title">{brand} 공구 가격 비교</h1>
        <p className="landing-hero-desc">
          {active.length > 0
            ? `진행 중인 ${brand} 공동구매 ${active.length}건을 모았어요. 인플루언서별 공구가와 일반 판매가를 비교해 지금 사도 되는지 확인하세요.`
            : `지금 진행 중인 ${brand} 공구는 없어요. 최근 진행됐던 공구가와 가격을 확인하세요.`}
        </p>
        <div className="landing-hero-meta">
          <span>진행 중 {active.length}건</span>
          {ended.length > 0 && <span>· 최근 종료 {ended.length}건</span>}
        </div>
      </div>

      <div className="feed" style={{ paddingBottom: ended.length > 0 ? 0 : 100 }}>
        {active.length === 0 ? (
          <div className="empty"><p>진행 중인 {brand} 공구가 없어요</p></div>
        ) : (
          active.map(post => (
            <PostCard
              key={post.id}
              post={post}
              isBookmarked={bookmarks.has(post.id)}
              onToggleBookmark={toggleBookmark}
              onJoin={onJoin}
              onShare={onShare}
            />
          ))
        )}
      </div>

      {ended.length > 0 && (
        <>
          <div className="landing-hero" style={{ paddingTop: 8 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>최근 종료된 {brand} 공구</h2>
            <p className="landing-hero-desc">그때 얼마였는지, 지금도 살 수 있는지 확인할 수 있어요.</p>
          </div>
          <div className="feed" style={{ paddingBottom: 100 }}>
            {ended.map(post => (
              <PostCard
                key={post.id}
                post={post}
                isBookmarked={bookmarks.has(post.id)}
                onToggleBookmark={toggleBookmark}
                onJoin={onJoin}
                onShare={onShare}
                endedCompact
              />
            ))}
          </div>
        </>
      )}

      <Toast
        message={toast.message}
        visible={toast.visible}
        onHide={() => setToast(t => ({ ...t, visible: false }))}
      />
    </>
  )
}
