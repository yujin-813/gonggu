import type { Post } from './types'
import { kstToday } from './kst'

// admin/page.tsx, PostCard.tsx, api/posts/route.ts 세 곳에 거의 동일한 로직이
// 중복돼 있던 걸 하나로 모은 것 — 공구 기간 계산·표시는 반드시 여기서만 한다.

export function daysLeft(deadline?: string): number {
  if (!deadline) return 999
  // "오늘"은 서버 타임존이 아니라 KST 기준이어야 한다 — lib/kst.ts 참고
  const today = Date.parse(`${kstToday()}T00:00:00Z`)
  const d = Date.parse(`${dateOnly(deadline)}T00:00:00Z`)
  return Math.round((d - today) / 86400000)
}

/** 날짜 필드에 시각이 섞여 들어와도("2026-08-17T00:00:00+09:00") 깨지지 않게 앞 10자만 본다 */
export function dateOnly(dateStr?: string): string {
  if (!dateStr) return ''
  return dateStr.length >= 10 && dateStr[4] === '-' ? dateStr.slice(0, 10) : dateStr
}

export function fmtDate(dateStr?: string): string {
  const d0 = dateOnly(dateStr)
  if (!d0) return ''
  const [, m, d] = d0.split('-')
  return `${parseInt(m)}.${parseInt(d)}`
}

type PeriodInput = Pick<Post, 'status' | 'start_date' | 'deadline' | 'is_evergreen_deal' | 'is_always_on' | 'sale_until_sold_out' | 'scraped_at' | 'ended_at'>

/**
 * 마감일을 못 찾은 공구를 언제까지 "진행 중"으로 볼 것인가.
 *
 * 공구는 대개 2~3일이면 끝나지만 우리가 마감일을 못 읽었을 뿐인 경우도 있어 넉넉히 잡았다.
 * 이 기간이 지나면 고객 목록에서 내리고 상세는 종료 안내로 바꾼다 — 상세 URL은 계속
 * 살려둔다(D-002).
 */
export const DEADLINE_UNKNOWN_DAYS = 21

/** 마감일 미확인 공구의 기준일 — 공구 시작일이 있으면 그게 정확하고, 없으면 수집 시점 */
function unknownBasisDate(post: PeriodInput): string {
  return dateOnly(post.start_date) || dateOnly(post.scraped_at) || ''
}

export type PeriodState =
  | { kind: 'upcoming'; startDate: string; daysToOpen: number | null }
  | { kind: 'evergreen'; startDate?: string }
  | { kind: 'sold_out_only'; startDate?: string }
  | { kind: 'range'; startDate: string; deadline: string; daysLeft: number }
  | { kind: 'deadline_only'; deadline: string; daysLeft: number }
  /**
   * 마감일을 모른다 — 수집기가 못 읽었고 관리자도 상시딜이라고 확인해 주지 않았다.
   *
   * 예전에는 이걸 evergreen(상시딜)과 한 덩어리로 봤다. "마감일이 없다 = 계속 판다"는
   * 전제였는데, 실제로는 수집기가 **못 찾은** 경우가 훨씬 많았다. 그 결과 이미 끝난 공구가
   * 고객 화면에 계속 진행 중으로 남았다 — 고객에게 보이는 110건 중 44건이 이 상태였고,
   * 그중 33건은 수집한 지 15일이 넘은 것이었다(2026-08-23 실측).
   *
   * 확신이 없으면 말하지 않는다(원칙 2). 상시딜이라고 단정하지 않고, daysSince가
   * DEADLINE_UNKNOWN_DAYS를 넘으면 끝난 것으로 본다.
   */
  | { kind: 'deadline_unknown'; startDate?: string; daysSince: number | null }

/**
 * status가 upcoming이어도 오픈일이 지났으면 더 이상 "오픈 예정"이 아니다.
 *
 * status는 한 번 upcoming으로 저장되면 아무도 바꿔주지 않는다. 그래서 오픈일이 지난 글이
 * 계속 upcoming으로 남고, daysToOpen이 음수가 되어 배지가 '오늘 오픈!'으로 떴다.
 * (마감된 공구가 새로 여는 공구처럼 보이는 문제) 상태는 저장값이 아니라 날짜로 판단한다.
 */
function isStillUpcoming(post: Pick<Post, 'status' | 'start_date'>): boolean {
  if (post.status !== 'upcoming') return false
  // 일정만 잡히고 오픈일이 아직 안 정해진 자리표시자는 그대로 오픈 예정으로 둔다
  if (!post.start_date) return true
  return daysLeft(post.start_date) >= 0
}

/** 공구의 기간 상태를 하나의 값으로 정리한다 — 이후 표시 로직은 전부 이 결과만 보고 분기한다. */
export function getPeriodState(post: PeriodInput): PeriodState {
  if (isStillUpcoming(post)) {
    const startDate = post.start_date || ''
    return { kind: 'upcoming', startDate, daysToOpen: startDate ? daysLeft(startDate) : null }
  }
  if (post.is_evergreen_deal || post.is_always_on) return { kind: 'evergreen', startDate: post.start_date || undefined }
  if (post.deadline) {
    return post.start_date
      ? { kind: 'range', startDate: post.start_date, deadline: post.deadline, daysLeft: daysLeft(post.deadline) }
      : { kind: 'deadline_only', deadline: post.deadline, daysLeft: daysLeft(post.deadline) }
  }
  // 마감일이 없을 때. 예전에는 전부 "상시딜"로 취급했는데, 그건 사람이 확인해 준 경우에만
  // 할 수 있는 말이다. 관리자 플래그(is_evergreen_deal/is_always_on/sale_until_sold_out)가
  // 붙은 건 위에서 이미 걸렀으므로, 여기까지 온 건 "우리가 마감일을 모르는" 공구다.
  if (post.sale_until_sold_out) return { kind: 'sold_out_only', startDate: post.start_date || undefined }
  const basis = unknownBasisDate(post)
  return {
    kind: 'deadline_unknown',
    startDate: post.start_date || undefined,
    daysSince: basis ? -daysLeft(basis) : null,
  }
}

/**
 * 이 공구가 "상시딜" 탭에 노출돼야 하는지.
 *
 * 마감일을 모르는 공구는 더 이상 여기 포함하지 않는다 — 상시딜이라고 말하려면 사람이
 * 확인해 줘야 한다. 그 전에는 deadline_unknown으로 따로 센다.
 */
export function isEvergreen(post: PeriodInput): boolean {
  return getPeriodState(post).kind === 'evergreen'
}

/** 관리자 목록용 한 줄 텍스트 */
export function periodLabel(post: PeriodInput): string {
  if (post.ended_at) return `${fmtDate(post.ended_at)} 종료 확인`
  const s = getPeriodState(post)
  switch (s.kind) {
    case 'upcoming':     return s.startDate ? `${fmtDate(s.startDate)} 오픈 예정` : '오픈 예정'
    case 'evergreen':    return s.startDate ? `${fmtDate(s.startDate)}~ 상시딜` : '상시딜'
    case 'sold_out_only': return s.startDate ? `${fmtDate(s.startDate)}~ · 소진시 마감` : '한정수량 · 소진시 마감'
    case 'deadline_unknown': {
      const since = s.daysSince === null ? '' : ` (${s.daysSince}일째)`
      return s.startDate ? `${fmtDate(s.startDate)}~ 마감일 미확인${since}` : `마감일 미확인${since}`
    }
    case 'range':         return `${fmtDate(s.startDate)} ~ ${fmtDate(s.deadline)}`
    case 'deadline_only': return `~ ${fmtDate(s.deadline)}`
  }
}

/** 이 공구가 지금 실제로 마감이 지나 고객 화면에서 자동 숨김되는지 (상시딜/소진시는 예외) */
export function isExpired(post: PeriodInput): boolean {
  // 사람이 직접 확인한 종료가 가장 정확하다 — 날짜 계산보다 먼저 본다
  if (post.ended_at) return true
  const s = getPeriodState(post)
  if (s.kind === 'deadline_unknown') return s.daysSince !== null && s.daysSince > DEADLINE_UNKNOWN_DAYS
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
export function isCustomerVisible(post: Pick<Post, 'status' | 'published' | 'is_evergreen_deal' | 'is_always_on' | 'sale_until_sold_out' | 'deadline' | 'start_date' | 'scraped_at' | 'ended_at'>): boolean {
  // 아직 안 열린 공구는 마감일과 무관하게 보여준다 (오픈 예정 카드)
  if (isStillUpcoming(post)) return post.published !== false
  // 오픈일이 지난 오픈예정 글은 이제 일반 공구로 취급 — 아래 마감일 검사를 그대로 탄다.
  // 예전에는 여기서 바로 true를 돌려줘서, 마감일이 지나도 고객 화면에 계속 남아 있었다.
  const isPublished =
    post.status === 'published' || post.status === 'upcoming' || (!post.status && post.published !== false)
  if (!isPublished || post.published === false) return false
  // 사람이 끝났다고 확인했으면 상시딜 표시가 붙어 있어도 내린다 — 사람 확인이 가장 정확하다
  if (post.ended_at) return false
  // 사람이 "계속 판다"고 확인해 준 것만 마감일 없이도 계속 보여준다
  if (post.is_evergreen_deal || post.is_always_on || post.sale_until_sold_out) return true
  // 마감일을 모르는 공구는 DEADLINE_UNKNOWN_DAYS까지만 진행 중으로 본다.
  // 그 전에는 무기한 노출돼서, 이미 끝난 공구가 고객 화면 최상위 착지 페이지로 남아 있었다.
  if (!post.deadline) return !isExpired(post)
  return dateOnly(post.deadline) >= kstToday()
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
      // 오픈일을 모를 때 '오늘 오픈!'이라고 단정하면 안 된다 — 일정만 잡히고 날짜가
      // 아직 안 정해진 자리표시자에도 그 문구가 붙어 있었다
      if (state.daysToOpen === null) return { cls: 'soon', icon: 'calendar-clock', txt: '오픈 예정' }
      return { cls: 'soon', icon: 'calendar-clock', txt: state.daysToOpen > 0 ? `D-${state.daysToOpen} 오픈` : '오늘 오픈!' }
    case 'evergreen':
      return { cls: 'ok', icon: 'package', txt: '상시딜' }
    case 'sold_out_only':
      return { cls: 'soon', icon: 'flame', txt: '소진시 마감' }
    case 'deadline_unknown':
      // 마감일을 모르면 배지를 안 붙인다. 예전엔 '상시딜'이 붙었는데, 우리가 못 읽었을 뿐인
      // 걸 "계속 판다"고 고객에게 단정하는 말이었다
      return null
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
    case 'upcoming':      return { cls: '', icon: 'calendar', txt: state.startDate ? `${fmtDate(state.startDate)} 오픈 예정` : '오픈일 미정' }
    case 'evergreen':     return { cls: '', icon: 'calendar', txt: state.startDate ? `${fmtDate(state.startDate)}부터 진행 중` : '상시딜' }
    case 'sold_out_only': return { cls: '', icon: 'calendar', txt: state.startDate ? `${fmtDate(state.startDate)}부터 · 한정수량 소진시 마감` : '한정수량 · 소진시 마감' }
    case 'deadline_unknown': return { cls: '', icon: 'calendar', txt: state.startDate ? `${fmtDate(state.startDate)}부터 진행 중` : '진행 중' }
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
