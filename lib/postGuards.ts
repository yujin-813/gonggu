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
