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
  /** 가격·마감상태·공개 여부가 실제로 바뀐 시각. scraped_at은 수집기가 훑은 시각이라
   * 관리자가 직접 고친 건 안 잡힌다 — sitemap lastmod·IndexNow 통보에 이 값을 쓴다 */
  updated_at?: string
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
  // 인플루언서 확산 후보 관리 — 관리자가 직접 연락하고 상태만 기록한다(자동 발송 아님)
  outreach_status?: 'none' | 'sent' | 'confirmed' | 'converted'
  outreach_updated_at?: string | null
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

/**
 * 링크가 **같은 상품**인지, **비슷한 용도의 다른 상품**인지.
 *
 * 값이 없으면 `same`으로 본다 — 기존 데이터가 전부 동일 상품이라 마이그레이션 없이 붙는다.
 *
 * 이 구분이 필요한 이유는 판정 때문이다. 다른 상품 가격으로 할인율을 계산하면 화면에 틀린
 * 숫자가 나간다 — 이 제품이 제일 하면 안 되는 일이다(판단 기준 1번). getDealVerdict()는
 * `same`만 비교가로 쓴다.
 *
 * `alternative`는 "공구는 끝났는데 같은 용도로 지금 살 수 있는 것"을 권하는 자리다. 아직
 * 화면도 입력칸도 없다 — 구조만 있다(`D-030`).
 */
export type PurchaseLinkKind = 'same' | 'alternative'

/**
 * 대체 상품일 때 "왜 이걸 보여주는지" — 동일 상품/같은 브랜드/비슷한 상품 세 단계.
 * `kind`(same/alternative, 판정 가드레일)는 그대로 두고, 이건 고객 문구를 자동으로
 * 만들기 위한 좀 더 세분화된 값이다. `relation === 'same'`이면 `kind`는 항상 `same`,
 * 나머지 둘은 항상 `kind: alternative`다.
 */
export type PurchaseLinkRelation = 'same' | 'same_brand' | 'similar'

export const RELATION_DEFAULT_REASON: Record<PurchaseLinkRelation, string> = {
  same:        '쿠팡에서도 같은 상품을 확인할 수 있어요.',
  same_brand:  '같은 브랜드의 다른 제품도 함께 비교해보세요.',
  similar:     '동일 상품은 아니지만 비슷한 용도로 찾는 제품이에요.',
}

/** 공구가 아닌 일반 판매처 링크. 공구 종료 후 "지금 바로 사고 싶은" 사용자를 위한 대체 경로. */
export interface PurchaseLink {
  platform: PurchasePlatform
  /** 같은 상품인가, 비슷한 용도의 다른 상품인가. 없으면 same — relation에서 자동으로 정해진다 */
  kind?: PurchaseLinkKind
  /** 동일 상품/같은 브랜드/비슷한 상품 — 없으면 same(옛 데이터 호환) */
  relation?: PurchaseLinkRelation
  url: string
  /** 확인 당시 가격. 실시간 조회가 아니므로 화면에는 "확인 시점"과 함께 조심스럽게 쓴다 */
  price?: number | null
  /** 쿠팡 등에서 확인한 상품명 — 고객 화면에 노출 */
  productName?: string | null
  /** "왜 이 상품을 보여주는지" 고객 화면 문구. relation 기본값을 채워주고 관리자가 고칠 수 있다 */
  reason?: string | null
  /** 옵션이 공구와 달라 가격을 단순 비교하면 안 될 때 관리자가 남기는 참고 문구 — 고객 화면에 노출 */
  note?: string | null
  /** "브랜드가 달라요, 팩토는 어때요" 같은 관리자 내부 판단 메모 — 고객 화면에 절대 노출하지 않는다.
   * reason(고객용 이유)과 분리한 이유가 이거다 — 관리자가 왜 이 상품을 골랐는지 적은 메모가
   * 그대로 고객 화면에 나가면 안 된다 */
  adminMemo?: string | null
  checked_at?: string | null
  /** 고객 화면 노출 여부 — 확인이 끝난 링크만 켠다 */
  visible?: boolean
  /** false면 수수료를 안 받는 링크(쿠팡 파트너스·네이버 제휴가 없어 그냥 판매처만 안내).
   * 없으면(undefined) 기존 동작대로 수수료를 받는 링크로 본다 — 공정위 고지 문구가
   * 이 값에 따라 붙거나 빠진다. 실제로 안 받는 수수료를 받는다고 고지하면 거짓 고지가 된다 */
  commission?: boolean
  /** 제휴가 아직도 없는지 마지막으로 확인한 시각 — checked_at(가격 확인)과는 다른 값이다 */
  commission_checked_at?: string | null
}

/**
 * 실제로 확인된 구매 한 건 — 쿠팡·네이버 파트너스 대시보드에서 관리자가 직접 보고 손으로
 * 남긴다(자동 감지 아님, 그런 API가 없다). "돈이 언제 생기는가"를 실제 사례로 쌓아서
 * 패턴을 찾으려는 목적 — 상세페이지·유입경로·클릭한 링크까지 함께 남긴다.
 */
export interface PurchaseRecord {
  id: string
  postId: number
  /** 기록 당시 상품명 — 나중에 공구 제목이 바뀌거나 글이 지워져도 기록은 남는다 */
  postTitle: string
  /** 유입 경로 — lib/analytics.ts의 TrafficSource 값 */
  source: string
  /** 어떤 링크를 눌러서 나갔는지 */
  linkType: 'groupbuy' | 'coupang' | 'naver' | 'other'
  /** 이 구매가 일어난 시점에 공구가 마감 상태였는지 — "마감상품 대체구매"와
   * "진행중 가격비교"를 가르는 기준 */
  endedAtPurchase: boolean
  orderAmount: number
  revenue: number
  note?: string
  /** 실제 구매(주문)가 일어난 날짜 */
  purchasedAt: string
  /** 관리자가 이 기록을 남긴 시각 */
  recordedAt: string
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

/** 관리자가 고른 브랜드/인플루언서/셀러 공구 모음 페이지(/pick/:slug). 상품 목록을
 * 직접 고르지 않는다 — matchField/matchValue로 매번 자동 계산된다(그래서 새 공구가
 * 들어오면 페이지에 자동으로 반영된다). 관리자가 고르는 건 "이 대상을 페이지로 열지"뿐. */
export interface CuratedSubject {
  slug: string
  label: string
  kind: 'brand' | 'influencer' | 'seller'
  matchField: 'brand' | 'account'
  matchValue: string
  enabled: boolean
  added_at: string
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
