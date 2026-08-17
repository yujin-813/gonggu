export type Category = 'kids' | 'life' | 'food' | 'health' | 'beauty'
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
   * 한 링크 안에서 서로 다른 상품을 옵션별로 다른 가격에 파는 공구(골라담기·모음전 등).
   * 이런 공구는 price가 최저가가 아니라 대표 가격이고, 가격 하나로 전체를 판정할 수 없다.
   * 값이 없으면 제목으로 자동 판단하고, true/false를 넣으면 그 값이 우선한다.
   */
  is_multi_option?: boolean
  // 관리자가 직접 고른 "이번 주 추천" — 날짜 규칙과 무관하게 홈 상단에 노출된다
  is_featured?: boolean
  featured_order?: number | null
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
