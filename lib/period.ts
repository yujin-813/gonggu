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
  | { kind: 'evergreen'; startDate?: string }
  | { kind: 'sold_out_only'; startDate?: string }
  | { kind: 'range'; startDate: string; deadline: string; daysLeft: number }
  | { kind: 'deadline_only'; deadline: string; daysLeft: number }

/** 공구의 기간 상태를 하나의 값으로 정리한다 — 이후 표시 로직은 전부 이 결과만 보고 분기한다. */
export function getPeriodState(post: PeriodInput): PeriodState {
  if (post.status === 'upcoming') {
    const startDate = post.start_date || ''
    return { kind: 'upcoming', startDate, daysToOpen: startDate ? daysLeft(startDate) : null }
  }
  if (post.is_evergreen_deal || post.is_always_on) return { kind: 'evergreen', startDate: post.start_date || undefined }
  if (post.deadline) {
    return post.start_date
      ? { kind: 'range', startDate: post.start_date, deadline: post.deadline, daysLeft: daysLeft(post.deadline) }
      : { kind: 'deadline_only', deadline: post.deadline, daysLeft: daysLeft(post.deadline) }
  }
  // 마감일이 없을 때: "소진시 마감"으로 명시된 경우만 예외로 두고, 그 외(시작일만 있거나
  // 기간 정보가 아예 없는 경우)는 전부 "상시딜"로 취급한다 — 마감일이 없다는 건 특정 시점에
  // 끝나지 않고 계속 판매된다는 뜻이라, "마감일 미확인"보다 상시딜이 더 정확한 표현이다.
  // 다만 시작일은 알고 있는 경우가 있으니(오픈일만 확인되고 마감일은 못 찾은 경우) 그 값은
  // 버리지 않고 evergreen/sold_out_only에 실어 보내 화면에 "OO부터 진행 중"으로 보여준다
  if (post.sale_until_sold_out) return { kind: 'sold_out_only', startDate: post.start_date || undefined }
  return { kind: 'evergreen', startDate: post.start_date || undefined }
}

/** 이 공구가 "상시딜" 탭에 노출돼야 하는지 (명시적 상시딜 플래그 + 마감일 없는 공구 전부 포함) */
export function isEvergreen(post: PeriodInput): boolean {
  return getPeriodState(post).kind === 'evergreen'
}

/** 관리자 목록용 한 줄 텍스트 */
export function periodLabel(post: PeriodInput): string {
  const s = getPeriodState(post)
  switch (s.kind) {
    case 'upcoming':     return s.startDate ? `${fmtDate(s.startDate)} 오픈 예정` : '오픈 예정'
    case 'evergreen':    return s.startDate ? `${fmtDate(s.startDate)}~ 상시딜` : '상시딜'
    case 'sold_out_only': return s.startDate ? `${fmtDate(s.startDate)}~ · 소진시 마감` : '한정수량 · 소진시 마감'
    case 'range':         return `${fmtDate(s.startDate)} ~ ${fmtDate(s.deadline)}`
    case 'deadline_only': return `~ ${fmtDate(s.deadline)}`
  }
}

/** 이 공구가 지금 실제로 마감이 지나 고객 화면에서 자동 숨김되는지 (상시딜/소진시는 예외) */
export function isExpired(post: PeriodInput): boolean {
  const s = getPeriodState(post)
  return (s.kind === 'range' || s.kind === 'deadline_only') && s.daysLeft < 0
}

/**
 * 상세 페이지 URL을 계속 열어둬도 되는 상품인지 — 마감 여부는 보지 않는다.
 *
 * 목록에서는 마감 공구를 숨기지만(isCustomerVisible), 상세 URL까지 404로 만들면 검색에
 * 색인된 페이지가 통째로 죽는다. 공구가 끝나도 "지금 바로 살 수 있는 곳"과 "비슷한 공구"를
 * 찾는 유입은 계속되므로 페이지는 살려두고 화면만 종료 상태로 바꾼다.
 * 단, 검수 중이거나 제외된 글은 애초에 공개된 적이 없으므로 계속 404여야 한다.
 */
export function isPagePublic(post: Pick<Post, 'status' | 'published'>): boolean {
  if (post.status === 'upcoming') return post.published !== false
  return post.status === 'published' || (!post.status && post.published !== false)
}

/** 고객 화면에 노출해도 되는 상품인지 — api/posts, api/collections/[id] 등에서 공통으로 쓴다 */
export function isCustomerVisible(post: Pick<Post, 'status' | 'published' | 'is_evergreen_deal' | 'is_always_on' | 'deadline'>): boolean {
  if (post.status === 'upcoming') return post.published !== false
  const isPublished = post.status === 'published' || (!post.status && post.published !== false)
  if (!isPublished) return false
  if (post.is_evergreen_deal || post.is_always_on) return true
  if (!post.deadline) return true
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return new Date(post.deadline) >= today
}

const NEW_WINDOW_HOURS = 48

/** 최근(기본 48시간 이내) 수집된 공구인지 — "NEW" 배지용 */
export function isNewPost(scrapedAt?: string): boolean {
  if (!scrapedAt) return false
  const t = new Date(scrapedAt).getTime()
  if (Number.isNaN(t)) return false
  return Date.now() - t <= NEW_WINDOW_HOURS * 60 * 60 * 1000
}

export type BadgeIcon = 'calendar-clock' | 'package' | 'flame' | 'lock' | 'timer'
export type PeriodIcon = 'calendar' | 'zap'

/** 카드 왼쪽 위 D-day 배지 — 상시딜/소진시는 배지엔 짧게, 시작일 같은 세부 정보는
 * periodTextFromState(하단 기간 텍스트 줄)에서 보여준다 */
export function badgeFromState(state: PeriodState): { cls: string; icon: BadgeIcon; txt: string } | null {
  switch (state.kind) {
    case 'upcoming':
      return { cls: 'soon', icon: 'calendar-clock', txt: state.daysToOpen !== null && state.daysToOpen > 0 ? `D-${state.daysToOpen} 오픈` : '오늘 오픈!' }
    case 'evergreen':
      return { cls: 'ok', icon: 'package', txt: '상시딜' }
    case 'sold_out_only':
      return { cls: 'soon', icon: 'flame', txt: '소진시 마감' }
    case 'range':
    case 'deadline_only': {
      const d = state.daysLeft
      if (d < 0) return { cls: 'closed', icon: 'lock', txt: '마감' }
      if (d === 0) return { cls: 'urgent', icon: 'timer', txt: '오늘 마감!' }
      if (d === 1) return { cls: 'urgent', icon: 'timer', txt: 'D-1' }
      if (d <= 3) return { cls: 'soon', icon: 'timer', txt: `D-${d}` }
      return { cls: 'ok', icon: 'timer', txt: `D-${d}` }
    }
  }
}

/** 카드 하단 기간 텍스트 줄 */
export function periodTextFromState(state: PeriodState): { cls: string; icon: PeriodIcon; txt: string } {
  switch (state.kind) {
    case 'upcoming':      return { cls: '', icon: 'calendar', txt: `${fmtDate(state.startDate)} 오픈 예정` }
    case 'evergreen':     return { cls: '', icon: 'calendar', txt: state.startDate ? `${fmtDate(state.startDate)}부터 진행 중` : '상시딜' }
    case 'sold_out_only': return { cls: '', icon: 'calendar', txt: state.startDate ? `${fmtDate(state.startDate)}부터 · 한정수량 소진시 마감` : '한정수량 · 소진시 마감' }
    case 'range':
      if (state.daysLeft < 0) return { cls: 'urgent', icon: 'calendar', txt: '마감됨' }
      if (state.daysLeft === 0) return { cls: 'urgent', icon: 'zap', txt: '오늘 마감!' }
      if (state.daysLeft === 1) return { cls: 'urgent', icon: 'zap', txt: '내일 마감!' }
      return { cls: '', icon: 'calendar', txt: `${fmtDate(state.startDate)} ~ ${fmtDate(state.deadline)}` }
    case 'deadline_only':
      if (state.daysLeft < 0) return { cls: 'urgent', icon: 'calendar', txt: '마감됨' }
      if (state.daysLeft === 0) return { cls: 'urgent', icon: 'zap', txt: '오늘 마감!' }
      if (state.daysLeft === 1) return { cls: 'urgent', icon: 'zap', txt: '내일 마감!' }
      return { cls: '', icon: 'calendar', txt: `~ ${fmtDate(state.deadline)} 마감` }
  }
}
