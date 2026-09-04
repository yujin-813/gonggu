'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { Post, CuratedSubject } from '@/lib/types'
import { ArrowLeft } from 'lucide-react'
import PostCard from '@/components/PostCard'
import Toast from '@/components/Toast'
import { track } from '@/lib/track'

const KIND_LABEL: Record<string, string> = { brand: '브랜드', influencer: '인플루언서', seller: '셀러' }

interface Props {
  subject: CuratedSubject
  active: Post[]
  upcoming: Post[]
  ended: Post[]
}

// 소개 문구 대신 지금 있는 실제 공구·가격 데이터로 본문을 채운다 — 카피가 아니라
// 숫자가 이 페이지의 콘텐츠다. lib/brandPages.ts 기반 BrandPageClient.tsx와 같은 구조.
export default function PickPageClient({ subject, active, upcoming, ended }: Props) {
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set())
  const [toast, setToast] = useState({ message: '', visible: false })
  const kindLabel = KIND_LABEL[subject.kind] || ''

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
          {/* /pick 목록에서 들어오는 게 자연스러운 동선이라, 홈이 아니라 목록으로 돌아간다
              — 브랜드/인플루언서 페이지처럼 홈으로 고정하면 "뒤로가기가 안 먹는 느낌"이 든다 */}
          <Link href="/pick" className="back-btn" aria-label="공구 모음 목록으로"><ArrowLeft size={16} /></Link>
          <div className="logo">
            <span className="logo-text">{subject.label} 공구 모음</span>
          </div>
        </div>
      </header>

      <div className="landing-hero">
        <h1 className="landing-hero-title">{subject.label} 공구 모음</h1>
        <p className="landing-hero-desc">
          {active.length > 0
            ? `${kindLabel} ${subject.label}이(가) 진행 중인 공동구매 ${active.length}건을 모았어요.`
            : upcoming.length > 0
              ? `지금 진행 중인 공구는 없지만, 곧 열리는 공구 ${upcoming.length}건이 있어요.`
              : `지금 진행 중인 공구는 없어요. 최근 진행됐던 공구가와 가격을 확인하세요.`}
        </p>
        <div className="landing-hero-meta">
          <span>진행 중 {active.length}건</span>
          {upcoming.length > 0 && <span>· 오픈 예정 {upcoming.length}건</span>}
          {ended.length > 0 && <span>· 최근 종료 {ended.length}건</span>}
        </div>
      </div>

      <div className="feed" style={{ paddingBottom: upcoming.length > 0 || ended.length > 0 ? 0 : 100 }}>
        {active.length === 0 ? (
          <div className="empty"><p>진행 중인 {subject.label} 공구가 없어요</p></div>
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

      {upcoming.length > 0 && (
        <>
          <div className="landing-hero" style={{ paddingTop: 8 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>오픈 예정인 {subject.label} 공구</h2>
            <p className="landing-hero-desc">곧 열리는 공구예요. 캘린더에 담아두면 잊지 않고 확인할 수 있어요.</p>
          </div>
          <div className="feed" style={{ paddingBottom: ended.length > 0 ? 0 : 100 }}>
            {upcoming.map(post => (
              <PostCard
                key={post.id}
                post={post}
                isBookmarked={bookmarks.has(post.id)}
                onToggleBookmark={toggleBookmark}
                onJoin={onJoin}
                onShare={onShare}
              />
            ))}
          </div>
        </>
      )}

      {ended.length > 0 && (
        <>
          <div className="landing-hero" style={{ paddingTop: 8 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>최근 종료된 {subject.label} 공구</h2>
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
