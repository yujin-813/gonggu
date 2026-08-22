import type { Post } from './types'
import { getDealVerdict, AUTO_MATCH_FLOOR } from './dealGrade'
import { cleanSearchQuery } from './searchQuery'

/**
 * 동일상품 후보 찾기.
 *
 * 관리자가 "이 공구를 어디랑 비교하지"를 매번 맨손으로 검색하는 대신, 우리가 이미 아는
 * 정보에서 후보를 먼저 내밀고 고르게 한다. 고르면 그 가격이 비교가가 된다.
 *
 * **왜 provider로 나눴나** — 지금은 외부에서 가격을 긁어올 수단이 없다. 네이버 쇼핑 API는
 * 폐지됐고(D-019), 네이버·쿠팡·지마켓 웹은 하드 차단이다. 그래서 이번에는 "이미 우리 안에
 * 있는 값"만 후보로 낸다. 나중에 쿠팡 파트너스 API나 검색 서비스, AI 검색이 붙을 자리를
 * 지금 만들어 두고, 그때는 PROVIDERS에 하나 더 넣기만 하면 되게 한다.
 *
 * find()가 async인 것도 그래서다 — 지금 두 provider는 동기지만, 외부를 부르는 provider가
 * 인터페이스를 바꾸지 않고 들어올 수 있어야 한다.
 *
 * 이 모듈은 fs를 읽지 않는다. 관리자 화면이 이미 전체 목록을 들고 있으므로 거기서 그대로
 * 돌린다 — 새 API를 만들면 middleware 양쪽에 등록해야 하는 표면이 늘어난다.
 */
export interface CompareCandidate {
  providerId: string
  /** 화면에 그대로 뜨는 이름 */
  label: string
  price: number
  url?: string | null
  /** 왜 믿을 만한지 / 왜 의심스러운지 — 관리자가 고르기 전에 읽는다 */
  note?: string | null
  confidence: 'medium' | 'low'
}

export interface CandidateContext {
  post: Post
  /** 관리자 화면이 이미 들고 있는 전체 목록. 외부를 부르는 provider는 안 쓴다 */
  allPosts: Post[]
  signal?: AbortSignal
}

export interface CandidateProvider {
  id: string
  label: string
  find(ctx: CandidateContext): Promise<CompareCandidate[]>
}

/**
 * 과거 네이버 쇼핑 API로 모아 둔 값(market_price 711건).
 *
 * AUTO_MATCH_FLOOR에 걸려 판정에서 빠진 값도 후보로는 낸다. 지금은 그냥 버려지는데,
 * 기계가 못 믿을 값이라고 사람도 못 볼 이유는 없다 — 보고 맞으면 채택하면 된다.
 */
const storedMarketPrice: CandidateProvider = {
  id: 'market',
  label: '수집해 둔 네이버 최저가',
  async find({ post }) {
    const price = post.market_price
    if (!price || price <= 0) return []
    // 공구가의 20%도 안 되는 값은 사람이 봐도 다른 상품이다(27,500원 감자빵에 70원).
    // AUTO_MATCH_FLOOR(50%)와 이 선 사이가 "기계는 못 믿지만 사람은 볼 만한" 구간이고,
    // 그 아래는 후보가 아니라 소음이라 모든 행에 붙어 다니기만 한다.
    if (post.price && price < post.price * 0.2) return []
    const trusted = !post.price || price >= post.price * AUTO_MATCH_FLOOR
    const ratio = post.price ? Math.round((price / post.price) * 100) : null
    return [{
      providerId: 'market',
      label: '네이버 최저가 (수집해 둔 값)',
      price,
      url: post.market_url,
      note: trusted
        ? '이미 판정에 쓰이는 값이에요'
        : `공구가의 ${ratio}%라 다른 상품이 잡혔을 수 있어서 지금은 판정에서 빠져 있어요`,
      confidence: trusted ? 'medium' : 'low',
    }]
  },
}

// 후보는 판정 대기 행마다 전체 목록을 훑으므로 같은 계산이 수십 번 반복된다.
// 게시물 객체는 화면이 다시 그려져도 같은 참조라 WeakMap으로 캐시가 그대로 먹는다.
const tokenCache = new WeakMap<Post, Set<string>>()
const refPriceCache = new WeakMap<Post, number | null>()

/**
 * 검색어 정리를 거친 뒤 남는 두 글자 이상 낱말들 — 제목 비교용.
 *
 * 브랜드는 여기서 **뺀다.** 브랜드를 낱말에 섞어 두고 "브랜드가 같으면 문턱을 낮춘다"는
 * 규칙을 함께 쓰면, 브랜드 하나만 겹쳐도 같은 상품으로 잡히는 순환이 된다. 실제로 같은
 * 브랜드의 "밥 도자기"와 "소창행주"가 서로 후보로 붙었다.
 */
function titleTokens(post: Post): Set<string> {
  const hit = tokenCache.get(post)
  if (hit) return hit
  const out = new Set(cleanSearchQuery(post.title || '').toLowerCase().split(/\s+/).filter(w => w.length >= 2))
  for (const b of (post.brand || '').toLowerCase().split(/\s+/)) out.delete(b)
  tokenCache.set(post, out)
  return out
}

function referencePriceOf(post: Post): number | null {
  const hit = refPriceCache.get(post)
  if (hit !== undefined) return hit
  const v = getDealVerdict(post).referencePrice
  refPriceCache.set(post, v)
  return v
}

function overlap(a: Set<string>, b: Set<string>): { hits: number; score: number } {
  if (!a.size || !b.size) return { hits: 0, score: 0 }
  let hits = 0
  for (const w of a) if (b.has(w)) hits++
  return { hits, score: hits / Math.min(a.size, b.size) }
}

/**
 * 같은 상품으로 보이는 다른 공구가 이미 비교가를 갖고 있으면 그 값을 후보로 낸다.
 *
 * 같은 상품이 여러 인플루언서를 거쳐 반복해서 올라오므로(2,317건 중 상당수), 한 번 채운
 * 비교가가 다음 공구에서 다시 쓰인다. 다만 구성이 다를 수 있어 신뢰도는 낮게 잡는다.
 */
const siblingDeals: CandidateProvider = {
  id: 'sibling',
  label: '같은 상품으로 보이는 다른 공구',
  async find({ post, allPosts }) {
    const mine = titleTokens(post)
    if (!mine.size) return []
    const brand = (post.brand || '').trim().toLowerCase()

    const scored: { score: number; cand: CompareCandidate }[] = []
    for (const other of allPosts) {
      if (other.id === post.id) continue
      const ref = referencePriceOf(other)
      if (ref === null || ref <= 0) continue

      const { hits, score } = overlap(mine, titleTokens(other))
      const sameBrand = !!brand && (other.brand || '').trim().toLowerCase() === brand
      // 낱말 하나만 겹치는 건 "세트"·"기획" 같은 흔한 말일 때가 많아 그것만으로는 안 본다.
      // 브랜드가 같으면 문턱을 낮추되, 브랜드 말고 실제 상품명이 최소 하나는 겹쳐야 한다 —
      // 잘못 고른 후보는 그대로 틀린 비교가가 되고, 그건 이 제품이 제일 하면 안 되는 일이다.
      const strong = hits >= 2 || (hits >= 1 && score >= 0.6)
      const brandBacked = sameBrand && hits >= 1 && score >= 0.34
      if (!strong && !brandBacked) continue

      scored.push({
        score,
        cand: {
          providerId: 'sibling',
          label: `다른 공구 "${(other.title || '').slice(0, 30)}"의 비교가`,
          price: ref,
          url: other.market_url || null,
          note: '구성이 다를 수 있으니 상품을 확인하고 골라주세요',
          confidence: 'low',
        },
      })
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, 3).map(s => s.cand)
  },
}

const PROVIDERS: CandidateProvider[] = [storedMarketPrice, siblingDeals]

export async function findCompareCandidates(ctx: CandidateContext): Promise<CompareCandidate[]> {
  // provider 하나가 실패해도 나머지 후보는 보여준다 — 외부를 부르는 provider가 붙으면
  // 타임아웃·차단으로 실패하는 게 정상 동작이 된다
  const results = await Promise.all(
    PROVIDERS.map(p => p.find(ctx).catch(() => [] as CompareCandidate[])),
  )
  const seen = new Set<number>()
  return results
    .flat()
    .filter(c => {
      if (seen.has(c.price)) return false
      seen.add(c.price)
      return true
    })
    .sort((a, b) => {
      if (a.confidence !== b.confidence) return a.confidence === 'medium' ? -1 : 1
      return a.price - b.price
    })
}
