import type { Post, DealOption } from './types'
import { normalizePurchaseLinks, isSameProduct } from './purchaseLinks'
import { getPeriodState } from './period'

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
export type VerdictState = DealGradeKey | 'pending' | 'exclusive' | 'multi'

export interface VerdictDisplay {
  key: VerdictState
  label: string
  line: string
}

export const NON_GRADE_STATES: Record<'pending' | 'exclusive' | 'multi', Omit<VerdictDisplay, 'key'>> = {
  multi: {
    label: '여러 상품',
    line: '상품마다 가격이 달라 하나로 판정하기 어려워요. 링크에서 원하는 상품의 가격을 확인해보세요.',
  },
  // 목록에서는 이 배지를 아예 안 보여주고(카드 컴포넌트에서 걸러낸다) 상세에서만 쓴다.
  // 상세는 읽으러 온 자리라 설명이 통하고, 목록은 훑는 자리라 판단이 안 서는 배지가 방해만 된다.
  pending: {
    label: '가격 비교 전',
    line: '아직 다른 곳에서 같은 상품을 찾지 못했어요. 확인되는 대로 판정을 올려드릴게요.',
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

/** 세트 하나의 판정 결과 — 상세 페이지 표에 그대로 쓴다 */
export interface OptionVerdict {
  option: DealOption
  /** 비교가가 없으면 null */
  discountRate: number | null
  /** 절약 금액 */
  saved: number | null
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
  /** 세트 옵션이 등록돼 있으면 옵션별 판정 — 비어 있으면 단일 상품 공구다 */
  options: OptionVerdict[]
  /** 옵션 중 가장 싼 공구가 — 카드에 "N원부터"로 쓴다 */
  fromPrice: number | null
  /** 비교 가능한 옵션들의 할인율 범위 */
  rateRange: { min: number; max: number } | null
}

// 한 링크에서 여러 상품을 옵션별 가격으로 파는 공구는 대표가 하나로 전체를 판정할 수 없다.
// "약 25종 골라담기"에 꿀딜을 붙이면 25종 전부가 싸다고 말하는 셈이라, 판정기가 거짓말을 한다.
// 제목이 확실할 때만 자동 판단하고("골라담기", "모음전"), "6종 선물상자"처럼 한 세트를 파는
// 것일 수도 있는 표현은 건드리지 않고 관리자 판단에 맡긴다.
const MULTI_OPTION_TITLE = /골라담기|모음전|기획전|모음|택\s*\d|컬렉션|중\s*택/

export function isMultiOption(post: Pick<Post, 'title' | 'is_multi_option'>): boolean {
  if (typeof post.is_multi_option === 'boolean') return post.is_multi_option
  return MULTI_OPTION_TITLE.test(post.title || '')
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
/**
 * 자동 매칭된 네이버 최저가가 공구가의 이 비율보다 낮으면 다른 상품을 잡은 것으로 본다.
 *
 * 실제 사례: 데코아르 초미니 드라이기(공구가 59,000 · 정가 99,000)에 자동 매칭값이
 * 19,800원으로 들어와 있었다. 40% 할인 상품이 '아쉽딜'로 판정됐다. 니치 상품이거나
 * 옵션이 다르면 엉뚱한 상품과 매칭되는데, 그 값을 그대로 믿으면 판정이 뒤집힌다.
 */
export const AUTO_MATCH_FLOOR = 0.5

/** 세트 옵션이 있는 공구의 판정. 게시물 단위 비교가 대신 옵션별로 계산한다. */
function verdictFromOptions(post: Post, opts: DealOption[]): DealVerdict {
  const options: OptionVerdict[] = opts.map(o => {
    const cp = o.comparePrice && o.comparePrice > 0 ? o.comparePrice : null
    return {
      option: o,
      discountRate: cp && o.price ? (cp - o.price) / cp : null,
      saved: cp && o.price ? cp - o.price : null,
    }
  })

  const rates = options.map(o => o.discountRate).filter((r): r is number => r !== null)
  const prices = opts.map(o => o.price).filter(n => n > 0)
  const fromPrice = prices.length ? Math.min(...prices) : null

  // 비교가가 하나도 없으면 아직 판정할 수 없다
  if (!rates.length) {
    return {
      display: { key: 'pending', ...NON_GRADE_STATES.pending },
      grade: null, referencePrice: null, referenceLabel: '', discountRate: null,
      comparePrices: [], customLine: null, exclusive: !!post.is_exclusive_deal,
      options, fromPrice, rateRange: null,
    }
  }

  // 등급은 중앙값으로 매긴다. 최댓값을 쓰면 옵션 하나가 유난히 싼 공구가 전부 꿀딜이
  // 되어 판정이 부풀려진다. 범위는 아래 rateRange로 따로 알려준다.
  const sorted = [...rates].sort((a, b) => a - b)
  const median = sorted.length % 2
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
  const key = gradeFromRate(median)

  return {
    display: { key, ...GRADES[key] },
    grade: { key, ...GRADES[key] },
    referencePrice: null, referenceLabel: '', discountRate: median,
    comparePrices: [], customLine: null, exclusive: !!post.is_exclusive_deal,
    options, fromPrice,
    rateRange: { min: sorted[0], max: sorted[sorted.length - 1] },
  }
}

export function getDealVerdict(post: Post): DealVerdict {
  // 세트 옵션이 등록돼 있으면 그쪽이 정확하다 — 게시물 단위 비교가보다 우선한다.
  // 단 비교가가 하나라도 있을 때만이다. 수집기가 자동으로 채운 옵션은 가격만 있고
  // 비교가가 없는데, 그것만 보고 옵션 경로를 타면 origPrice·네이버 최저가로 잘 나오던
  // 판정이 옵션이 붙는 순간 "판정 대기"로 후퇴한다. 그럴 땐 아래 게시물 단위 비교를
  // 그대로 쓰고, 옵션은 구성 목록으로만 보여준다.
  const opts = (post.options || []).filter(o => o && o.price > 0)
  if (opts.some(o => o.comparePrice && o.comparePrice > 0)) return verdictFromOptions(post, opts)

  // 사람이 확인한 값과 자동으로 긁어온 값을 나눠 담는다 — 신뢰도가 다르기 때문이다
  const verified: ComparePrice[] = []
  const auto: ComparePrice[] = []

  for (const link of normalizePurchaseLinks(post)) {
    // 비슷한 용도의 다른 상품은 비교가가 아니다. 그 가격으로 할인율을 내면 화면에 틀린
    // 숫자가 나간다 — 판단 기준 1번이다
    if (!isSameProduct(link)) continue
    if (link.price && link.price > 0) {
      const name = link.platform === 'coupang' ? '쿠팡' : link.platform === 'naver' ? '네이버' : '다른 판매처'
      verified.push({ label: name, price: link.price, checkedAt: link.checked_at })
    }
  }
  if (post.origPrice && post.origPrice > 0) {
    verified.push({ label: '정가', price: post.origPrice })
  }
  // 라벨은 실제 출처를 따른다 — market_source가 없으면(옛 데이터) 네이버로 본다.
  // 틀린 출처를 보여주면 원칙 1 위반이다(예: 쿠팡에서 긁어온 값을 "네이버 최저가"로 표시)
  const autoLabel = post.market_source === 'coupang_partners' ? '쿠팡 최저가' : '네이버 최저가'
  const autoPlatformLabel = post.market_source === 'coupang_partners' ? '쿠팡' : '네이버'
  if (post.market_price && post.market_price > 0 && !verified.some(c => c.label === autoPlatformLabel)) {
    auto.push({ label: autoLabel, price: post.market_price })
  }

  // 믿기 어려운 자동 매칭은 기준에서도 화면에서도 뺀다. 관리자가 값을 고치면 다시 들어온다.
  const trustedAuto = auto.filter(c => !post.price || c.price >= post.price * AUTO_MATCH_FLOOR)

  // 판정은 게시물 단위로 하더라도 구성이 여러 개라는 사실은 알려줘야 한다.
  // 다만 fromPrice("N원부터")는 여기서 만들지 않는다 — 수집기가 자동으로 긁은 옵션에는
  // "[단품] 마우스피스 19,000원"처럼 본품이 아닌 부속품이 섞여 있어서, 최저가를 그대로
  // 쓰면 15만원짜리 치아미백기 공구가 "19,000원부터"로 보인다. 사람이 비교가까지
  // 확인한 옵션(verdictFromOptions 경로)일 때만 "N원부터"를 쓴다.
  const displayOptions: OptionVerdict[] = opts.map(o => ({ option: o, discountRate: null, saved: null }))
  const optionFromPrice = null

  // 기준가는 믿을 수 있는 값들 중 가장 싼 것 — 이래야 할인율을 부풀리지 않는다
  const candidates: ComparePrice[] = [...verified, ...trustedAuto]

  const exclusive = !!post.is_exclusive_deal

  // 여러 상품을 옵션별 가격으로 파는 공구는 비교 자체가 성립하지 않는다.
  // 비교가를 같이 보여주면 "이 가격끼리 비교했다"는 오해를 주므로 아예 비운다.
  if (isMultiOption(post)) {
    return {
      display: { key: 'multi', ...NON_GRADE_STATES.multi },
      grade: null, referencePrice: null, referenceLabel: '', discountRate: null,
      comparePrices: [], customLine: null, exclusive,
      options: displayOptions, fromPrice: optionFromPrice, rateRange: null,
    }
  }

  // 오픈 예정이거나 가격이 없으면 판정 대상이 아니다
  if (!post.price || getPeriodState(post).kind === 'upcoming') {
    return {
      display: { key: 'pending', ...NON_GRADE_STATES.pending },
      grade: null, referencePrice: null, referenceLabel: '', discountRate: null,
      comparePrices: candidates, customLine: null, exclusive,
      options: displayOptions, fromPrice: optionFromPrice, rateRange: null,
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
      options: displayOptions, fromPrice: optionFromPrice, rateRange: null,
    }
  }

  if (!cheapest) {
    const key = exclusive ? 'exclusive' : 'pending'
    return {
      display: { key, ...NON_GRADE_STATES[key] },
      grade: null, referencePrice: null, referenceLabel: '', discountRate: null,
      comparePrices: [], customLine: null, exclusive,
      options: displayOptions, fromPrice: optionFromPrice, rateRange: null,
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
    options: displayOptions, fromPrice: optionFromPrice, rateRange: null,
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
