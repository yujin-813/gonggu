import type { Post, PurchaseLink } from './types'

/**
 * purchase_links 배열만 따로 다룰 때(예: /post/[id]가 visiblePurchaseLinks 결과를 그대로
 * 넘길 때) 관리자 전용 값을 떼어낸다.
 *
 * adminMemo는 항상 뗀다. note는 kind==='same'일 때만 남긴다 — 동일 상품 링크의 note는
 * "2개입 기준" 같은 옵션 참고사항으로 원래도 고객 노출이 맞다. 하지만 D-043 이전에
 * 만들어진 대체 상품 링크는 adminMemo가 따로 없어서 "브랜드가 달라요" 같은 내부 판단이
 * note 자리에 그대로 들어있다 — kind==='alternative'인 링크는 note도 함께 뗀다
 * (EndedDealNotice도 alt 링크는 이제 note를 안 읽고 reason만 읽으므로 기능은 그대로다).
 */
export function stripAdminMemo(links: PurchaseLink[]): PurchaseLink[] {
  return links.map(l => {
    const { adminMemo, ...rest } = l
    if ((l.kind ?? 'same') !== 'same') delete rest.note
    return rest
  })
}

// 고객 화면(클라이언트 컴포넌트)에 넘기는 Post에서 관리자 전용 필드를 걷어낸다.
//
// Next.js는 서버 컴포넌트가 클라이언트 컴포넌트에 넘기는 props를 페이지 소스(RSC payload)에
// 그대로 직렬화한다 — 화면에 안 그려도 "보기 소스"로 다 보인다. 대체 상품 관리자 메모
// ("브랜드가 달라요" 같은 내부 판단)가 화면엔 안 보이면서 소스에는 남아있던 게 바로 이
// 경로였다. 검수 사유·비교불가 메모·수집 파이프라인 내부값도 같은 문제라 함께 걷어낸다.
//
// 어떤 필드를 남길지 하나씩 정하는(allowlist) 대신 뺄 것만 정한다(denylist) — Post 필드가
// 많고 대부분 판정 계산에 실제로 쓰이기 때문이다(getPeriodState·getDealVerdict가 클라이언트
// 컴포넌트 안에서도 돈다). 새 관리자 전용 필드를 추가하면 여기도 같이 추가해야 한다.
const INTERNAL_FIELDS = [
  'review_reason',
  'source_type', 'source_url', 'original_link', 'extracted_link',
  'collection_status', 'collection_error', 'influencer_id',
  'compare_none_at', 'compare_none_reason', 'compare_none_note',
  'partners_checked_at', 'partners_platform', 'partners_price', 'partners_url', 'partners_option_note', 'partners_visible',
  'market_price_note',
  'collectionIds',
] as const satisfies readonly (keyof Post)[]

export function toPublicPost(post: Post): Post {
  const clone: Post = { ...post }
  for (const f of INTERNAL_FIELDS) delete clone[f]

  // extraction_debug 전체(원문 조각·후보값들)는 우리 사정이지만, PostCard의 "가격·마감일
  // 확인된 정보예요" 배지가 extraction_confidence 하나만 본다 — 그것만 남긴다
  const confidence = (post.extraction_debug as Record<string, unknown> | null | undefined)?.extraction_confidence
  clone.extraction_debug = confidence ? { extraction_confidence: confidence } : null

  if (clone.purchase_links) clone.purchase_links = stripAdminMemo(clone.purchase_links)

  return clone
}

export function toPublicPosts(posts: Post[]): Post[] {
  return posts.map(toPublicPost)
}
