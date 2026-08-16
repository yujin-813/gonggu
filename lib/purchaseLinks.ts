import type { Post, PurchaseLink, PurchasePlatform } from './types'

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

/** 고객 화면에 실제로 띄울 링크만 — 관리자가 확인해 켠 것으로 한정한다 */
export function visiblePurchaseLinks(post: Parameters<typeof normalizePurchaseLinks>[0]): PurchaseLink[] {
  return normalizePurchaseLinks(post).filter(l => l.visible !== false && !!l.url)
}

/** 공구가 끝났을 때 보여줄 대체 구매처가 하나라도 있는지 — 관리자 필터와 홈 하단 영역에서 쓴다 */
export function hasPurchaseLink(post: Parameters<typeof normalizePurchaseLinks>[0]): boolean {
  return visiblePurchaseLinks(post).length > 0
}
