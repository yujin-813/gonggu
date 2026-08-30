import type { Post } from './types'
import { loadPosts } from './store'
import { isCustomerVisible, isExpired, isPagePublic } from './period'
import { toPublicPosts } from './publicPost'

// 브랜드 랜딩 페이지("스타우브 공구 가격비교") — post.brand로 묶는다. 제목 텍스트에
// 브랜드명이 있는지와 무관하게 이 필드만 본다. 상품 1건짜리 브랜드는 개별 상품 페이지와
// 다를 게 없어 비교 페이지로서 의미가 없고, 얇은 콘텐츠가 늘어나는 게 검색엔진에도
// 안 좋으므로 2건 이상만 페이지를 만든다.
const MIN_BRAND_POSTS = 2
const RECENT_ENDED_LIMIT = 10

export function brandPosts(brand: string): { active: Post[]; ended: Post[] } {
  const all = loadPosts().filter(p => p.brand === brand && isPagePublic(p))
  const active = toPublicPosts(all.filter(isCustomerVisible))
  const ended = toPublicPosts(
    all
      .filter(p => isExpired(p) && !isCustomerVisible(p))
      .sort((a, b) => (b.updated_at || b.scraped_at || '').localeCompare(a.updated_at || a.scraped_at || ''))
      .slice(0, RECENT_ENDED_LIMIT),
  )
  return { active, ended }
}

/** 사이트맵·라우팅이 같이 쓰는 목록 — 여기 없는 브랜드는 페이지도 없다(404) */
export function allBrands(): string[] {
  const posts = loadPosts().filter(isPagePublic)
  const counts = new Map<string, number>()
  for (const p of posts) {
    if (!p.brand) continue
    counts.set(p.brand, (counts.get(p.brand) || 0) + 1)
  }
  return [...counts.entries()].filter(([, n]) => n >= MIN_BRAND_POSTS).map(([b]) => b).sort()
}
