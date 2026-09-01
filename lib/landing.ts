import type { Post, Category } from './types'
import { getPeriodState, isCustomerVisible, isPagePublic, isExpired, isEvergreen, daysLeft } from './period'
import { hasPurchaseLink } from './purchaseLinks'
import { loadPosts, loadCollections } from './store'
import { CATEGORY_LABEL } from './categoryIcons'
import { SITE_URL } from './siteUrl'
import { toPublicPosts } from './publicPost'

// 클라이언트에서도 쓰려고 상수만 따로 뺐다 — 여기서 다시 내보내 기존 import를 유지한다
export { SITE_URL }


// 네이버·구글에서 "오늘 공구", "이달의 공구", "유아 공구"처럼 찾는 검색어에 착지할 URL이
// 없어서 홈 하나로만 색인되고 있었다. 검색어별로 전용 페이지를 두고 제목·설명을 그 검색어에
// 맞춰 붙인다 — 페이지마다 다루는 공구 목록이 실제로 다르므로 중복 콘텐츠도 아니다.

export type LandingKey = 'today' | 'deadline' | 'deadline_today' | 'monthly' | 'upcoming' | 'evergreen' | 'popular'

export interface LandingCopy {
  path: string
  h1: string
  /** <title> — 루트 레이아웃 template("%s | 꿀공구")을 타므로 접미사를 붙이지 않는다 */
  title: string
  description: string
  /** 목록이 비었을 때 안내 문구 */
  empty: string
}

// kstNow/kstToday는 lib/kst.ts에 있다 — period.ts도 같은 계산이 필요한데
// landing.ts를 import하면 순환 참조가 생겨서 그쪽으로 옮기고 여기서 다시 내보낸다
import { kstNow, kstToday } from './kst'
export { kstToday }

/** "8월 14일" 형태 — 제목에 날짜를 넣어 검색어와 겹치는 표현을 만든다 */
export function kstTodayLabel(): string {
  const d = kstNow()
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`
}

export function kstMonthLabel(): string {
  return `${kstNow().getUTCMonth() + 1}월`
}

export function visiblePosts(): Post[] {
  // 여기서 걸러진 배열이 그대로 클라이언트 컴포넌트로 넘어간다(홈 큐레이션·랜딩 페이지
  // 전부) — 관리자 전용 필드가 페이지 소스에 실리지 않도록 여기서 한 번에 지운다
  return toPublicPosts(loadPosts().filter(isCustomerVisible))
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

/**
 * 오픈 예정 공구가 실제로 열렸는지 — 예고만 있고 아직 상품 페이지가 없으면(가격이
 * 없으면) 열린 게 아니다. `status`는 수집기가 실제로 채워 넣어도 그대로 'upcoming'에
 * 남아 있어서(그 필드를 아무도 안 바꾼다), 이 값만으로는 "진짜 열렸나"를 못 가른다.
 * 오늘 오픈 예정 5건 중 1건은 오늘 실제로 가격·이미지·링크가 채워졌는데 `status`는
 * 여전히 'upcoming'이었다 — 그 경우를 놓치지 않으려고 가격 유무로 가른다.
 */
function isAnnouncementOnly(p: Post): boolean {
  return getPeriodState(p).kind === 'upcoming' && !p.price
}

/**
 * 오늘 새로 올라온 공구 — "오늘의 공구"
 *
 * 처음에는 "오늘 마감"도 여기 넣었는데, 그러면 마감 임박 영역과 완전히 겹친다.
 * 실제로 확인해 보니 오늘의 공구 8건이 전부 마감 임박에도 들어 있었다(겹침 100%).
 * 두 영역이 답하는 질문을 갈라놓는다 — 여기는 "오늘 뭐 새로 나왔나",
 * 마감 임박은 "뭐가 곧 끝나나".
 *
 * 오늘 오픈 "예정"인데 아직 예고뿐인 건(가격·이미지·링크가 없는 건) 여기 안 넣는다 —
 * "곧 열려요"에만 있어야 한다. 예전엔 오늘 날짜만 보고 넣어서, 방금 채워진 진짜 공구
 * 옆에 "가격 미정" 빈 카드가 나란히 떴다.
 */
export function todayPosts(posts: Post[]): Post[] {
  const today = kstToday()
  return posts.filter(p => {
    // 수집기가 오늘 새로 물어온 공구 — 오픈일이 없어도 "오늘 올라온 것"은 맞다
    if ((p.scraped_at || '').slice(0, 10) === today) return true
    if (p.start_date !== today) return false
    return !isAnnouncementOnly(p)
  })
}

/**
 * 아직 안 열린 공구 — "곧 열려요".
 *
 * 오픈 예정이 55건인데 홈 어디에도 자리가 없어서 상세 조회가 **전 건 0회**였다(2026-08-24).
 * todayPosts가 "오늘 오픈하는 것"만 집어 가고, 카테고리 바에도 랜딩에도 없어서 찾아갈
 * 길이 없었다. 오픈일이 가까운 순으로 보여준다.
 */
export function upcomingPosts(posts: Post[]): Post[] {
  return posts
    // 실제로 열려서 가격이 채워졌으면 더 이상 "곧 열려요"가 아니다 — "오늘의 공구"·평소
    // 목록으로 넘어간다. 안 걸러내면 같은 공구가 두 영역에 동시에 뜬다
    .filter(isAnnouncementOnly)
    .sort((a, b) => {
      // 오픈일이 정해진 것을 먼저, 그중 가까운 순. 날짜 미정은 뒤로 민다
      const ad = a.start_date || '', bd = b.start_date || ''
      if (!ad !== !bd) return ad ? -1 : 1
      return ad.localeCompare(bd)
    })
}

/** 사람이 "계속 판다"고 확인해 준 공구 — "상시딜" */
export function evergreenPosts(posts: Post[]): Post[] {
  return posts.filter(isEvergreen)
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

/** 마감일이 정확히 오늘인 공구 — "오늘마감" 검색어는 "마감 임박"(3일 이내)과
 * 검색 의도가 달라서 따로 둔다. 오늘이 지나면 자동으로 빠진다(daysLeft===0만 본다) */
export function todayDeadlinePosts(posts: Post[]): Post[] {
  return posts.filter(p => {
    const state = getPeriodState(p)
    if (state.kind !== 'range' && state.kind !== 'deadline_only') return false
    return state.daysLeft === 0
  })
}

/** 이번 달에 진행 중이거나 진행됐던 공구 — "이달의 공구" */
export function monthlyPosts(posts: Post[]): Post[] {
  const month = kstToday().slice(0, 7)   // YYYY-MM
  return posts.filter(p => {
    if ((p.start_date || '').startsWith(month)) return true
    if ((p.deadline || '').startsWith(month)) return true
    // 지난달에 열려 이번 달에도 계속 진행 중인 공구
    if (p.start_date && p.deadline) return p.start_date < month && p.deadline >= month
    // 마감일이 없는 공구는 이번 달에도 진행 중인 것으로 본다. 마감일 미확인도 포함한다 —
    // 기간을 넘긴 건 isCustomerVisible이 이미 걸러서 여기까지 오지 않는다
    const kind = getPeriodState(p).kind
    return kind === 'evergreen' || kind === 'deadline_unknown'
  })
}

export function landingCopy(key: LandingKey, count: number): LandingCopy {
  switch (key) {
    case 'today':
      return {
        path: '/today',
        h1: `오늘의 공구 (${kstTodayLabel()})`,
        // 사람이 실제로 치는 검색어("오늘 공동구매", "오늘 공구")에 맞춰 부제 없이 간결하게 —
        // 긴 대시(—) 부제는 검색 결과에서 잘려 보이는 경우가 많다
        title: `오늘 새로 올라온 공동구매 모아보기 (${kstTodayLabel()})`,
        description: `${kstTodayLabel()}에 새로 오픈했거나 새로 올라온 인스타 공동구매 ${count}건을 모았어요. 오늘 나온 인플루언서 공구를 가장 먼저 확인하세요.`,
        empty: '오늘 새로 올라온 공구가 아직 없어요',
      }
    case 'deadline':
      return {
        path: '/deadline',
        h1: '마감 임박 공구',
        // "오늘 마감"이라고 쓰면 실제로는 1~3일 뒤 마감인 공구까지 오늘 마감인 것처럼
        // 읽혀서 틀린 말이 된다(원칙 1) — 페이지 실제 조건(3일 이내)에 맞춘 문구를 쓴다
        title: '마감 임박 공동구매 모아보기 — 3일 안에 끝나는 공구',
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
    case 'upcoming':
      return {
        path: '/upcoming',
        h1: '곧 열려요',
        title: '오픈 예정 공구 — 곧 열리는 인스타 공동구매 모아보기',
        description: `아직 열리지 않았지만 오픈이 예정된 인스타 인플루언서 공동구매 ${count}건을 모았어요. 캘린더에 담아두면 오픈일 아침에 알려드려요.`,
        empty: '오픈 예정인 공구가 없어요',
      }
    case 'evergreen':
      return {
        path: '/evergreen',
        h1: '상시딜',
        title: '상시딜 — 언제든 살 수 있는 공구 모아보기',
        description: `마감일 없이 계속 진행되는 인스타 인플루언서 공동구매(상시딜) ${count}건을 모았어요.`,
        empty: '상시딜로 확인된 공구가 없어요',
      }
    case 'deadline_today':
      return {
        path: '/deadline-today',
        h1: `오늘 마감 공구 (${kstTodayLabel()})`,
        title: `오늘 마감하는 공동구매 모아보기 (${kstTodayLabel()})`,
        description: `오늘(${kstTodayLabel()}) 마감되는 인스타 인플루언서 공동구매 ${count}건을 모았어요. 오늘 안에 놓치면 못 사는 공구부터 확인하세요.`,
        empty: '오늘 마감되는 공구가 없어요',
      }
    case 'popular':
      return {
        path: '/popular',
        h1: '인기 공구',
        title: '요즘 인기 있는 공동구매 — 많이 본 공구 모아보기',
        description: `최근 7일간 가장 많이 본 인스타 인플루언서 공동구매 ${count}건을 모았어요. 다른 사람들이 지금 뭘 보고 있는지 확인하세요.`,
        empty: '아직 조회 데이터가 쌓이지 않았어요',
      }
  }
}

export const LANDING_KEYS: LandingKey[] = ['today', 'deadline', 'deadline_today', 'monthly', 'upcoming', 'evergreen', 'popular']

import { CATEGORY_KEYS } from './types'
export { CATEGORY_KEYS }

// 카테고리 라벨과 뜻이 겹치는 실제 검색어 하나씩만 — 관련 없는 인기 키워드를
// 끼워넣지 않는다(네이버 서치어드바이저가 안내하는 대로, 억지로 넣으면 오히려 불리하다)
const CATEGORY_SYNONYM: Record<Category, string> = {
  kids: '육아',
  life: '생활용품',
  food: '먹거리',
  health: '헬스케어',
  beauty: '화장품',
}

export function categoryCopy(cat: Category, count: number): LandingCopy {
  const label = CATEGORY_LABEL[cat]
  const synonym = CATEGORY_SYNONYM[cat]
  return {
    path: `/category/${cat}`,
    h1: `${label} 공구`,
    title: `${label} 공동구매 · ${synonym} 공구 모아보기`,
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

/**
 * 공구는 끝났지만 지금 살 수 있는 상품 — 홈 하단 영역.
 * 대체 구매처를 확인해 둔 것만 넣는다. 링크가 없으면 사용자가 할 수 있는 게 없다.
 */
/**
 * 홈 중간에 넣는 컬렉션 배너 — 여러 상품을 카드로 돌리던 것(CollectionRoller) 대신
 * 컬렉션을 배너 한 장씩으로 소개한다. 활성 컬렉션이 여럿이면 옆으로 넘기는 배너 여러 장 +
 * 점 페이지네이션으로 보여준다(지금은 실제로 1개뿐이라 점 없이 한 장만 보인다).
 * /api/collections GET의 고객 노출 조건과 같은 기준(상품 있음 + 안 만료)을 쓴다.
 */
export function featuredCollectionBanners(): { id: string; title: string; description: string; emoji: string; color: string }[] {
  return loadCollections()
    .filter(c => c.productIds.length > 0 && !(c.expiresAt && new Date(c.expiresAt) < new Date()))
    .map(c => ({ id: c.id, title: c.title, description: c.description, emoji: c.emoji, color: c.color }))
}

export function endedButBuyablePosts(limit = 12): Post[] {
  return toPublicPosts(
    routablePosts()
      .filter(p => isExpired(p) && hasPurchaseLink(p))
      .sort((a, b) => (b.deadline || '').localeCompare(a.deadline || ''))
      .slice(0, limit)
  )
}
