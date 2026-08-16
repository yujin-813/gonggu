'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { Post, Category } from '@/lib/types'
import { CATEGORY_LABEL, categoryIcon } from '@/lib/categoryIcons'
import Toast from '@/components/Toast'
import DealStrip, { InfluencerStrip } from '@/components/DealStrip'
import { track } from '@/lib/track'
import { Flame, Award, CalendarDays, AlarmClock, CalendarRange } from 'lucide-react'

// 홈 큐레이션. 두 종류의 영역이 있다.
//
// 1) 크게 보여주는 곳 — "지금 많이 보는", "이번 주 우리가 고른". 오늘 무엇을 살지 결정하게
//    돕는 자리라 가격 판단까지 담은 전체 카드를 쓴다.
// 2) 훑어보는 곳 — 오늘의 공구 / 마감 임박 / 이달의 공구 / 카테고리별 / 인플루언서별.
//    "무엇이 있는지" 보고 관심 있는 쪽으로 들어가는 자리라 작은 카드 가로줄 + 더보기로 둔다.
//
// 운영자가 직접 고르는 건 (1)의 추천 하나뿐이고 나머지는 전부 규칙으로 채워진다.

export interface InfluencerSummary {
  account: string
  name: string
  count: number
  img: string | null
}

interface Props {
  featured: Post[]
  popular: Post[]
  today: Post[]
  endingSoon: Post[]
  monthly: Post[]
  categories: { cat: Category; posts: Post[] }[]
  influencers: InfluencerSummary[]
}

export default function HomeSections({
  featured, popular, today, endingSoon, monthly, categories, influencers,
}: Props) {
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


  return (
    <div className="home-sections">
      {/* 모든 영역을 같은 크기의 작은 카드로 통일한다. 전체 크기 카드는 한 영역이
          화면을 다 차지해서, 홈에서 "무엇이 있는지" 훑는 목적에 맞지 않았다.
          (클릭 데이터가 쌓이기 전에는 popular가 비는데, 그때는 영역이 통째로 감춰진다) */}
      <DealStrip icon={<Flame size={17} strokeWidth={2.5} />} title="지금 많이 보는 공구" posts={popular} />
      <DealStrip icon={<Award size={17} strokeWidth={2.5} />} title="이번 주 우리가 고른 공구" posts={featured} highlight />

      <DealStrip icon={<CalendarDays size={17} strokeWidth={2.5} />} title="오늘 새로 올라온 공구" moreHref="/today"    posts={today} />
      <DealStrip icon={<AlarmClock size={17} strokeWidth={2.5} />} title="마감 임박 공구" moreHref="/deadline" posts={endingSoon} />
      <DealStrip icon={<CalendarRange size={17} strokeWidth={2.5} />} title="이달의 공구"   moreHref="/monthly"  posts={monthly} />

      {categories.map(({ cat, posts }) => (
        <DealStrip
          key={cat}
          icon={(() => { const I = categoryIcon(cat); return <I size={17} strokeWidth={2.5} /> })()}
          title={`${CATEGORY_LABEL[cat]} 공구`}
          moreHref={`/category/${cat}`}
          posts={posts}
        />
      ))}

      <InfluencerStrip influencers={influencers} />

      <Toast
        message={toast.message}
        visible={toast.visible}
        onHide={() => setToast(t => ({ ...t, visible: false }))}
      />
    </div>
  )
}
