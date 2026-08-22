import type { Post } from './types'
import { getDealVerdict } from './dealGrade'

/**
 * 비교가 작업 상태 — **관리자 전용**이다.
 *
 * 지금까지는 "비교가가 없다" 하나로 뭉뚱그려 놨다. 그래서 아직 아무도 안 본 공구와,
 * 사람이 다 찾아본 끝에 비교할 게 없다고 확인한 공구가 같은 목록에 섞였다. 목록이 줄지
 * 않으니 같은 공구를 몇 번씩 다시 뒤지게 되고, 남은 일이 몇 건인지도 알 수 없었다.
 *
 * 셋을 가르는 기준은 하나다 — **비교불가는 사람이 확인하고 명시적으로 고른 상태**다.
 * 자동으로 비교불가가 되는 경로는 없다. 그래야 "아직 안 봤다"와 "보고 없었다"가 섞이지
 * 않는다.
 *
 * 고객 화면은 이 값을 쓰지 않는다. 검수 상태는 우리 사정이라 고객에게 쓰지 않으며(원칙 3),
 * 고객에게는 지금처럼 getDealVerdict()의 판정만 보인다.
 */
export type CompareState = 'compared' | 'incomparable' | 'unchecked'

export const COMPARE_STATE_LABEL: Record<CompareState, string> = {
  unchecked:    '미확인',
  compared:     '비교가 있음',
  incomparable: '비교불가',
}

export function getCompareState(post: Post): CompareState {
  const v = getDealVerdict(post)
  // 값이 실제로 붙어 있으면 그게 사실이다 — 예전에 비교불가로 표시해 뒀더라도 값이 이긴다.
  // grade는 옵션 경로(세트별 비교가)에서, referencePrice는 게시물 단위 경로에서 나온다.
  // comparePrices는 오픈 예정처럼 판정을 못 내는 경우에도 채워지므로 함께 본다.
  if (v.grade || v.referencePrice !== null || v.comparePrices.length > 0) return 'compared'
  if (post.compare_none_at) return 'incomparable'
  return 'unchecked'
}

/** 비교불가 표시를 지울 때 함께 비워야 하는 필드들 — 한 군데서만 관리한다 */
export const CLEAR_COMPARE_NONE = {
  compare_none_at: null,
  compare_none_reason: null,
  compare_none_note: null,
} as const
