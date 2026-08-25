import type { Post, PurchaseLink, PurchasePlatform, PurchaseLinkRelation } from './types'
import { RELATION_DEFAULT_REASON } from './types'

// 대체 구매 링크(공구가 아닌 일반 판매처)를 다루는 곳. 화면·API 어디서든 여기만 거쳐서
// 읽는다 — 예전 단일 필드(partners_*)와 새 배열(purchase_links)이 섞여 있어도
// 호출하는 쪽은 배열 하나만 보면 되게 하기 위함이다.

export const PLATFORM_LABEL: Record<PurchasePlatform, string> = {
  naver: '네이버',
  coupang: '쿠팡',
  other: '판매처',
}

// 공정거래위원회 지침상 경제적 대가를 받는 추천 관계는 반드시 고지해야 한다.
// 쿠팡 파트너스는 운영정책에 명시된 지정 문구를 그대로 써야 한다.
export const PLATFORM_DISCLOSURE: Record<PurchasePlatform, string> = {
  coupang: '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.',
  naver: '이 포스팅은 네이버 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.',
  other: '이 링크를 통한 구매 시 일정액의 수수료를 제공받을 수 있습니다.',
}

/**
 * 상품의 대체 구매 링크를 배열 하나로 정리한다.
 * 예전 partners_* 단일 필드도 함께 읽어 넣되, 같은 플랫폼이 purchase_links에 이미 있으면
 * 새 값을 우선한다 — 관리자가 새 UI로 고친 내용이 옛 필드에 덮이면 안 되기 때문이다.
 */
export function normalizePurchaseLinks(post: Pick<Post,
  'purchase_links' | 'partners_platform' | 'partners_price' | 'partners_url'
  | 'partners_option_note' | 'partners_checked_at' | 'partners_visible'
>): PurchaseLink[] {
  // url 없이 가격만 있는 항목도 남긴다 — 관리자가 '판정 채우기'에서 가격만 넣는 경우가 있고,
  // 그 값은 링크로 띄우진 않아도 판정 기준으로는 써야 한다.
  // (링크로 노출할지는 visiblePurchaseLinks가 url 유무로 따로 판단한다)
  const links: PurchaseLink[] = [...(post.purchase_links || [])].filter(l => l && (l.url || l.price))

  if (post.partners_platform && (post.partners_url || post.partners_price)) {
    const already = links.some(l => l.platform === post.partners_platform)
    if (!already) {
      links.push({
        platform: post.partners_platform,
        url: post.partners_url || '',
        price: post.partners_price ?? null,
        note: post.partners_option_note ?? null,
        checked_at: post.partners_checked_at ?? null,
        visible: post.partners_visible !== false,
      })
    }
  }
  return links
}

/**
 * 플랫폼별 제휴 링크 도메인.
 *
 * 이 자리에는 "쿠팡 파트너스 활동의 일환으로 수수료를 제공받습니다" 고지가 항상 따라붙는다.
 * 제휴 링크가 아닌 걸 넣으면 그 고지가 거짓말이 된다(D-003). 그래서 고객 화면에 띄우기 전에
 * 도메인으로 한 번 더 확인한다 — 실제로 url 자리에 상품명이 그대로 들어간 건이 2건 있었다
 * ("앱솔리 또또뻥 호라산밀 앤 파로 뻥튀기, 5개, 95g"). 파트너스에서 복사할 때 링크 대신
 * 상품명이 붙여넣어진 것으로 보인다.
 *
 * ⚠️ 네이버·기타는 제휴 링크 도메인을 아직 확인하지 못했다. 그래서 유효한 URL인지까지만
 * 본다. 현재 데이터에는 쿠팡 링크뿐이라(21건 전부 link.coupang.com) 지금은 영향이 없다.
 */
const AFFILIATE_HOSTS: Record<PurchasePlatform, RegExp | null> = {
  coupang: /^(link\.coupang\.com|coupa\.ng)$/,
  naver: null,
  other: null,
}

/** 고객 화면에 띄워도 되는 링크인지 — 유효한 주소이고, 아는 제휴 도메인이면 */
export function isAffiliateLink(link: Pick<PurchaseLink, 'platform' | 'url'>): boolean {
  if (!link.url) return false
  let host: string
  try { host = new URL(link.url).hostname.toLowerCase() } catch { return false }
  const pattern = AFFILIATE_HOSTS[link.platform]
  return pattern ? pattern.test(host) : true
}

/** 같은 상품인 링크인지 — kind가 없는 옛 데이터는 전부 같은 상품이다 */
export function isSameProduct(link: Pick<PurchaseLink, 'kind'>): boolean {
  return (link.kind ?? 'same') === 'same'
}

/**
 * 판정과 "지금 살 수 있어요"에 쓸 수 있는 링크 — **같은 상품만**.
 *
 * 다른 상품을 섞으면 두 가지가 깨진다. 하나는 판정(다른 상품 가격으로 할인율을 내면 틀린
 * 숫자다), 하나는 문구("공구는 끝났지만 지금 살 수 있어요"가 거짓이 된다).
 */
export function sameProductLinks(post: Parameters<typeof normalizePurchaseLinks>[0]): PurchaseLink[] {
  return visiblePurchaseLinks(post).filter(isSameProduct)
}

/** 비슷한 용도의 다른 상품 — 권할 수는 있어도 판정 근거로는 절대 못 쓴다 */
export function alternativeLinks(post: Parameters<typeof normalizePurchaseLinks>[0]): PurchaseLink[] {
  return visiblePurchaseLinks(post).filter(l => !isSameProduct(l))
}

/** 링크의 relation — 없는 옛 데이터는 kind로 추정한다(same이면 same, 아니면 similar) */
export function linkRelation(link: Pick<PurchaseLink, 'kind' | 'relation'>): PurchaseLinkRelation {
  return link.relation ?? (isSameProduct(link) ? 'same' : 'similar')
}

/** 고객 화면에 보여줄 "왜 이 상품인지" 문구 — 관리자가 직접 쓴 게 있으면 그걸, 없으면
 * relation 기본 문구를 쓴다. note(관리자 메모)는 절대 여기 안 섞는다 — 고객 노출 금지 */
export function linkReason(link: Pick<PurchaseLink, 'kind' | 'relation' | 'reason'>): string {
  return link.reason?.trim() || RELATION_DEFAULT_REASON[linkRelation(link)]
}

/** 고객 화면에 실제로 띄울 링크만 — 관리자가 확인해 켠 것 중, 진짜 제휴 링크만 */
export function visiblePurchaseLinks(post: Parameters<typeof normalizePurchaseLinks>[0]): PurchaseLink[] {
  return normalizePurchaseLinks(post).filter(l => l.visible !== false && isAffiliateLink(l))
}

/**
 * 값은 들어 있는데 고객에게 못 띄우는 링크 — 관리자에게 "고쳐야 한다"고 알리는 데 쓴다.
 * 가격만 넣은 비교용 항목(url 없음)은 정상이므로 제외한다.
 */
export function brokenPurchaseLinks(post: Parameters<typeof normalizePurchaseLinks>[0]): PurchaseLink[] {
  return normalizePurchaseLinks(post).filter(l => !!l.url && !isAffiliateLink(l))
}

/**
 * 공구가 끝났을 때 "이 상품을" 살 수 있는 곳이 있는지 — 관리자 필터와 홈 하단 영역에서 쓴다.
 *
 * 다른 상품 링크는 세지 않는다. "공구는 끝났지만 지금 살 수 있어요"에 다른 상품이 뜨면
 * 그 문장이 거짓이 된다.
 */
export function hasPurchaseLink(post: Parameters<typeof normalizePurchaseLinks>[0]): boolean {
  return sameProductLinks(post).length > 0
}
