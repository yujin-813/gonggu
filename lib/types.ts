export type Category = 'fashion' | 'beauty' | 'food' | 'life' | 'kids' | 'health' | 'pet' | 'digital'
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
  source?: 'manual' | 'scraper' | 'inpock'
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
  extraction_debug?: Record<string, unknown> | null
  market_price?: number | null
  market_source?: string | null
  // 관리자가 자동 판단(dealJudgment) 대신 직접 입력한 구매 판단 문구 — 값이 있으면 이걸 우선 사용
  custom_verdict?: string | null
  custom_verdict_detail?: string | null
  custom_verdict_cls?: 'great' | 'good' | 'neutral' | 'check' | null
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
