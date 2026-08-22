import type { Post } from './types'
import { isCustomerVisible, isPagePublic, isExpired } from './period'
import { hasPurchaseLink } from './purchaseLinks'
import { titleTokens, titleOverlap } from './titleMatch'

/**
 * 마감된 공구 페이지에서 "그럼 뭘 보면 되나"를 채우는 목록.
 *
 * 예전에는 같은 카테고리에서 최신순으로 6개를 뽑아 "현재 진행 중인 비슷한 공구"라고 붙였다.
 * 그런데 카테고리는 인플루언서 성격을 따라가는 경우가 많아서, "무항생제 아기 한우 곰탕"이
 * kids로 분류되고 그 페이지에 세이펜·그림책·성교육동화가 떴다. 곰탕을 찾아온 사람에게
 * 학습교구 6개를 보여주면서 "비슷한 공구"라고 부른 셈이다.
 *
 * 그래서 두 가지를 바꿨다.
 *
 * 1. 관련도에 순위를 둔다 — 제목 낱말 겹침 > 같은 브랜드 > 같은 인플루언서 > 같은 카테고리.
 * 2. **가장 높은 등급 하나만 보여주고 섞지 않는다.** 그리고 화면 제목을 그 등급에 맞춰
 *    바꾼다. 같은 인플루언서라는 이유로 "이런 건 어때요?"라고 하면 학습교구를 찾던 사람에게
 *    감자빵을 권하면서 비슷하다고 말하는 셈이 된다 — 확신이 없으면 말하지 않는다(원칙 2).
 *
 * 후보에는 진행 중 공구뿐 아니라 **마감됐지만 지금 살 수 있는 공구**도 넣는다. 관련도가
 * 같다면 실제로 살 수 있는 쪽이 고객에게 쓸모 있고, 우리 수익과도 맞는다.
 */
export type RelatedKind = 'similar' | 'influencer' | 'category'

export interface RelatedResult {
  posts: Post[]
  kind: RelatedKind
}

export function relatedPosts(post: Post, all: Post[], limit = 6): RelatedResult {
  const pool = all.filter(p =>
    p.id !== post.id &&
    // 진행 중이거나, 마감됐어도 살 곳이 확인된 공구
    (isCustomerVisible(p) || (isPagePublic(p) && isExpired(p) && hasPurchaseLink(p))),
  )

  const mine = titleTokens(post)
  const brand = (post.brand || '').trim().toLowerCase()
  const account = (post.account || '').toLowerCase()

  const scored = pool
    .map(p => {
      const { hits } = titleOverlap(mine, titleTokens(p))
      const sameBrand = !!brand && (p.brand || '').trim().toLowerCase() === brand
      const sameAccount = !!account && (p.account || '').toLowerCase() === account
      const tier = hits >= 1 ? 1 : sameBrand ? 2 : sameAccount ? 3 : p.cat === post.cat ? 4 : 5
      return { p, tier, hits, buyable: hasPurchaseLink(p) }
    })
    .filter(s => s.tier <= 4)

  // 등급을 섞지 않는다 — 가장 관련 있는 묶음 하나만 쓴다
  const similar = scored.filter(s => s.tier <= 2)
  const byInfluencer = scored.filter(s => s.tier === 3)
  const chosen = similar.length ? similar : byInfluencer.length ? byInfluencer : scored

  chosen.sort((a, b) =>
    a.tier - b.tier ||
    b.hits - a.hits ||
    // 관련도가 같으면 지금 살 수 있는 쪽을 앞에
    Number(b.buyable) - Number(a.buyable) ||
    (b.p.scraped_at || '').localeCompare(a.p.scraped_at || ''),
  )

  return {
    posts: chosen.slice(0, limit).map(s => s.p),
    kind: similar.length ? 'similar' : byInfluencer.length ? 'influencer' : 'category',
  }
}
