import type { Post } from './types'
import { normalizePurchaseLinks } from './purchaseLinks'

// 꿀공구의 핵심은 "공구를 모아주는 것"이 아니라 "이 공구가 진짜 싼지 판정해주는 것"이다.
// 판정 기준은 반드시 한 곳에서만 계산한다 — 카드·상세·공유 이미지가 서로 다른 등급을
// 보여주면 판정 자체를 못 믿게 되기 때문이다.
//
// 등급을 매길 수 없는 경우(다른 판매처 가격을 모름)에 억지로 등급을 붙이지 않는다.
// 모르는 걸 "고민딜"이라고 하면 그건 판정이 아니라 추측이고, 한 번만 틀려도 신뢰를 잃는다.

export type DealGradeKey = 'honey' | 'good' | 'hmm' | 'meh'

export interface DealGrade {
  key: DealGradeKey
  /** 배지에 쓰는 짧은 이름 */
  label: string
  /** 판정 한 줄 설명 */
  line: string
}

export const GRADES: Record<DealGradeKey, Omit<DealGrade, 'key'>> = {
  honey: { label: '꿀딜',   line: '가격 메리트가 확실해요. 지금 사도 좋은 딜이에요.' },
  good:  { label: '괜찮딜', line: '조금 더 저렴해요. 구매할 만한 가격이에요.' },
  hmm:   { label: '고민딜', line: '가격 차이가 크지 않아요. 배송비·사은품까지 비교해보세요.' },
  meh:   { label: '아쉽딜', line: '공구 가격 메리트가 적어요. 다른 곳이 더 나을 수 있어요.' },
}

// 등급을 매길 수 없는 경우도 화면에서는 같은 모양으로 보여야 한다. 비교가가 없다고
// 빈 회색 상자만 띄우면 "정보가 없는 실패 상태"로 읽히는데, 실제로는 아직 확인 못 한
// "판정 보류"일 뿐이다. 그래서 등급(4종)과 별개인 상태를 두 개 더 둔다 —
// 4등급 체계 자체는 그대로 유지된다.
export type VerdictState = DealGradeKey | 'pending' | 'exclusive'

export interface VerdictDisplay {
  key: VerdictState
  label: string
  line: string
}

export const NON_GRADE_STATES: Record<'pending' | 'exclusive', Omit<VerdictDisplay, 'key'>> = {
  pending: {
    label: '판정 대기',
    line: '다른 판매처에서 같은 상품을 찾지 못했어요. 가격 외에 구성과 혜택도 함께 확인해보세요.',
  },
  exclusive: {
    label: '단독 공구',
    line: '다른 곳에서는 판매하지 않는 공구 전용 상품이라 비교할 가격이 없어요.',
  },
}

/** 관리자가 직접 입력한 판단 문구의 색상 구분을 등급으로 옮길 때 쓰는 대응표 */
const CLS_TO_GRADE: Record<string, DealGradeKey> = {
  great: 'honey', good: 'good', neutral: 'hmm', check: 'meh',
}

export interface ComparePrice {
  label: string
  price: number
  /** 실시간 조회가 아니라 확인 시점 기준이라는 걸 화면에서 밝히기 위해 함께 넘긴다 */
  checkedAt?: string | null
}

export interface DealVerdict {
  /** 화면에 항상 하나는 있는 표시 상태 — 등급 4종 또는 판정 대기·단독 공구 */
  display: VerdictDisplay
  /** 실제 등급이 매겨졌을 때만 채워진다. "등급인가 아닌가"를 구분해야 할 때 쓴다 */
  grade: DealGrade | null
  /** 비교에 쓴 "다른 곳에서 살 수 있는 최저가" */
  referencePrice: number | null
  referenceLabel: string
  /** 기준가 대비 할인율(%). 음수면 공구가 더 비싸다는 뜻 */
  discountRate: number | null
  /** 화면에 나란히 보여줄 판매처별 가격 */
  comparePrices: ComparePrice[]
  /** 관리자가 직접 쓴 문구가 있으면 기본 설명 대신 이걸 쓴다 */
  customLine?: string | null
  /** 다른 곳에서 아예 안 파는 상품이라고 관리자가 확인한 경우 */
  exclusive: boolean
}

function gradeFromRate(rate: number): DealGradeKey {
  if (rate >= 0.15) return 'honey'
  if (rate >= 0.05) return 'good'
  if (rate > -0.05) return 'hmm'
  return 'meh'
}

/**
 * 상품 하나의 가격 판정을 계산한다.
 *
 * 비교 기준가는 "다른 데서 사면 얼마인가"라서, 알고 있는 다른 판매처 가격 중 가장 싼 값을
 * 쓴다. 관리자가 확인한 구매 링크 가격과 정가, 자동 매칭된 네이버 최저가가 후보다.
 */
export function getDealVerdict(post: Post): DealVerdict {
  const candidates: ComparePrice[] = []

  for (const link of normalizePurchaseLinks(post)) {
    if (link.price && link.price > 0) {
      const name = link.platform === 'coupang' ? '쿠팡' : link.platform === 'naver' ? '네이버' : '다른 판매처'
      candidates.push({ label: name, price: link.price, checkedAt: link.checked_at })
    }
  }
  if (post.market_price && post.market_price > 0) {
    // 이미 같은 이름(네이버)이 관리자 확인 값으로 들어와 있으면 자동 매칭값은 쓰지 않는다 —
    // 사람이 확인한 쪽이 더 정확하다
    if (!candidates.some(c => c.label === '네이버')) {
      candidates.push({ label: '네이버 최저가', price: post.market_price })
    }
  }
  if (post.origPrice && post.origPrice > 0) {
    candidates.push({ label: '정가', price: post.origPrice })
  }

  const exclusive = !!post.is_exclusive_deal

  // 오픈 예정이거나 가격이 없으면 판정 대상이 아니다
  if (!post.price || post.status === 'upcoming') {
    return {
      display: { key: 'pending', ...NON_GRADE_STATES.pending },
      grade: null, referencePrice: null, referenceLabel: '', discountRate: null,
      comparePrices: candidates, customLine: null, exclusive,
    }
  }

  const cheapest = candidates.length
    ? candidates.reduce((min, c) => (c.price < min.price ? c : min))
    : null

  // 관리자가 직접 판단 문구를 남겼으면 그 판단을 우선한다 — 자동 계산이 데이터 부족으로
  // 놓친 부분을 사람이 아는 정보로 보완하는 용도다
  if (post.custom_verdict) {
    const key = CLS_TO_GRADE[post.custom_verdict_cls || 'neutral'] || 'hmm'
    return {
      display: { key, ...GRADES[key] },
      grade: { key, ...GRADES[key] },
      referencePrice: cheapest?.price ?? null,
      referenceLabel: cheapest?.label ?? '',
      discountRate: cheapest ? (cheapest.price - post.price) / cheapest.price : null,
      comparePrices: candidates,
      customLine: post.custom_verdict_detail || post.custom_verdict,
      exclusive,
    }
  }

  if (!cheapest) {
    const key = exclusive ? 'exclusive' : 'pending'
    return {
      display: { key, ...NON_GRADE_STATES[key] },
      grade: null, referencePrice: null, referenceLabel: '', discountRate: null,
      comparePrices: [], customLine: null, exclusive,
    }
  }

  const rate = (cheapest.price - post.price) / cheapest.price
  const key = gradeFromRate(rate)
  return {
    display: { key, ...GRADES[key] },
    grade: { key, ...GRADES[key] },
    referencePrice: cheapest.price,
    referenceLabel: cheapest.label,
    discountRate: rate,
    comparePrices: candidates,
    customLine: null,
    exclusive,
  }
}

/** "17% 저렴" / "3% 비쌈" 처럼 사람이 읽는 문구 */
export function rateText(rate: number): string {
  const pct = Math.round(Math.abs(rate) * 100)
  return rate >= 0 ? `${pct}% 저렴` : `${pct}% 비쌈`
}

/**
 * 공유 버튼 문구 — 등급에 따라 말이 달라야 자연스럽다.
 * 싼 걸 찾았을 때는 "같이 사자"가 실제로 사람들이 하는 말이고, 애매한 건 그냥 보여주는 정도다.
 */
export function shareLabel(grade: DealGradeKey | null): string {
  switch (grade) {
    case 'honey': return '친구랑 같이 사자고 하기'
    case 'good':  return '친구에게 이 가격 보여주기'
    default:      return '친구에게 공유하기'
  }
}
