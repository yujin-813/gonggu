import type { Post } from './types'

// admin/page.tsx, PostCard.tsx, api/posts/route.ts 세 곳에 거의 동일한 로직이
// 중복돼 있던 걸 하나로 모은 것 — 공구 기간 계산·표시는 반드시 여기서만 한다.

export function daysLeft(deadline?: string): number {
  if (!deadline) return 999
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(deadline); d.setHours(0, 0, 0, 0)
  return Math.ceil((d.getTime() - today.getTime()) / 86400000)
}

export function fmtDate(dateStr?: string): string {
  if (!dateStr) return ''
  const [, m, d] = dateStr.split('-')
  return `${parseInt(m)}.${parseInt(d)}`
}

type PeriodInput = Pick<Post, 'status' | 'start_date' | 'deadline' | 'is_evergreen_deal' | 'is_always_on' | 'sale_until_sold_out'>

export type PeriodState =
  | { kind: 'upcoming'; startDate: string; daysToOpen: number | null }
  | { kind: 'evergreen' }
  | { kind: 'sold_out_only' }
  | { kind: 'range'; startDate: string; deadline: string; daysLeft: number }
  | { kind: 'deadline_only'; deadline: string; daysLeft: number }
  | { kind: 'start_only'; startDate: string }
  | { kind: 'unknown' }

/** 공구의 기간 상태를 하나의 값으로 정리한다 — 이후 표시 로직은 전부 이 결과만 보고 분기한다. */
export function getPeriodState(post: PeriodInput): PeriodState {
  if (post.status === 'upcoming') {
    const startDate = post.start_date || ''
    return { kind: 'upcoming', startDate, daysToOpen: startDate ? daysLeft(startDate) : null }
  }
  if (post.is_evergreen_deal || post.is_always_on) return { kind: 'evergreen' }
  if (post.deadline) {
    return post.start_date
      ? { kind: 'range', startDate: post.start_date, deadline: post.deadline, daysLeft: daysLeft(post.deadline) }
      : { kind: 'deadline_only', deadline: post.deadline, daysLeft: daysLeft(post.deadline) }
  }
  // 마감일이 없을 때: "소진시 마감"으로 확인된 경우와, 시작일만 있는 경우, 아예 모르는 경우를 구분한다
  if (post.sale_until_sold_out) return { kind: 'sold_out_only' }
  if (post.start_date) return { kind: 'start_only', startDate: post.start_date }
  return { kind: 'unknown' }
}

/** 관리자 목록용 한 줄 텍스트 */
export function periodLabel(post: PeriodInput): string {
  const s = getPeriodState(post)
  switch (s.kind) {
    case 'upcoming':     return s.startDate ? `${fmtDate(s.startDate)} 오픈 예정` : '오픈 예정'
    case 'evergreen':    return '상시딜'
    case 'sold_out_only': return '한정수량 · 소진시 마감'
    case 'range':         return `${fmtDate(s.startDate)} ~ ${fmtDate(s.deadline)}`
    case 'deadline_only': return `~ ${fmtDate(s.deadline)}`
    case 'start_only':    return `${fmtDate(s.startDate)} 시작 · 마감일 미확인`
    case 'unknown':       return '마감일 미확인'
  }
}

/** 이 공구가 지금 실제로 마감이 지나 고객 화면에서 자동 숨김되는지 (상시딜/소진시는 예외) */
export function isExpired(post: PeriodInput): boolean {
  const s = getPeriodState(post)
  return (s.kind === 'range' || s.kind === 'deadline_only') && s.daysLeft < 0
}

const NEW_WINDOW_HOURS = 48

/** 최근(기본 48시간 이내) 수집된 공구인지 — "NEW" 배지용 */
export function isNewPost(scrapedAt?: string): boolean {
  if (!scrapedAt) return false
  const t = new Date(scrapedAt).getTime()
  if (Number.isNaN(t)) return false
  return Date.now() - t <= NEW_WINDOW_HOURS * 60 * 60 * 1000
}

/** 카드 왼쪽 위 D-day 배지. 정보가 없으면(start_only/unknown) 거짓 정보를 주느니 배지를 숨긴다 */
export function badgeFromState(state: PeriodState): { cls: string; icon: string; txt: string } | null {
  switch (state.kind) {
    case 'upcoming':
      return { cls: 'soon', icon: '🗓️', txt: state.daysToOpen !== null && state.daysToOpen > 0 ? `D-${state.daysToOpen} 오픈` : '오늘 오픈!' }
    case 'evergreen':
      return { cls: 'ok', icon: '📦', txt: '상시딜' }
    case 'sold_out_only':
      return { cls: 'soon', icon: '🔥', txt: '소진시 마감' }
    case 'range':
    case 'deadline_only': {
      const d = state.daysLeft
      if (d < 0) return { cls: 'closed', icon: '🔒', txt: '마감' }
      if (d === 0) return { cls: 'urgent', icon: '⏰', txt: '오늘 마감!' }
      if (d === 1) return { cls: 'urgent', icon: '⏰', txt: 'D-1' }
      if (d <= 3) return { cls: 'soon', icon: '⏰', txt: `D-${d}` }
      return { cls: 'ok', icon: '⏰', txt: `D-${d}` }
    }
    case 'start_only':
    case 'unknown':
      return null
  }
}

/** 카드 하단 기간 텍스트 줄 */
export function periodTextFromState(state: PeriodState): { cls: string; txt: string } {
  switch (state.kind) {
    case 'upcoming':      return { cls: '', txt: `📅 ${fmtDate(state.startDate)} 오픈 예정` }
    case 'evergreen':     return { cls: '', txt: '📅 상시딜' }
    case 'sold_out_only': return { cls: '', txt: '📅 한정수량 · 소진시 마감' }
    case 'range':
      if (state.daysLeft < 0) return { cls: 'urgent', txt: '마감됨' }
      if (state.daysLeft === 0) return { cls: 'urgent', txt: '⚡ 오늘 마감!' }
      if (state.daysLeft === 1) return { cls: 'urgent', txt: '⚡ 내일 마감!' }
      return { cls: '', txt: `📅 ${fmtDate(state.startDate)} ~ ${fmtDate(state.deadline)}` }
    case 'deadline_only':
      if (state.daysLeft < 0) return { cls: 'urgent', txt: '마감됨' }
      if (state.daysLeft === 0) return { cls: 'urgent', txt: '⚡ 오늘 마감!' }
      if (state.daysLeft === 1) return { cls: 'urgent', txt: '⚡ 내일 마감!' }
      return { cls: '', txt: `📅 ~ ${fmtDate(state.deadline)} 마감` }
    case 'start_only':    return { cls: '', txt: `📅 ${fmtDate(state.startDate)} 시작 · 마감일 미확인` }
    case 'unknown':       return { cls: '', txt: '' }
  }
}
