import type { Post, Category } from './types'
import { getPeriodState, isCustomerVisible, daysLeft } from './period'
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
