import type { Post } from './types'
import { getDealVerdict, AUTO_MATCH_FLOOR, isMultiOption } from './dealGrade'
import { titleTokens, titleOverlap } from './titleMatch'

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
  /** sibling 후보(같은 상품으로 보이는 다른 공구)일 때만 채워지는 상대 공구 id.
   * 이 값이 있어야 "같은 상품으로 묶기"(group_key 연결)를 할 수 있다 — storedMarketPrice
   * 같은 다른 provider는 공구가 아니라 값 하나를 주는 것뿐이라 묶을 대상이 없다. */
  otherPostId?: number
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
    // 여러 상품을 파는 공구(isMultiOption)는 getDealVerdict가 market_price를 아예 안 본다
    // (대표가 하나로 여러 상품을 판정할 수 없어서다). 그런데도 "이미 판정에 쓰이는 값"이라고
    // 하면 화면 위쪽 경고("판정이 안 붙어요")와 정반대 말을 하는 셈이라 사장님이 실제로
    // 헷갈렸다 — multi일 땐 절대 trusted로 두지 않는다.
    const multi = isMultiOption(post)
    const trusted = !multi && (!post.price || price >= post.price * AUTO_MATCH_FLOOR)
    const ratio = post.price ? Math.round((price / post.price) * 100) : null
    return [{
      providerId: 'market',
      label: '네이버 최저가 (수집해 둔 값)',
      price,
      url: post.market_url,
      note: multi
        ? '여러 상품을 파는 공구라 이 값은 판정에 안 쓰여요 — 비교불가로 남기면 돼요'
        : trusted
          ? '이미 판정에 쓰이는 값이에요'
          : `공구가의 ${ratio}%라 다른 상품이 잡혔을 수 있어서 지금은 판정에서 빠져 있어요`,
      confidence: trusted ? 'medium' : 'low',
    }]
  },
}

// 참조 비교 캐시 — 후보 계산이 행마다 전체 목록을 훑는다
const refPriceCache = new WeakMap<Post, number | null>()

function referencePriceOf(post: Post): number | null {
  const hit = refPriceCache.get(post)
  if (hit !== undefined) return hit
  const v = getDealVerdict(post).referencePrice
  refPriceCache.set(post, v)
  return v
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

      const { hits, score } = titleOverlap(mine, titleTokens(other))
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
          // market_url(네이버쇼핑 등 외부 근거)은 비어 있는 경우가 많아서 "열기"가 아예 안
          // 뜨는 후보가 흔했다 — 판단에 진짜 필요한 건 어차피 우리 공구 상세(제목·이미지·
          // 옵션)라, 우리 사이트 자체 링크로 바꾼다. 이건 항상 있다
          url: `/post/${other.id}`,
          note: '구성이 다를 수 있으니 상품을 확인하고 골라주세요',
          confidence: 'low',
          otherPostId: other.id,
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
  // 가격 숫자만으로 중복 제거하면(예전 방식) 서로 다른 후보가 우연히 같은 가격이면
  // 뒤엣것이 통째로 사라졌다 — 한국 소매가가 9900/19900처럼 흔한 값에 몰려 있어 실제로
  // 일어날 수 있다. sibling 후보는 otherPostId가 있어야 "같은 상품으로 묶기"를 할 수
  // 있으므로, 이게 조용히 사라지면 그 기능 자체를 못 쓴다. provider·출처로 구분한다.
  const seen = new Set<string>()
  return results
    .flat()
    .filter(c => {
      const key = `${c.providerId}:${c.otherPostId ?? c.url ?? c.price}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => {
      if (a.confidence !== b.confidence) return a.confidence === 'medium' ? -1 : 1
      return a.price - b.price
    })
}
