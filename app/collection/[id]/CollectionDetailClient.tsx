'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Script from 'next/script'
import type { Post, Collection } from '@/lib/types'
import { daysLeft } from '@/lib/period'
import { ArrowLeft, Share2 } from 'lucide-react'
import PostCard from '@/components/PostCard'
import Toast from '@/components/Toast'

const SITE_URL = 'https://gonggu.asknuggetdata.com'

function getSession(): string {
  let id = sessionStorage.getItem('_dj_sid')
  if (!id) { id = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('_dj_sid', id) }
  return id
}
function getVisitorId(): string {
  let id = localStorage.getItem('_dj_vid')
  if (!id) { id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); localStorage.setItem('_dj_vid', id) }
  return id
}
function track(type: string, extra?: { postId?: number }) {
  fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, sessionId: getSession(), visitorId: getVisitorId(), postId: extra?.postId }),
  }).catch(() => {})
}

declare global {
  interface Window {
    Kakao?: {
      isInitialized: () => boolean
      init: (key: string) => void
      Share: { sendDefault: (opts: Record<string, unknown>) => void }
    }
  }
}

interface Props {
  collection: Collection
  posts: Post[]
}

export default function CollectionDetailClient({ collection, posts }: Props) {
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set())
  const [toast, setToast] = useState({ message: '', visible: false })

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('gonggu_bookmarks') || '[]')
    setBookmarks(new Set(saved))
    track('view')
    track('collection_view')
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

  function recordRecentlyViewed(id: number) {
    const prev: number[] = JSON.parse(localStorage.getItem('gonggu_recent') || '[]')
    const next = [id, ...prev.filter(x => x !== id)].slice(0, 20)
    localStorage.setItem('gonggu_recent', JSON.stringify(next))
  }

  const dLeft = collection.expiresAt ? daysLeft(collection.expiresAt) : null
  const isClosed = dLeft !== null && dLeft < 0
  const shareUrl = `${SITE_URL}/collection/${collection.id}`

  async function share() {
    const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY
    try {
      if (kakaoKey && window.Kakao) {
        if (!window.Kakao.isInitialized()) window.Kakao.init(kakaoKey)
        window.Kakao.Share.sendDefault({
          objectType: 'feed',
          content: {
            title: `${collection.emoji} ${collection.title}`,
            description: collection.description || `${posts.length}개의 공구를 모아봤어요`,
            imageUrl: posts.find(p => p.img)?.img || `${SITE_URL}/favicon.ico`,
            link: { mobileWebUrl: shareUrl, webUrl: shareUrl },
          },
          buttons: [{ title: '컬렉션 보러가기', link: { mobileWebUrl: shareUrl, webUrl: shareUrl } }],
        })
        return
      }
      if (navigator.share) {
        await navigator.share({ title: collection.title, text: collection.description, url: shareUrl })
        return
      }
      await navigator.clipboard.writeText(shareUrl)
      showToast('링크가 복사되었어요')
    } catch {
      // 사용자가 공유를 취소한 경우 등 — 조용히 무시
    }
  }

  return (
    <>
      {process.env.NEXT_PUBLIC_KAKAO_JS_KEY && (
        <Script src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js" strategy="afterInteractive" />
      )}

      <header>
        <div className="header-inner">
          <Link href="/" className="back-btn"><ArrowLeft size={16} /></Link>
          <div className="logo">
            <span className="logo-text">{collection.emoji} {collection.title}</span>
          </div>
        </div>
      </header>

      <div
        className="collection-hero"
        style={{ background: `linear-gradient(135deg, ${collection.color}, ${collection.color}cc)` }}
      >
        <div className="collection-hero-emoji">{collection.emoji}</div>
        <h1 className="collection-hero-title">{collection.title}</h1>
        {collection.description && <p className="collection-hero-desc">{collection.description}</p>}
        <div className="collection-hero-meta">
          <span>{posts.length}개 상품</span>
          {dLeft !== null && (
            <span>{isClosed ? '마감' : dLeft === 0 ? '오늘 마감' : `D-${dLeft}`}</span>
          )}
        </div>
      </div>

      <div className="feed" style={{ paddingBottom: 100 }}>
        {posts.length === 0 ? (
          <div className="empty">
            <p>아직 담긴 상품이 없어요</p>
          </div>
        ) : (
          posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              isBookmarked={bookmarks.has(post.id)}
              onToggleBookmark={toggleBookmark}
              onJoin={id => { track('join', { postId: id }); recordRecentlyViewed(id) }}
            />
          ))
        )}
      </div>

      <div className="collection-share-bar">
        <button className="collection-share-btn" onClick={share}>
          <Share2 size={16} /> 카카오톡으로 이 컬렉션 공유하기
        </button>
      </div>

      <Toast
        message={toast.message}
        visible={toast.visible}
        onHide={() => setToast(t => ({ ...t, visible: false }))}
      />
    </>
  )
}
