'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import CategoryFilter from '@/components/CategoryFilter'
import PostCard from '@/components/PostCard'
import Toast from '@/components/Toast'
import type { Post, Category, SortOrder, Collection } from '@/lib/types'
import { categoryIcon } from '@/lib/categoryIcons'
import { isEvergreen } from '@/lib/period'
import { Bell, ArrowLeft, Heart, Star, Clock, Loader2, Search, MessageCircle, X } from 'lucide-react'

function daysLeft(deadline?: string): number {
  if (!deadline) return 999
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(deadline)
  d.setHours(0, 0, 0, 0)
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function getSession(): string {
  let id = sessionStorage.getItem('_dj_sid')
  if (!id) { id = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('_dj_sid', id) }
  return id
}

// 세션(탭)과 무관하게 이 브라우저를 계속 식별하는 영구 ID — "재방문자" 판별용
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

// VAPID 공개키(base64url) → 브라우저 PushManager가 요구하는 Uint8Array 형식으로 변환
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

// 카카오톡 채널 추가 링크 — 별도 SDK 없이도 앱/웹 어디서나 동작하는 공식 딥링크 형식
const KAKAO_CHANNEL_URL = 'http://pf.kakao.com/_WVxgfX/friend'

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([])
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set())
  const [currentCat, setCurrentCat] = useState<Category | 'all' | 'evergreen'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<SortOrder>('latest')
  const [viewingBookmarks, setViewingBookmarks] = useState(false)
  const [toast, setToast] = useState({ message: '', visible: false })
  const [loading, setLoading] = useState(true)
  const [recentlyViewed, setRecentlyViewed] = useState<number[]>([])
  const [followedInfluencers, setFollowedInfluencers] = useState<Set<string>>(new Set())
  const [viewingFollowed, setViewingFollowed] = useState(false)
  const [pushSubscribed, setPushSubscribed] = useState(false)
  const [collections, setCollections] = useState<Collection[]>([])
  const [kakaoBannerDismissed, setKakaoBannerDismissed] = useState(true)  // 초기 렌더 깜빡임 방지 — mount 시 localStorage 값으로 교체

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('gonggu_bookmarks') || '[]')
    setBookmarks(new Set(saved))
    setRecentlyViewed(JSON.parse(localStorage.getItem('gonggu_recent') || '[]'))
    setFollowedInfluencers(new Set(JSON.parse(localStorage.getItem('gonggu_followed_accounts') || '[]')))
    setKakaoBannerDismissed(localStorage.getItem('gonggu_kakao_dismissed') === '1')
    fetchPosts()
    fetchCollections()
    track('view')
    if (pushSupported()) {
      navigator.serviceWorker.getRegistration('/sw.js')
        .then(reg => reg?.pushManager.getSubscription())
        .then(sub => setPushSubscribed(!!sub))
        .catch(() => {})
    }
  }, [])

  // 찜 목록이 바뀌면(알림 구독 중일 때만) 서버에 최신 찜 목록을 다시 동기화 —
  // 마감 임박 알림은 서버가 이 목록을 기준으로 보내기 때문에 항상 최신 상태여야 한다
  useEffect(() => {
    if (!pushSubscribed || !pushSupported()) return
    navigator.serviceWorker.getRegistration('/sw.js').then(async reg => {
      const sub = await reg?.pushManager.getSubscription()
      if (!sub) return
      fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId: getVisitorId(), subscription: sub.toJSON(), bookmarkedPostIds: [...bookmarks] }),
      }).catch(() => {})
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmarks, pushSubscribed])

  async function subscribeToPush() {
    if (!pushSupported()) { showToast('이 브라우저는 알림을 지원하지 않아요'); return }
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidKey) { showToast('알림 기능이 아직 설정되지 않았어요'); return }
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { showToast('알림 권한을 허용해주셔야 받을 수 있어요'); return }
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      })
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId: getVisitorId(), subscription: sub.toJSON(), bookmarkedPostIds: [...bookmarks] }),
      })
      setPushSubscribed(true)
      showToast('찜한 공구 마감 알림을 켰어요!')
    } catch {
      showToast('알림 설정에 실패했어요')
    }
  }

  async function unsubscribeFromPush() {
    try {
      if (pushSupported()) {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js')
        const sub = await reg?.pushManager.getSubscription()
        await sub?.unsubscribe()
      }
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId: getVisitorId() }),
      })
    } catch {}
    setPushSubscribed(false)
    showToast('마감 알림을 껐어요')
  }

  function togglePush() {
    if (pushSubscribed) unsubscribeFromPush()
    else subscribeToPush()
  }

  function toggleFollowInfluencer(account: string) {
    setFollowedInfluencers(prev => {
      const next = new Set(prev)
      if (next.has(account)) { next.delete(account); showToast('팔로우를 취소했어요') }
      else { next.add(account); showToast('인플루언서를 팔로우했어요!') }
      localStorage.setItem('gonggu_followed_accounts', JSON.stringify([...next]))
      return next
    })
  }

  // "공구 보기"를 눌러 실제로 관심을 보인 상품을 최근 본 목록에 기록 (최대 20개, 중복 제거)
  function recordRecentlyViewed(id: number) {
    setRecentlyViewed(prev => {
      const next = [id, ...prev.filter(x => x !== id)].slice(0, 20)
      localStorage.setItem('gonggu_recent', JSON.stringify(next))
      return next
    })
  }

  async function fetchPosts() {
    setLoading(true)
    try {
      const res = await fetch('/api/posts?per_page=200')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setPosts(data.posts ?? [])
    } catch {
      setPosts([])
    } finally {
      setLoading(false)
    }
  }

  async function fetchCollections() {
    try {
      const res = await fetch('/api/collections')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setCollections(data.collections ?? [])
    } catch {
      setCollections([])
    }
  }

  function saveBookmarks(next: Set<number>) {
    localStorage.setItem('gonggu_bookmarks', JSON.stringify([...next]))
  }

  function toggleBookmark(id: number) {
    setBookmarks(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        showToast('찜을 해제했어요')
      } else {
        next.add(id)
        showToast('찜 목록에 추가했어요!')
        track('bookmark')
      }
      saveBookmarks(next)
      return next
    })
  }

  const showToast = useCallback((message: string) => {
    setToast({ message, visible: true })
  }, [])

  // Filter + sort
  let filtered = viewingBookmarks
    ? posts.filter(p => bookmarks.has(p.id))
    : viewingFollowed
    ? posts.filter(p => followedInfluencers.has(p.account))
    : posts

  const showingMainFeed = !viewingBookmarks && !viewingFollowed
  if (showingMainFeed && currentCat === 'evergreen') {
    filtered = filtered.filter(isEvergreen)
  } else if (showingMainFeed && currentCat !== 'all') {
    filtered = filtered.filter(p => p.cat === currentCat)
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase()
    filtered = filtered.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.account.toLowerCase().includes(q)
    )
  }

  const sorted = [...filtered].sort((a, b) => {
    if (sortOrder === 'latest') return (b.scraped_at || '').localeCompare(a.scraped_at || '')
    if (sortOrder === 'popular') return (b.participants || 0) - (a.participants || 0)
    if (sortOrder === 'discount') {
      const da = a.origPrice && a.origPrice > a.price ? (a.origPrice - a.price) / a.origPrice : 0
      const db = b.origPrice && b.origPrice > b.price ? (b.origPrice - b.price) / b.origPrice : 0
      return db - da
    }
    if (sortOrder === 'deadline') {
      const da = daysLeft(a.deadline), db = daysLeft(b.deadline)
      if (da < 0 && db >= 0) return 1
      if (db < 0 && da >= 0) return -1
      return da - db
    }
    return 0
  })

  const urgentCount = posts.filter(p => { const d = daysLeft(p.deadline); return d >= 0 && d <= 1 }).length

  // group_key가 있는 게시글끼리 묶음 (published 된 것들만)
  const groupMap = new Map<string, typeof posts>()
  for (const p of posts) {
    if (!p.group_key) continue
    const arr = groupMap.get(p.group_key) ?? []
    arr.push(p)
    groupMap.set(p.group_key, arr)
  }

  return (
    <>
      <h1 className="sr-only">지니모아 — 인스타그램 공동구매(공구) 모아보기</h1>
      <Header
        onBookmarkView={() => { setViewingBookmarks(v => !v); setViewingFollowed(false) }}
        viewingBookmarks={viewingBookmarks}
        onFollowView={() => { setViewingFollowed(v => !v); setViewingBookmarks(false) }}
        viewingFollowed={viewingFollowed}
        onPushToggle={togglePush}
        pushSubscribed={pushSubscribed}
      />

      <div className="hero-search-wrap">
        <div className="hero-search">
          <Search size={18} />
          <input
            type="search"
            placeholder="찾고 싶은 상품을 검색해보세요"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {showingMainFeed && !kakaoBannerDismissed && (
        <div className="notify-banner">
          <div className="notify-inner kakao-banner">
            <div className="notify-icon kakao-banner-icon"><MessageCircle size={18} /></div>
            <div className="notify-text">
              <p>카카오톡 채널 추가하고 공구 소식 받아보세요</p>
              <p>가입 없이 채널만 추가하면 새 공구를 놓치지 않아요</p>
            </div>
            <a
              href={KAKAO_CHANNEL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="notify-btn kakao-banner-btn"
              onClick={() => { localStorage.setItem('gonggu_kakao_dismissed', '1'); setKakaoBannerDismissed(true) }}
            >
              채널 추가
            </a>
            <button
              className="notify-close"
              title="닫기"
              onClick={() => { localStorage.setItem('gonggu_kakao_dismissed', '1'); setKakaoBannerDismissed(true) }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {showingMainFeed && urgentCount > 0 && (
        <div className="notify-banner">
          <div className="notify-inner">
            <div className="notify-icon"><Bell size={18} /></div>
            <div className="notify-text">
              <p>마감 임박 공구가 {urgentCount}개 있어요!</p>
              <p>오늘 자정까지 마감되는 공구를 확인하세요</p>
            </div>
            <button
              className="notify-btn"
              onClick={() => { setSortOrder('deadline'); setCurrentCat('all') }}
            >
              바로 보기
            </button>
          </div>
        </div>
      )}

      {viewingBookmarks ? (
        <div className="section-header">
          <button className="back-btn" onClick={() => setViewingBookmarks(false)}><ArrowLeft size={16} /></button>
          <Heart size={16} /> 찜한 공구
        </div>
      ) : viewingFollowed ? (
        <div className="section-header">
          <button className="back-btn" onClick={() => setViewingFollowed(false)}><ArrowLeft size={16} /></button>
          <Star size={16} /> 팔로우한 인플루언서
        </div>
      ) : (
        <>
          {recentlyViewed.length > 0 && (
            <div className="recent-wrap">
              <p className="recent-title"><Clock size={13} /> 최근 본 상품</p>
              <div className="recent-scroll">
                {recentlyViewed.map(id => {
                  const p = posts.find(x => x.id === id)
                  if (!p) return null
                  const link = p.purchase_url || p.url
                  const CatIcon = categoryIcon(p.cat)
                  return (
                    <a key={id} className="recent-item" href={link || '#'} target="_blank" rel="noopener noreferrer"
                      onClick={() => track('join', { postId: id })}>
                      {p.img ? <img src={p.img} alt={p.title} /> : <div className="recent-placeholder"><CatIcon size={24} strokeWidth={1.5} /></div>}
                      <div className="recent-item-price">{p.price.toLocaleString()}원</div>
                    </a>
                  )
                })}
              </div>
            </div>
          )}
          {collections.length > 0 && (
            <div className="collection-wrap">
              <p className="collection-title">지금 뜨는 컬렉션</p>
              <div className="collection-scroll">
                {collections.map(c => (
                  <Link
                    key={c.id}
                    href={`/collection/${c.id}`}
                    className="collection-card"
                    style={{ background: `linear-gradient(135deg, ${c.color}, ${c.color}cc)` }}
                    onClick={() => track('collection_click')}
                  >
                    <span className="collection-card-emoji">{c.emoji}</span>
                    <span className="collection-card-title">{c.title}</span>
                    <span className="collection-card-count">{c.productIds.length}개 상품</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
          <CategoryFilter current={currentCat} onSelect={cat => { setCurrentCat(cat); setViewingBookmarks(false); setViewingFollowed(false); if (cat !== 'all') track('category') }} />
          <div className="topbar">
            <span className="count-text">총 <strong>{sorted.length}</strong>개의 공구</span>
            <select
              className="sort-select"
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value as SortOrder)}
            >
              <option value="latest">최신순</option>
              <option value="deadline">마감임박순</option>
              <option value="discount">할인율순</option>
              <option value="popular">인기순</option>
            </select>
          </div>
        </>
      )}

      <div className="feed">
        {loading ? (
          <div className="empty">
            <div className="empty-icon empty-icon-spin"><Loader2 size={36} /></div>
            <p>공구 불러오는 중...</p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              {viewingBookmarks ? <Heart size={36} /> : viewingFollowed ? <Star size={36} /> : <Search size={36} />}
            </div>
            <p>{viewingBookmarks ? '아직 찜한 공구가 없어요' : viewingFollowed ? '아직 팔로우한 인플루언서가 없어요' : '검색 결과가 없어요'}</p>
          </div>
        ) : (
          sorted.map(post => (
            <PostCard
              key={post.id}
              post={post}
              isBookmarked={bookmarks.has(post.id)}
              onToggleBookmark={toggleBookmark}
              onJoin={id => { track('join', { postId: id }); recordRecentlyViewed(id) }}
              siblings={post.group_key ? groupMap.get(post.group_key) : undefined}
              isFollowingAccount={followedInfluencers.has(post.account)}
              onToggleFollowAccount={toggleFollowInfluencer}
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
