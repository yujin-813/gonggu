'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { Post } from '@/lib/types'
import { ArrowLeft } from 'lucide-react'
import PostCard from '@/components/PostCard'
import Toast from '@/components/Toast'
import { track } from '@/lib/track'

// /today, /deadline, /monthly, /category/[cat] 네 종류의 검색 착지 페이지가 쓰는 공통 목록.
// 서버 컴포넌트가 필터링한 posts를 props로 받으므로 첫 응답 HTML에 상품명·가격이 그대로
// 들어가고, 검색엔진이 자바스크립트 실행 없이 본문을 읽을 수 있다.

interface Props {
  h1: string
  description: string
  empty: string
  posts: Post[]
  /** 상단에 함께 노출할 다른 모아보기 링크 — 내부 링크를 늘려 색인에 도움을 준다 */
  related?: { href: string; label: string }[]
}

export default function DealListClient({ h1, description, empty, posts, related = [] }: Props) {
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

  return (
    <>
      <header>
        <div className="header-inner">
          <Link href="/" className="back-btn" aria-label="홈으로"><ArrowLeft size={16} /></Link>
          <div className="logo">
            <span className="logo-text">{h1}</span>
          </div>
        </div>
      </header>

      <div className="landing-hero">
        <h1 className="landing-hero-title">{h1}</h1>
        <p className="landing-hero-desc">{description}</p>
        <div className="landing-hero-meta">
          <span>공구 {posts.length}건</span>
        </div>
      </div>

      {related.length > 0 && (
        <nav className="landing-links" aria-label="다른 모아보기">
          {related.map(r => (
            <Link key={r.href} href={r.href} className="landing-link">{r.label}</Link>
          ))}
        </nav>
      )}

      <div className="feed" style={{ paddingBottom: 100 }}>
        {posts.length === 0 ? (
          <div className="empty"><p>{empty}</p></div>
        ) : (
          posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              isBookmarked={bookmarks.has(post.id)}
              onToggleBookmark={toggleBookmark}
              onJoin={id => track('join', { postId: id })}
              onShare={(id, result) => {
                if (result === 'clipboard') showToast('링크가 복사되었어요')
                track('share', { postId: id })
              }}
            />
          ))
        )}
      </div>

      <Toast
        message={toast.message}
        visible={toast.visible}
        onHide={() => setToast(t => ({ ...t, visible: false }))}
      />
    </>
  )
}
