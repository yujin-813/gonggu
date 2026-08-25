'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { Post, Category } from '@/lib/types'
import { CATEGORY_LABEL, categoryIcon } from '@/lib/categoryIcons'
import Toast from '@/components/Toast'
import DealStrip, { InfluencerStrip } from '@/components/DealStrip'
import { track } from '@/lib/track'
import { Flame, Award, CalendarDays, AlarmClock, CalendarRange, ShoppingBag, CalendarClock } from 'lucide-react'

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
  /** 아직 안 열린 공구 — 홈에 자리가 없어 상세 조회가 0이었다 */
  upcoming: Post[]
  endingSoon: Post[]
  monthly: Post[]
  categories: { cat: Category; posts: Post[] }[]
  influencers: InfluencerSummary[]
  /** 공구는 끝났지만 대체 구매처가 있는 상품 */
  endedButBuyable: Post[]
  /** 컬렉션 소개 배너 — 상품 카드를 여러 장 돌리던 것 대신 한 장으로 소개한다 */
  collectionBanner: { id: string; title: string; description: string; emoji: string; color: string } | null
}

export default function HomeSections({
  featured, popular, today, upcoming, endingSoon, monthly, categories, influencers, endedButBuyable,
  collectionBanner,
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

      {/* 컬렉션 배너 — 섹션 사이에 한 장만 끼워 넣는다. 상품 카드를 여러 장 돌리던 예전
          방식(CollectionRoller)보다 화면을 덜 차지하면서도 눈에 띈다 */}
      {collectionBanner && (
        <Link href={`/collection/${collectionBanner.id}`} className="collection-banner"
          style={{ background: `linear-gradient(135deg, ${collectionBanner.color}, ${collectionBanner.color}CC)` }}
          onClick={() => track('click', { clickType: 'other' })}>
          <span className="collection-banner-emoji">{collectionBanner.emoji}</span>
          <span className="collection-banner-text">
            <span className="collection-banner-title">{collectionBanner.title}</span>
            {collectionBanner.description && <span className="collection-banner-desc">{collectionBanner.description}</span>}
          </span>
          <span className="collection-banner-cta">보러가기 →</span>
        </Link>
      )}

      <DealStrip icon={<AlarmClock size={17} strokeWidth={2.5} />} title="마감 임박 공구" moreHref="/deadline" posts={endingSoon} />
      {/* 오픈 예정은 55건이 있는데도 홈에 자리가 없어 아무도 못 봤다. 마감 임박 바로 뒤에
          두는 이유는, 둘 다 "날짜를 챙겨야 하는 공구"라 같이 훑는 게 자연스럽기 때문이다 */}
      <DealStrip icon={<CalendarClock size={17} strokeWidth={2.5} />} title="곧 열려요" posts={upcoming} />
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

      {/* 마감 공구는 목록에서 사라지지만, 대체 구매처를 확인해 둔 것은 여기서 다시 만난다.
          마감된 공구가 진행 중보다 많고 검색 유입도 그쪽이 크므로, 사이트 안에서도
          닿을 수 있어야 한다. */}
      <DealStrip
        icon={<ShoppingBag size={17} strokeWidth={2.5} />}
        title="공구는 끝났지만 지금 살 수 있어요"
        posts={endedButBuyable}
      />

      <Toast
        message={toast.message}
        visible={toast.visible}
        onHide={() => setToast(t => ({ ...t, visible: false }))}
      />
    </div>
  )
}
