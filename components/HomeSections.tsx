'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { Post, Category } from '@/lib/types'
import { CATEGORY_LABEL } from '@/lib/categoryIcons'
import PostCard from '@/components/PostCard'
import Toast from '@/components/Toast'
import { track } from '@/lib/track'

// 홈 상단 큐레이션 영역. 운영자가 고르는 건 "이번 주 추천" 하나뿐이고 나머지 세 영역은
// 규칙(클릭수·마감시각·카테고리)으로 자동 배치된다. 서버에서 계산해 props로 받으므로
// 첫 응답 HTML에 상품명과 가격이 그대로 들어간다.

export interface HomeSectionData {
  featured: Post[]
  popular: Post[]
  endingSoon: Post[]
  categories: { cat: Category; posts: Post[] }[]
}

interface Props extends HomeSectionData {
  /** 카드 클릭 동작은 홈 피드와 동일하게 맞춘다 */
  onJoin?: (id: number) => void
}

function Section({
  emoji, title, subtitle, moreHref, moreLabel, posts, bookmarks, onToggleBookmark, onJoin,
}: {
  emoji: string
  title: string
  subtitle?: string
  moreHref?: string
  moreLabel?: string
  posts: Post[]
  bookmarks: Set<number>
  onToggleBookmark: (id: number) => void
  onJoin?: (id: number) => void
}) {
  if (posts.length === 0) return null
  return (
    <section className="home-section">
      <div className="home-section-head">
        <h2 className="home-section-title">{emoji} {title}</h2>
        {subtitle && <p className="home-section-sub">{subtitle}</p>}
      </div>
      <div className="home-section-feed">
        {posts.map(p => (
          <PostCard
            key={p.id}
            post={p}
            isBookmarked={bookmarks.has(p.id)}
            onToggleBookmark={onToggleBookmark}
            onJoin={onJoin}
          />
        ))}
      </div>
      {moreHref && (
        <Link href={moreHref} className="home-section-more">{moreLabel} →</Link>
      )}
    </section>
  )
}

export default function HomeSections({ featured, popular, endingSoon, categories }: Props) {
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set())
  const [toast, setToast] = useState({ message: '', visible: false })

  useEffect(() => {
    setBookmarks(new Set(JSON.parse(localStorage.getItem('gonggu_bookmarks') || '[]')))
  }, [])

  function toggleBookmark(id: number) {
    setBookmarks(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id); setToast({ message: '찜을 해제했어요', visible: true }) }
      else { next.add(id); setToast({ message: '찜 목록에 추가했어요!', visible: true }); track('bookmark', { postId: id }) }
      localStorage.setItem('gonggu_bookmarks', JSON.stringify([...next]))
      return next
    })
  }

  const onJoin = (id: number) => track('join', { postId: id, clickType: 'groupbuy' })
  const common = { bookmarks, onToggleBookmark: toggleBookmark, onJoin }

  return (
    <div className="home-sections">
      {/* 클릭 데이터가 쌓이기 전에는 popular가 비는데, 그때는 Section이 알아서 감춰진다 */}
      <Section
        emoji="🔥" title="지금 많이 보는 공구"
        subtitle="최근 일주일 동안 가장 많이 눌러본 공구예요"
        posts={popular} {...common}
      />
      <Section
        emoji="🍯" title="이번 주 우리가 고른 공구"
        subtitle="꿀공구가 직접 확인하고 골랐어요"
        posts={featured} {...common}
      />
      <Section
        emoji="⏰" title="곧 끝나는 공구"
        subtitle="48시간 안에 마감돼요"
        moreHref="/deadline" moreLabel="마감 임박 공구 전체보기"
        posts={endingSoon} {...common}
      />
      {categories.map(({ cat, posts }) => (
        <Section
          key={cat}
          emoji="" title={`${CATEGORY_LABEL[cat]} 공구`}
          moreHref={`/category/${cat}`} moreLabel={`${CATEGORY_LABEL[cat]} 공구 전체보기`}
          posts={posts} {...common}
        />
      ))}

      <Toast
        message={toast.message}
        visible={toast.visible}
        onHide={() => setToast(t => ({ ...t, visible: false }))}
      />
    </div>
  )
}
