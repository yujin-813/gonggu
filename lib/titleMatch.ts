import type { Post } from './types'
import { cleanSearchQuery } from './searchQuery'

/**
 * 제목으로 "같은/비슷한 상품인가"를 재는 도구.
 *
 * 동일상품 후보 찾기(lib/compareCandidates.ts)와 비슷한 공구 추천(lib/relatedPosts.ts)이
 * 같은 판단을 한다. 각자 구현하면 한쪽만 고쳐져서 갈라진다.
 */

// 같은 목록을 반복해서 훑으므로 계산이 수십 번 겹친다. 게시물 객체는 화면이 다시 그려져도
// 같은 참조라 WeakMap 캐시가 그대로 먹는다.
const tokenCache = new WeakMap<Post, Set<string>>()

/**
 * 검색어 정리를 거친 뒤 남는 두 글자 이상 낱말들.
 *
 * 브랜드는 뺀다. 브랜드를 낱말에 섞어 두고 "브랜드가 같으면 문턱을 낮춘다"는 규칙을 함께
 * 쓰면, 브랜드 하나만 겹쳐도 같은 상품으로 잡히는 순환이 된다 — 실제로 같은 브랜드의
 * "밥 도자기"와 "소창행주"가 서로 후보로 붙었다.
 */
export function titleTokens(post: Pick<Post, 'title' | 'brand'>): Set<string> {
  const hit = tokenCache.get(post as Post)
  if (hit) return hit
  const out = new Set(cleanSearchQuery(post.title || '').toLowerCase().split(/\s+/).filter(w => w.length >= 2))
  for (const b of (post.brand || '').toLowerCase().split(/\s+/)) out.delete(b)
  tokenCache.set(post as Post, out)
  return out
}

/** 겹친 낱말 수와, 작은 쪽 대비 비율 */
export function titleOverlap(a: Set<string>, b: Set<string>): { hits: number; score: number } {
  if (!a.size || !b.size) return { hits: 0, score: 0 }
  let hits = 0
  for (const w of a) if (b.has(w)) hits++
  return { hits, score: hits / Math.min(a.size, b.size) }
}
