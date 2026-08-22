import type { Post } from './types'

/**
 * 인플루언서 페이지가 실제로 보여주는 상품 목록.
 *
 * 이 페이지는 "이 사람이 올린 것"을 보여주는 자리라 공구 판정과 무관하다 — 마감된 것도,
 * 공구로 분류 안 된 것도 다 나온다. 화면에 못 띄우는 것(이미지·가격·링크가 없는 것)만 뺀다.
 *
 * **왜 따로 뺐나** — 이 규칙이 API 라우트에만 있어서, 페이지의 메타데이터와 JSON-LD는
 * isCustomerVisible 기준으로 따로 세고 있었다. 그 결과 화면에는 20건이 떠 있는데 검색엔진에
 * 나가는 ItemList는 0건, 설명은 "공동구매 0건"인 계정이 74개 중 35개였다(2026-08-23).
 * 한 곳에서만 정하고 양쪽이 같이 읽는다.
 */
export function influencerItems(posts: Post[], account: string): Post[] {
  const normalized = account.startsWith('@') ? account : `@${account}`
  return posts
    .filter(p =>
      (p.account || '').toLowerCase() === normalized.toLowerCase() &&
      !!p.price &&
      !!(p.purchase_url || p.url) &&
      !!p.img &&
      !(p.review_reason || []).includes('이미지 다운로드 실패'),
    )
    .sort((a, b) => (b.scraped_at || '').localeCompare(a.scraped_at || ''))
}

/**
 * 화면에 쓸 이름.
 *
 * `influencer_name`이 비어 있으면 핸들을 쓴다. 지금은 58개 소스 전부 핸들이 그대로 들어 있어
 * "bobpro__ 공구" 같은 제목이 나간다 — 한국 사용자가 그렇게 검색하지 않는다. 관리자가 한글
 * 활동명을 넣으면 제목·설명이 바로 바뀐다.
 */
export function influencerName(posts: Post[], account: string): string {
  const normalized = account.startsWith('@') ? account : `@${account}`
  const first = posts.find(p => (p.account || '').toLowerCase() === normalized.toLowerCase())
  return first?.influencer_name || normalized.replace('@', '')
}

/** 이름이 아직 한글 활동명으로 안 채워진 상태인지 — 관리자 목록에서 채울 대상을 고르는 데 쓴다 */
export function needsKoreanName(name?: string | null): boolean {
  return !/[가-힣]/.test(name || '')
}
