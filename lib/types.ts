export type Category = 'kids' | 'life' | 'food' | 'health' | 'beauty'

/**
 * 전용 페이지(/category/[cat])가 있는 카테고리.
 *
 * lib/landing은 fs를 읽어서 클라이언트 컴포넌트가 가져다 쓸 수 없다. 카테고리 버튼이
 * 링크가 되면서 이 목록이 양쪽 모두에 필요해졌기에, 의존성 없는 여기에 둔다.
 */
export const CATEGORY_KEYS: Category[] = ['kids', 'life', 'food', 'health', 'beauty']
export type SortOrder = 'latest' | 'deadline' | 'discount' | 'popular'
export type LinkSourceType = 'inpock' | 'linktree' | 'littly' | 'smartstore' | 'instagram' | 'custom' | 'unknown'

export interface InfluencerSource {
  id: string
  url: string
  source_type: LinkSourceType
  handle: string
  influencer_name: string
  instagram_handle?: string
  category?: string
  collection_status?: 'active' | 'paused' | 'failed' | 'never_collected'
  last_collected_at?: string | null
  memo?: string
  added_at: string
}

export interface Post {
  id: number
  shortcode?: string | null
  title: string
  account: string
  cat: Category
  price: number
  origPrice?: number | null
  deadline?: string
  img?: string | null
  start_date?: string
  url?: string
  participants: number
  comments?: number
  avatar?: string
  caption?: string
  scraped_at?: string
  brand?: string | null
  group_key?: string | null
  market_url?: string | null
  source?: 'manual' | 'scraper' | 'inpock' | 'influencer_request'
  status?: 'candidate' | 'needs_review' | 'ready' | 'published' | 'excluded' | 'upcoming'
  review_reason?: string[]
  published?: boolean
  source_type?: LinkSourceType
  source_url?: string | null
  influencer_name?: string | null
  influencer_handle?: string | null
  original_link?: string | null
  extracted_link?: string | null
  collection_status?: string | null
  collection_error?: string | null
  influencer_id?: string | null
  purchase_url?: string | null
  is_always_on?: boolean
  is_evergreen_deal?: boolean
  sale_until_sold_out?: boolean
  // 관리자가 "이 상품은 다른 곳에서 안 팔아요"라고 직접 확인해 표시하는 값 — 자동 가격
  // 비교(market_price/origPrice)가 없을 때, "정보 없음"이라는 담백한 안내 대신 "여기서만
  // 만나볼 수 있어요"라는 긍정적인 문구로 바꿔 보여주는 데 쓴다
  is_exclusive_deal?: boolean
  extraction_debug?: Record<string, unknown> | null
  market_price?: number | null
  market_source?: string | null
  // 자동 매칭된 네이버 가격이 이 공구와 구성이 달라(예: 세트 구성 차이) 단순 가격 비교가
  // 부정확할 수 있을 때 관리자가 남기는 짧은 참고 문구 — 자동 계산은 그대로 두고 판단 문구
  // 뒤에 덧붙여서 보여준다 (custom_verdict처럼 전체를 덮어쓰지 않음)
  market_price_note?: string | null
  // 관리자가 실제로 찾아본 뒤 "비교할 동일상품이 없다"고 확인한 흔적.
  //
  // 값이 없는 것(=아직 아무도 안 봄)과 사람이 확인한 것을 구분하지 못하면, 판정이 안 붙은
  // 공구가 전부 한 자리에 섞여서 같은 공구를 몇 번씩 다시 뒤지게 된다. 확인한 시점을
  // 남기는 것이 곧 "비교불가" 표시다 — 자세한 건 lib/compareState.ts.
  //
  // 고객 화면은 이 값을 쓰지 않는다. 검수 상태는 우리 사정이다(원칙 3).
  // 관리자가 "이 공구는 끝났다"고 직접 확인한 시각.
  //
  // 마감일을 모르는 채로 끝난 걸 알게 되는 경우가 있다(판매 페이지를 열어보고 안다).
  // 이때 오늘 날짜를 deadline에 넣으면 화면에 우리가 모르는 마감일이 적힌다. 종료 안내는
  // 마감일이 없어도 정상으로 뜨므로(EndedDealNotice가 deadline이 있을 때만 날짜를 쓴다),
  // 날짜를 지어내지 않고 "확인했다"는 사실만 남긴다.
  ended_at?: string | null
  compare_none_at?: string | null
  compare_none_reason?: CompareNoneReason | null
  compare_none_note?: string | null
  // 관리자가 자동 판단(dealJudgment) 대신 직접 입력한 구매 판단 문구 — 값이 있으면 이걸 우선 사용
  custom_verdict?: string | null
  custom_verdict_detail?: string | null
  custom_verdict_cls?: 'great' | 'good' | 'neutral' | 'check' | null
  // 이 상품이 속한 컬렉션 id 목록 — 컬렉션 소속 여부의 SSOT는 Collection.productIds 쪽이며,
  // 이 필드는 상품 쪽에서 역으로 조회하고 싶을 때를 위한 참고용(파생) 값이다.
  collectionIds?: string[]
  // 파트너스(제휴) 대체 구매 링크 — 공구 자체와는 별개로, 같은 상품을 네이버/쿠팡 파트너스
  // 링크로도 구매할 수 있을 때 참고용으로 보여주는 보조 정보. dealJudgment(공구 가격 판단)와는
  // 완전히 분리되어 있으며, partners_visible이 true고 platform/price/url이 모두 있을 때만
  // 고객 화면에 노출된다.
  partners_platform?: 'naver' | 'coupang' | null
  partners_price?: number | null
  partners_url?: string | null
  partners_option_note?: string | null
  partners_checked_at?: string | null
  partners_visible?: boolean
  // 위 partners_* 는 플랫폼을 하나만 담을 수 있어서 "쿠팡과 네이버 둘 다"를 표현하지 못한다.
  // 공구가 끝난 뒤 대체 구매처를 여러 곳 제시하려면 배열이어야 하므로 아래로 확장했다.
  // 기존 데이터는 lib/purchaseLinks.ts의 normalizePurchaseLinks()가 읽을 때 자동으로
  // 합쳐주므로 일괄 마이그레이션 없이 그대로 둔다.
  purchase_links?: PurchaseLink[]
  /**
   * 세트 옵션들. 비어 있으면 기존처럼 price/origPrice/market_price로 단일 판정한다 —
   * 옵션이 하나뿐인 공구가 대부분이라 전부 옮길 필요가 없다.
   */
  options?: DealOption[]
  /**
   * 한 링크 안에서 서로 다른 상품을 옵션별로 다른 가격에 파는 공구(골라담기·모음전 등).
   * 이런 공구는 price가 최저가가 아니라 대표 가격이고, 가격 하나로 전체를 판정할 수 없다.
   * 값이 없으면 제목으로 자동 판단하고, true/false를 넣으면 그 값이 우선한다.
   */
  is_multi_option?: boolean
  // 관리자가 직접 고른 "이번 주 추천" — 날짜 규칙과 무관하게 홈 상단에 노출된다
  is_featured?: boolean
  featured_order?: number | null
}

/**
 * 공구 하나에 들어 있는 세트 옵션.
 *
 * "공구 글 1개 = 상품 1개"로 보면 세트가 7~8개인 공구를 담을 수 없다. 게시물에 판매가
 * 하나·비교가 하나만 두면 어느 세트 기준인지 알 수 없고, 판정도 그 하나로만 나온다.
 * 비교가는 게시물이 아니라 세트마다 있어야 한다.
 */
export interface DealOption {
  /** 구성 — "위시 2개 + 칫솔 6개 + 치약 3개" */
  name: string
  /** 이 세트의 공구가 */
  price: number
  /** 같은 구성을 개별로 살 때 가격 */
  comparePrice?: number | null
  /** 사은품 — 가격 비교에는 안 넣고 표시만 한다 */
  gift?: string | null
}

/**
 * 비교할 동일상품이 없다고 판단한 이유.
 *
 * 자유 입력이 아니라 목록으로 받는 이유는, 나중에 세어 보면 다음에 뭘 자동화할지 알 수
 * 있기 때문이다 — '검색해도 안 나옴'이 많으면 검색 수단이 부족한 것이고, '같은 구성이
 * 없음'이 많으면 세트 단위 비교가 필요한 것이다.
 */
export type CompareNoneReason = 'exclusive' | 'no_same_set' | 'not_found' | 'other'

export const COMPARE_NONE_REASON_LABEL: Record<CompareNoneReason, string> = {
  exclusive:   '여기서만 판매하는 상품',
  no_same_set: '같은 구성이 없음 (세트가 다름)',
  not_found:   '검색해도 안 나옴',
  other:       '기타',
}

export type PurchasePlatform = 'naver' | 'coupang' | 'other'

/** 공구가 아닌 일반 판매처 링크. 공구 종료 후 "지금 바로 사고 싶은" 사용자를 위한 대체 경로. */
export interface PurchaseLink {
  platform: PurchasePlatform
  url: string
  /** 확인 당시 가격. 실시간 조회가 아니므로 화면에는 "확인 시점"과 함께 조심스럽게 쓴다 */
  price?: number | null
  /** 옵션이 공구와 달라 가격을 단순 비교하면 안 될 때 관리자가 남기는 참고 문구 */
  note?: string | null
  checked_at?: string | null
  /** 고객 화면 노출 여부 — 확인이 끝난 링크만 켠다 */
  visible?: boolean
}

export interface Collection {
  id: string
  title: string
  description: string
  emoji: string
  color: string
  productIds: number[]
  expiresAt?: string | null
  createdAt: string
}

export interface ScraperStatus {
  running: boolean
  last_run?: string | null
  last_count: number
  skipped_count?: number   // 인포크 수집 시 비공구로 제외된 수
  closed_count?: number    // 인포크 수집 시 자동 숨김된 마감 공구 수
  error?: string | null
}

export interface PostsResponse {
  posts: Post[]
  total: number
  page: number
  per_page: number
  pages: number
}
