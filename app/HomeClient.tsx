'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import CategoryFilter from '@/components/CategoryFilter'
import CollectionRoller from '@/components/CollectionRoller'
import PostCard from '@/components/PostCard'
import Toast from '@/components/Toast'
import type { Post, Category, SortOrder, Collection } from '@/lib/types'
import { categoryIcon } from '@/lib/categoryIcons'
import { isEvergreen, isExpired, getPeriodState } from '@/lib/period'
import { getVisitorId, track } from '@/lib/track'
import { Bell, ArrowLeft, Heart, Star, Clock, Loader2, Search, MessageCircle, X } from 'lucide-react'

function daysLeft(deadline?: string): number {
  if (!deadline) return 999
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(deadline)
  d.setHours(0, 0, 0, 0)
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
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

// 큐레이션 섹션은 서버에서 계산해 넘겨받는다 — 여기서 fetch하면 첫 HTML이 비어서
// 검색엔진이 상품을 못 읽는다
export default function HomeClient({ sections }: { sections?: React.ReactNode }) {
  const [posts, setPosts] = useState<Post[]>([])
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set())
  const [currentCat, setCurrentCat] = useState<Category | 'all' | 'evergreen' | 'upcoming'>('all')
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
  // "이 상품 공구가 얼마였지?"를 찾는 사람에게는 마감된 공구도 답이 된다.
  // 평소 목록에는 안 넣고, 검색을 시작할 때 한 번만 따로 받아온다.
  const [endedPosts, setEndedPosts] = useState<Post[]>([])
  const [endedLoaded, setEndedLoaded] = useState(false)
  const [groupHistory, setGroupHistory] = useState<Record<string, { id: number; price: number; origPrice: number | null; date: string }[]>>({})
  const [kakaoBannerDismissed, setKakaoBannerDismissed] = useState(true)  // 초기 렌더 깜빡임 방지 — mount 시 localStorage 값으로 교체

  useEffect(() => {
    const notrack = new URLSearchParams(window.location.search).get('notrack')
    if (notrack === '1') localStorage.setItem('gonggu_no_track', '1')
    else if (notrack === '0') localStorage.removeItem('gonggu_no_track')

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

  // "공구 보기"를 눌러 실제로 관심을 보인 상품을 최근 본 목록에 기록 (최대 20개, 중복 제거)
  function recordRecentlyViewed(id: number) {
    setRecentlyViewed(prev => {
      const next = [id, ...prev.filter(x => x !== id)].slice(0, 20)
      localStorage.setItem('gonggu_recent', JSON.stringify(next))
      return next
    })
  }

  // 검색어가 처음 입력되는 순간에만 지난 공구를 불러온다 — 첫 진입 속도를 건드리지 않기 위함
  useEffect(() => {
    if (!searchQuery.trim() || endedLoaded) return
    setEndedLoaded(true)
    fetch('/api/posts?ended=1&per_page=500')
      .then(r => r.json())
      .then(d => setEndedPosts((d.posts ?? []).filter((p: Post) => isExpired(p))))
      .catch(() => {})
  }, [searchQuery, endedLoaded])

  async function fetchPosts() {
    setLoading(true)
    try {
      const res = await fetch('/api/posts?per_page=200')
      if (!res.ok) throw new Error()
      const data = await res.json()
      const fetchedPosts: Post[] = data.posts ?? []
      setPosts(fetchedPosts)
      fetchGroupHistory(fetchedPosts)
    } catch {
      setPosts([])
    } finally {
      setLoading(false)
    }
  }

  // "지난 공구가" 참고용 — 지금 화면에 뜬 공구들의 비교그룹만 모아서 한 번에 조회
  async function fetchGroupHistory(list: Post[]) {
    const keys = [...new Set(list.map(p => p.group_key).filter(Boolean) as string[])]
    if (keys.length === 0) return
    try {
      const res = await fetch(`/api/posts/group-history?keys=${encodeURIComponent(keys.join(','))}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setGroupHistory(data.history ?? {})
    } catch {}
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
  } else if (showingMainFeed && currentCat === 'upcoming') {
    // 오픈 예정은 아직 못 사는 공구라 다른 카테고리와 섞이면 헷갈린다 — 따로 골라 본다
    filtered = filtered.filter(p => getPeriodState(p).kind === 'upcoming')
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

  // 지난 공구는 진행 중과 섞지 않고 아래에 따로 모아 보여준다 — 마감된 걸 지금 살 수
  // 있는 것처럼 보이면 안 되기 때문이다
  const endedMatches = searchQuery.trim()
    ? endedPosts.filter(p => {
        const q = searchQuery.toLowerCase()
        return p.title.toLowerCase().includes(q) || p.account.toLowerCase().includes(q)
      })
    : []

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
      <h1 className="sr-only">꿀공구 — 인스타그램 공동구매(공구) 모아보기</h1>

      {/* 로고 · 검색 · 카테고리를 하나의 헤더 면으로 묶는다 — 셋 다 "무엇을 볼지 고르는"
          도구라 붙어 있어야 손이 덜 간다. 아래 콘텐츠와는 그림자 한 겹으로 구분한다. */}
      <div className="app-header">
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

        <CategoryFilter
          current={currentCat}
          onSelect={cat => {
            setCurrentCat(cat)
            setViewingBookmarks(false)
            setViewingFollowed(false)
            if (cat !== 'all') track('category')
            // 실제 카테고리는 Link 이동이라 브라우저가 알아서 맨 위로 올려준다. 오픈예정·
            // 상시딜·전체는 제자리 필터링이라 그게 없다 — 스크롤이 깊이 내려간 채로 누르면
            // 위쪽 큐레이션 섹션이 통째로 사라지는데 화면엔 아무 변화가 안 보여서 "눌러도
            // 반응이 없다"로 느껴졌다. 눌렀을 때 맨 위로 올려 진짜 페이지 이동처럼 보이게 한다.
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        />
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
                      <div className="recent-item-price">{p.price ? `${p.price.toLocaleString()}원` : "가격 미정"}</div>
                    </a>
                  )
                })}
              </div>
            </div>
          )}
          {/* 컬렉션에 담긴 상품 카드가 한 장씩 자동으로 넘어간다 — 3개 담으면 3장,
              5개 담으면 5장. 카드는 홈 피드와 똑같은 PostCard를 그대로 쓴다. */}
          {collections.map(c => {
            const items = c.productIds
              .map(id => posts.find(p => p.id === id))
              .filter((p): p is Post => !!p)
            return (
              <CollectionRoller
                key={c.id}
                collection={c}
                posts={items}
                renderCard={post => (
                  <PostCard
                    post={post}
                    isBookmarked={bookmarks.has(post.id)}
                    onToggleBookmark={toggleBookmark}
                    onJoin={id => { track('join', { postId: id, clickType: 'groupbuy' }); recordRecentlyViewed(id) }}
                    onShare={(id, result) => {
                      if (result === 'clipboard') showToast('링크가 복사되었어요')
                      track('share', { postId: id })
                    }}
                    siblings={post.group_key ? groupMap.get(post.group_key) : undefined}
                    pastPrices={post.group_key ? groupHistory[post.group_key]?.filter(h => h.id !== post.id) : undefined}
                  />
                )}
              />
            )
          })}

          {/* 큐레이션은 기본 상태에서만 보여준다 — 검색하거나 카테고리를 고른 사용자는
              그 조건에 맞는 목록을 보러 온 것이므로 섹션이 끼어들면 방해가 된다 */}
          {sections && currentCat === 'all' && !searchQuery && sections}

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
            <p>{viewingBookmarks ? '아직 찜한 공구가 없어요' : viewingFollowed ? '아직 팔로우한 인플루언서가 없어요' : endedMatches.length > 0 ? '진행 중인 공구는 없어요' : '검색 결과가 없어요'}</p>
          </div>
        ) : (
          sorted.map(post => (
            <PostCard
              key={post.id}
              post={post}
              isBookmarked={bookmarks.has(post.id)}
              onToggleBookmark={toggleBookmark}
              onJoin={id => { track('join', { postId: id }); recordRecentlyViewed(id) }}
              onShare={(id, result) => {
                if (result === 'clipboard') showToast('링크가 복사되었어요')
                track('share', { postId: id })
              }}
              siblings={post.group_key ? groupMap.get(post.group_key) : undefined}
              pastPrices={post.group_key ? groupHistory[post.group_key]?.filter(h => h.id !== post.id) : undefined}
            />
          ))
        )}
      </div>

      {/* 지난 공구 — 진행 중과 섞지 않고 구분선 아래에 따로 둔다.
          "이 상품 공구가 얼마였지?"에 답하되, 지금 살 수 있는 것처럼 보이면 안 된다. */}
      {endedMatches.length > 0 && (
        <div className="past-deals">
          <div className="past-deals-head">
            <h2 className="past-deals-title">지난 공구 {endedMatches.length}건</h2>
            <p className="past-deals-sub">이미 마감된 공구예요. 당시 가격과 지금 살 수 있는 곳을 확인해보세요.</p>
          </div>
          <div className="strip-scroll">
            {endedMatches.slice(0, 20).map(p => (
              <Link key={p.id} href={`/post/${p.id}`} className="strip-card"
                onClick={() => track('click', { postId: p.id, clickType: 'detail' })}>
                <div className="strip-thumb">
                  {p.img
                    ? <img src={p.img} alt={p.title} loading="lazy" />
                    : <div className="strip-thumb-empty" />}
                  <span className="strip-badge closed">마감</span>
                </div>
                <p className="strip-name">{p.title}</p>
                {p.price > 0 && <p className="strip-price">당시 {p.price.toLocaleString()}원</p>}
              </Link>
            ))}
          </div>
        </div>
      )}

      <Toast
        message={toast.message}
        visible={toast.visible}
        onHide={() => setToast(t => ({ ...t, visible: false }))}
      />
    </>
  )
}
