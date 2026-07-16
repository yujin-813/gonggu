'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/Header'
import CategoryFilter from '@/components/CategoryFilter'
import PostCard from '@/components/PostCard'
import Toast from '@/components/Toast'
import type { Post, Category, SortOrder } from '@/lib/types'

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

function track(type: string) {
  fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, sessionId: getSession() }),
  }).catch(() => {})
}

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([])
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set())
  const [currentCat, setCurrentCat] = useState<Category | 'all' | 'evergreen'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<SortOrder>('latest')
  const [viewingBookmarks, setViewingBookmarks] = useState(false)
  const [toast, setToast] = useState({ message: '', visible: false })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('gonggu_bookmarks') || '[]')
    setBookmarks(new Set(saved))
    fetchPosts()
    track('view')
  }, [])

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
        showToast('❤️ 찜 목록에 추가했어요!')
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
    : posts

  if (!viewingBookmarks && currentCat === 'evergreen') {
    filtered = filtered.filter(p => p.is_evergreen_deal || p.is_always_on)
  } else if (!viewingBookmarks && currentCat !== 'all') {
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
      <Header
        searchQuery={searchQuery}
        onSearch={setSearchQuery}
        onBookmarkView={() => setViewingBookmarks(v => !v)}
        viewingBookmarks={viewingBookmarks}
      />

      {!viewingBookmarks && urgentCount > 0 && (
        <div className="notify-banner">
          <div className="notify-inner">
            <div className="notify-icon">🔔</div>
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
          <button className="back-btn" onClick={() => setViewingBookmarks(false)}>←</button>
          ❤️ 찜한 공구
        </div>
      ) : (
        <>
          <CategoryFilter current={currentCat} onSelect={cat => { setCurrentCat(cat); setViewingBookmarks(false); if (cat !== 'all') track('category') }} />
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
            <div className="empty-icon">⏳</div>
            <p>공구 불러오는 중...</p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">{viewingBookmarks ? '🤍' : '🔍'}</div>
            <p>{viewingBookmarks ? '아직 찜한 공구가 없어요' : '검색 결과가 없어요'}</p>
          </div>
        ) : (
          sorted.map(post => (
            <PostCard
              key={post.id}
              post={post}
              isBookmarked={bookmarks.has(post.id)}
              onToggleBookmark={toggleBookmark}
              onJoin={() => track('join')}
              siblings={post.group_key ? groupMap.get(post.group_key) : undefined}
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
