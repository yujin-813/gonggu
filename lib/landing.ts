import type { Post, Category } from './types'
import { getPeriodState, isCustomerVisible, isPagePublic, daysLeft } from './period'
import { loadPosts } from './store'
import { CATEGORY_LABEL } from './categoryIcons'

export const SITE_URL = 'https://gonggu.asknuggetdata.com'

// 네이버·구글에서 "오늘 공구", "이달의 공구", "유아 공구"처럼 찾는 검색어에 착지할 URL이
// 없어서 홈 하나로만 색인되고 있었다. 검색어별로 전용 페이지를 두고 제목·설명을 그 검색어에
// 맞춰 붙인다 — 페이지마다 다루는 공구 목록이 실제로 다르므로 중복 콘텐츠도 아니다.

export type LandingKey = 'today' | 'deadline' | 'monthly'

export interface LandingCopy {
  path: string
  h1: string
  /** <title> — 루트 레이아웃 template("%s | 꿀공구")을 타므로 접미사를 붙이지 않는다 */
  title: string
  description: string
  /** 목록이 비었을 때 안내 문구 */
  empty: string
}

function kstNow(): Date {
  // 서버가 UTC로 도는데 공구 일정은 전부 한국 시간 기준이라, 날짜 계산은 KST로 한다
  return new Date(Date.now() + 9 * 60 * 60 * 1000)
}

export function kstToday(): string {
  return kstNow().toISOString().slice(0, 10)
}

/** "8월 14일" 형태 — 제목에 날짜를 넣어 검색어와 겹치는 표현을 만든다 */
export function kstTodayLabel(): string {
  const d = kstNow()
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`
}

export function kstMonthLabel(): string {
  return `${kstNow().getUTCMonth() + 1}월`
}

export function visiblePosts(): Post[] {
  return loadPosts().filter(isCustomerVisible)
}

/**
 * 상세 URL이 살아 있는 모든 상품 — 마감된 것도 포함한다.
 * 목록에는 안 띄우지만 사이트맵에는 남겨야 한다. 마감됐다고 사이트맵에서 빼면 검색엔진이
 * 페이지가 사라진 것으로 보고 색인을 내려버리는데, 이 페이지들은 종료 후에도 대체 구매처와
 * 비슷한 공구를 안내하는 역할로 계속 쓰인다.
 */
export function routablePosts(): Post[] {
  return loadPosts().filter(isPagePublic)
}

/** 오늘 오픈했거나 오늘 마감하는 공구 — "오늘의 공구" */
export function todayPosts(posts: Post[]): Post[] {
  const today = kstToday()
  return posts.filter(p => {
    if (p.start_date === today) return true
    if (p.deadline === today) return true
    // 오픈 예정이 오늘 열리는 경우도 오늘의 공구다
    const state = getPeriodState(p)
    return state.kind === 'upcoming' && state.startDate === today
  })
}

/** 3일 안에 끝나는 공구 — "마감 임박 공구" */
export function deadlinePosts(posts: Post[]): Post[] {
  return posts
    .filter(p => {
      const state = getPeriodState(p)
      if (state.kind !== 'range' && state.kind !== 'deadline_only') return false
      return state.daysLeft >= 0 && state.daysLeft <= 3
    })
    .sort((a, b) => daysLeft(a.deadline) - daysLeft(b.deadline))
}

/** 이번 달에 진행 중이거나 진행됐던 공구 — "이달의 공구" */
export function monthlyPosts(posts: Post[]): Post[] {
  const month = kstToday().slice(0, 7)   // YYYY-MM
  return posts.filter(p => {
    if ((p.start_date || '').startsWith(month)) return true
    if ((p.deadline || '').startsWith(month)) return true
    // 지난달에 열려 이번 달에도 계속 진행 중인 공구
    if (p.start_date && p.deadline) return p.start_date < month && p.deadline >= month
    // 마감일이 없는 상시딜은 이번 달에도 진행 중인 것으로 본다
    return getPeriodState(p).kind === 'evergreen'
  })
}

export function landingCopy(key: LandingKey, count: number): LandingCopy {
  switch (key) {
    case 'today':
      return {
        path: '/today',
        h1: `오늘의 공구 (${kstTodayLabel()})`,
        title: `오늘의 공구 — ${kstTodayLabel()} 오픈·마감 공구 모아보기`,
        description: `${kstTodayLabel()} 기준 오늘 오픈하거나 오늘 마감하는 인스타 공동구매 ${count}건을 모았어요. 인플루언서 공구를 놓치지 않고 확인하세요.`,
        empty: '오늘 오픈하거나 마감하는 공구가 아직 없어요',
      }
    case 'deadline':
      return {
        path: '/deadline',
        h1: '마감 임박 공구',
        title: '마감 임박 공구 — 3일 안에 끝나는 공구 모아보기',
        description: `3일 안에 마감되는 인스타 인플루언서 공동구매 ${count}건을 모았어요. 마감 순으로 정렬해 급한 공구부터 보여드려요.`,
        empty: '3일 안에 마감되는 공구가 없어요',
      }
    case 'monthly':
      return {
        path: '/monthly',
        h1: `${kstMonthLabel()} 이달의 공구`,
        title: `이달의 공구 — ${kstMonthLabel()} 인스타 공동구매 모아보기`,
        description: `${kstMonthLabel()}에 진행되는 인스타그램 인플루언서 공동구매 ${count}건을 한곳에 모았어요. 이달의 공구를 카테고리별로 확인하세요.`,
        empty: '이번 달 공구가 아직 없어요',
      }
  }
}

export const LANDING_KEYS: LandingKey[] = ['today', 'deadline', 'monthly']

export const CATEGORY_KEYS: Category[] = ['kids', 'life', 'food', 'health', 'beauty']

export function categoryCopy(cat: Category, count: number): LandingCopy {
  const label = CATEGORY_LABEL[cat]
  return {
    path: `/category/${cat}`,
    h1: `${label} 공구`,
    title: `${label} 공구 — ${label} 인스타 공동구매 모아보기`,
    description: `${label} 카테고리 인스타그램 인플루언서 공동구매 ${count}건을 모았어요. ${label} 공구를 마감일·최저가와 함께 한눈에 비교하세요.`,
    empty: `진행 중인 ${label} 공구가 없어요`,
  }
}

export function categoryPosts(posts: Post[], cat: Category): Post[] {
  return posts.filter(p => p.cat === cat)
}

// ── 홈 섹션 ────────────────────────────────────────────────────────────────
// 홈을 단일 피드에서 섹션 구조로 바꾸면서, "어떤 상품이 어느 영역에 들어가는가"를 여기
// 한 곳에서만 정한다. 운영자가 고르는 건 추천(is_featured) 하나뿐이고 나머지는 전부 규칙이다.

/** 곧 끝나는 공구 — 48시간 이내 마감 */
export function endingSoonPosts(posts: Post[], hours = 48): Post[] {
  const limitDays = hours / 24
  return posts
    .filter(p => {
      const s = getPeriodState(p)
      if (s.kind !== 'range' && s.kind !== 'deadline_only') return false
      return s.daysLeft >= 0 && s.daysLeft <= limitDays
    })
    .sort((a, b) => daysLeft(a.deadline) - daysLeft(b.deadline))
}

/** 이번 주 우리가 고른 공구 — 관리자가 켠 것만, 지정한 순서대로 */
export function featuredPosts(posts: Post[]): Post[] {
  return posts
    .filter(p => p.is_featured)
    .sort((a, b) => {
      const oa = a.featured_order ?? Number.MAX_SAFE_INTEGER
      const ob = b.featured_order ?? Number.MAX_SAFE_INTEGER
      if (oa !== ob) return oa - ob
      return (b.scraped_at || '').localeCompare(a.scraped_at || '')
    })
}

/**
 * 지금 많이 보는 공구 — 최근 N일 클릭 순.
 * 클릭 데이터는 postClicks 도입 이후부터 쌓이므로 초기에는 결과가 적거나 비어 있다.
 * 그 경우 섹션을 비워두는 대신 호출하는 쪽에서 아예 감춘다(빈 영역을 보여주지 않기 위함).
 */
export function popularPosts(posts: Post[], rankedIds: number[]): Post[] {
  const byId = new Map(posts.map(p => [p.id, p]))
  return rankedIds.map(id => byId.get(id)).filter((p): p is Post => !!p)
}

/** 카테고리별 홈 영역 — 상품이 있는 카테고리만 */
export function categorySections(posts: Post[], perCategory = 6) {
  return CATEGORY_KEYS
    .map(cat => ({ cat, posts: posts.filter(p => p.cat === cat).slice(0, perCategory) }))
    .filter(s => s.posts.length > 0)
}

/** 인플루언서별 홈 영역 — 진행 중인 공구가 많은 순 */
export function influencerSummaries(posts: Post[], limit = 12) {
  const byAccount = new Map<string, { account: string; name: string; count: number; img: string | null }>()
  for (const p of posts) {
    if (!p.account) continue
    const cur = byAccount.get(p.account)
    if (cur) {
      cur.count += 1
      if (!cur.img && p.img) cur.img = p.img
    } else {
      byAccount.set(p.account, {
        account: p.account,
        name: p.influencer_name || p.account.replace('@', ''),
        count: 1,
        img: p.img || null,
      })
    }
  }
  return [...byAccount.values()].sort((a, b) => b.count - a.count).slice(0, limit)
}
