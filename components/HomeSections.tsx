'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { Post, Category } from '@/lib/types'
import { CATEGORY_LABEL, categoryIcon } from '@/lib/categoryIcons'
import Toast from '@/components/Toast'
import DealStrip, { InfluencerStrip } from '@/components/DealStrip'
import { track } from '@/lib/track'
import { Flame, Award, CalendarDays, AlarmClock, CalendarRange, ShoppingBag, CalendarClock, TrendingUp } from 'lucide-react'

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
}

export default function HomeSections({
  featured, popular, today, upcoming, endingSoon, monthly, categories, influencers, endedButBuyable,
}: Props) {
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set())
  const [toast, setToast] = useState({ message: '', visible: false })
  const [popularSearches, setPopularSearches] = useState<{ rank: number; query: string; trend: 'new' | 'up' | 'down' | 'same' }[]>([])

  useEffect(() => {
    setBookmarks(new Set(JSON.parse(localStorage.getItem('gonggu_bookmarks') || '[]')))
    fetch('/api/popular-searches').then(r => r.json()).then(d => setPopularSearches(d.items || [])).catch(() => {})
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

      {/* 인기 검색어 TOP 10 — 사장님이 참고 화면으로 준 캡처(쇼핑몰 흔한 순위 위젯)와
          같은 2열 번호 목록. 클릭하면 /?q=검색어로 이동하고, 홈이 그 쿼리를 읽어
          검색창에 채우고 바로 필터링한다(HomeClient.tsx의 useSearchParams 효과). */}
      {popularSearches.length > 0 && (
        <section className="strip popular-search-strip">
          <div className="strip-head">
            <h2 className="strip-title"><TrendingUp size={17} strokeWidth={2.5} />인기 검색어</h2>
          </div>
          <div className="popular-search-grid">
            {popularSearches.map(item => (
              <Link
                key={item.query}
                href={`/?q=${encodeURIComponent(item.query)}`}
                className="popular-search-item"
                onClick={() => track('click', { clickType: 'other' })}
              >
                {/* NEW/▲▼ 배지는 잠시 뺐다 — 검색어 집계가 아직 얼마 안 쌓여서 전부
                    "NEW"로만 떠 빨간색이 과했다(사장님 지적). 데이터가 쌓이면(직전
                    기간과 비교할 게 생기면) 다시 붙이기로 함 — 계산 로직(trend)은
                    안 지우고 그대로 둔다. */}
                <span className="popular-search-rank">{item.rank}</span>
                <span className="popular-search-text">{item.query}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

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
