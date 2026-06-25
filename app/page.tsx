'use client'

import { useState, useEffect, useCallback } from 'react'
import Header from '@/components/Header'
import CategoryFilter from '@/components/CategoryFilter'
import PostCard from '@/components/PostCard'
import Toast from '@/components/Toast'
import type { Post, Category, SortOrder } from '@/lib/types'

function fmtDate(offsetDays: number) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().split('T')[0]
}

const SAMPLE_DATA: Post[] = [
  { id: 1, title: '드뮤어 린넨 반팔 원피스 4컬러 공구', account: '@daily_ootd_kr', cat: 'fashion', price: 38000, origPrice: 62000, start_date: fmtDate(-3), deadline: fmtDate(1), img: 'https://images.unsplash.com/photo-1594938298603-c8148c4b4571?w=600&q=80', url: '', participants: 142, avatar: '👗', source: 'manual' },
  { id: 2, title: '[공동구매] 제주 흑돼지 삼겹살 2kg 특가!', account: '@foodlover_mina', cat: 'food', price: 29900, origPrice: 48000, start_date: fmtDate(-1), deadline: fmtDate(3), img: 'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=600&q=80', url: '', participants: 287, avatar: '🍱', source: 'manual' },
  { id: 3, title: '설화수 윤조에센스 + 퍼펙팅 크림 세트 공구', account: '@beauty_haul_jisoo', cat: 'beauty', price: 89000, origPrice: 145000, start_date: fmtDate(-5), deadline: fmtDate(0), img: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&q=80', url: '', participants: 94, avatar: '💄', source: 'manual' },
  { id: 4, title: '무형광 대나무 수건 10장 세트 공동구매', account: '@eco_home_life', cat: 'life', price: 22000, origPrice: 35000, start_date: fmtDate(0), deadline: fmtDate(7), img: 'https://images.unsplash.com/photo-1583241800698-e8ab01830a14?w=600&q=80', url: '', participants: 56, avatar: '🏠', source: 'manual' },
  { id: 5, title: '어린이 비타민 구미 공구 🐻', account: '@kids_health_mom', cat: 'kids', price: 15900, origPrice: 26000, start_date: fmtDate(-2), deadline: fmtDate(2), img: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=600&q=80', url: '', participants: 201, avatar: '🧸', source: 'manual' },
  { id: 6, title: '고양이 자동 급수기 + 사료 디스펜서 공구', account: '@catmom_diary', cat: 'pet', price: 34500, origPrice: 58000, start_date: fmtDate(-1), deadline: fmtDate(5), img: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&q=80', url: '', participants: 73, avatar: '🐾', source: 'manual' },
  { id: 7, title: '삼성 갤럭시 버즈3 프로 공동구매 (정품)', account: '@tech_pick_seoul', cat: 'digital', price: 178000, origPrice: 249000, start_date: fmtDate(-10), deadline: fmtDate(-2), img: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600&q=80', url: '', participants: 330, avatar: '📱', source: 'manual' },
  { id: 8, title: '오메가3 + 루테인 6개월치 공구 최저가', account: '@health_pick_kr', cat: 'health', price: 42000, origPrice: 72000, start_date: fmtDate(-2), deadline: fmtDate(10), img: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80', url: '', participants: 158, avatar: '💊', source: 'manual' },
]

function daysLeft(deadline?: string): number {
  if (!deadline) return 999
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(deadline)
  d.setHours(0, 0, 0, 0)
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([])
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set())
  const [currentCat, setCurrentCat] = useState<Category | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<SortOrder>('latest')
  const [viewingBookmarks, setViewingBookmarks] = useState(false)
  const [toast, setToast] = useState({ message: '', visible: false })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('gonggu_bookmarks') || '[]')
    setBookmarks(new Set(saved))
    fetchPosts()
  }, [])

  async function fetchPosts() {
    setLoading(true)
    try {
      const res = await fetch('/api/posts?per_page=200')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setPosts(data.posts?.length ? data.posts : SAMPLE_DATA)
    } catch {
      setPosts(SAMPLE_DATA)
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

  if (!viewingBookmarks && currentCat !== 'all') {
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
          <CategoryFilter current={currentCat} onSelect={cat => { setCurrentCat(cat); setViewingBookmarks(false) }} />
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
