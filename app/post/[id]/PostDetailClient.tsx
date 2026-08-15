'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { Post, PurchaseLink } from '@/lib/types'
import { ArrowLeft } from 'lucide-react'
import PostCard from '@/components/PostCard'
import Toast from '@/components/Toast'
import EndedDealNotice from '@/components/EndedDealNotice'
import { track } from '@/lib/track'

interface Props {
  post: Post
  /** 마감이 지난 공구 — 페이지는 유지하되 화면을 종료 상태로 바꾼다 */
  ended?: boolean
  purchaseLinks?: PurchaseLink[]
  related?: Post[]
}

export default function PostDetailClient({ post, ended = false, purchaseLinks = [], related = [] }: Props) {
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set())
  const [toast, setToast] = useState({ message: '', visible: false })

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('gonggu_bookmarks') || '[]')
    setBookmarks(new Set(saved))
    track('view')
    // 종료된 공구에도 상세 조회가 계속 잡히는지 봐야 "아직 수요가 있는 상품"을 가려낼 수 있다
    track('click', { postId: post.id, clickType: 'detail' })
  }, [post.id])

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

  function recordRecentlyViewed(id: number) {
    const prev: number[] = JSON.parse(localStorage.getItem('gonggu_recent') || '[]')
    const next = [id, ...prev.filter(x => x !== id)].slice(0, 20)
    localStorage.setItem('gonggu_recent', JSON.stringify(next))
  }

  return (
    <>
      <header>
        <div className="header-inner">
          <Link href="/" className="back-btn"><ArrowLeft size={16} /></Link>
          <div className="logo">
            <span className="logo-text">🍯 꿀공구</span>
          </div>
        </div>
      </header>

      <div className="feed" style={{ paddingBottom: 100, paddingTop: 12 }}>
        <PostCard
          post={post}
          isBookmarked={bookmarks.has(post.id)}
          onToggleBookmark={toggleBookmark}
          onJoin={id => { track('join', { postId: id, clickType: 'groupbuy' }); recordRecentlyViewed(id) }}
          onShare={(id, result) => {
            if (result === 'clipboard') showToast('링크가 복사되었어요')
            track('share', { postId: id })
          }}
        />
      </div>

      {ended && <EndedDealNotice post={post} purchaseLinks={purchaseLinks} related={related} />}

      <div style={{ padding: '0 16px 24px', textAlign: 'center' }}>
        <Link href="/" style={{ fontSize: 13, color: '#6366f1', fontWeight: 600, textDecoration: 'none' }}>
          다른 공구도 보러 가기 →
        </Link>
      </div>

      <Toast
        message={toast.message}
        visible={toast.visible}
        onHide={() => setToast(t => ({ ...t, visible: false }))}
      />
    </>
  )
}
