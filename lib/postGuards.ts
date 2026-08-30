import type { Post } from './types'

const NO_PURCHASE_LINK_REASON = '구매 링크 없음'

// 구매 링크(purchase_url)가 없는 상품은 절대 공개 가능 상태로 저장되지 않게 막는다 —
// 고객이 "공구 보기"를 눌렀을 때 쇼핑몰이 아니라 인스타 게시글이 뜨면 신뢰를 잃으므로,
// ready/published로 저장되려는 순간 자동으로 검수 대기(needs_review)로 되돌린다.
// 관리자 수동 등록/수정, 빠른 승인, 인플루언서 제보 폼까지 모든 쓰기가 이 두 API
// (app/api/posts, app/api/posts/[id])를 거치므로 여기 한 곳에서만 강제하면 전부 커버된다.
// (inpock.py 등 파이썬 수집기는 자체 classify_status()에서 이미 같은 규칙을 적용 중)
export function enforcePurchaseLinkRequirement(post: Post): Post {
  const needsLink = post.status === 'ready' || post.status === 'published'
  if (!needsLink || post.purchase_url) return post
  const reasons = post.review_reason || []
  return {
    ...post,
    status: 'needs_review',
    published: false,
    review_reason: reasons.includes(NO_PURCHASE_LINK_REASON) ? reasons : [...reasons, NO_PURCHASE_LINK_REASON],
  }
}

// check_links.py가 스스로 붙이고 스스로 지우는 태그 — 여기서는 건드리지 않는다.
// (품절·링크만료는 재확인해서 풀리면 파이썬이 직접 지운다)
const SELF_MANAGED_REASONS = [
  '품절 감지 (자동 숨김 · 재입고 시 자동 복구)',
  '구매링크 확인 필요',
  '구매링크 만료됨 (자동 비공개)',
]

// 나머지 review_reason은 수집기가 "사람이 한 번 봐야 한다"는 뜻으로 수집 시점에 붙인
// 안내문이다. 지금 값 기준으로 다시 확인해서 여전히 맞으면 남기고, 아니면 지운다 — 필드로
// 다시 확인할 수 없는 것(추출 데이터 확인 필요·비공구 등 1회성 판단)은, ready/published로
// 넘어갔다는 것 자체가 이미 사람이 확인했다는 뜻이라 무조건 지운다.
const STILL_TRUE: Record<string, (post: Post) => boolean> = {
  '가격 미입력': post => !post.price,
  '마감일 미확인': post => !post.deadline && !post.sale_until_sold_out && !post.is_evergreen_deal && !post.is_always_on,
  '구매페이지 미확인': post => !post.purchase_url,
  '구매 링크 없음': post => !post.purchase_url,
  '이미지 다운로드 실패': post => !post.img,
}

// ready/published로 넘긴 뒤에도 수집 시점 안내문이 그대로 남아, 이미 값을 채워 넣은
// 공구에 "가격 미입력" 같은 빨간 배지가 계속 떠 있는 문제가 있었다(관리자 화면 209건).
export function reconcileReviewReasons(post: Post): Post {
  if (post.status !== 'published' && post.status !== 'ready') return post
  const reasons = post.review_reason || []
  if (reasons.length === 0) return post
  const next = reasons.filter(r => SELF_MANAGED_REASONS.includes(r) || (STILL_TRUE[r]?.(post) ?? false))
  return next.length === reasons.length ? post : { ...post, review_reason: next }
}

/**
 * 세트 옵션이 있으면 게시물의 price를 가장 싼 옵션 가격에 맞춘다.
 *
 * 카드·상세는 옵션에서 "N원부터"를 계산해 보여주지만, 공유 문구·공유 카드 이미지·
 * 종료 페이지의 "당시 공구가"·할인율 정렬은 여전히 post.price를 본다. 둘이 어긋나면
 * 같은 상품이 화면마다 다른 가격으로 보인다. 저장 시점에 한 번 맞춰 둔다.
 */
export function syncPriceWithOptions(post: Post): Post {
  const prices = (post.options || []).map(o => o.price).filter(n => n > 0)
  if (!prices.length) return post
  const min = Math.min(...prices)
  return post.price === min ? post : { ...post, price: min }
}
