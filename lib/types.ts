export type Category = 'fashion' | 'beauty' | 'food' | 'life' | 'kids' | 'health' | 'pet' | 'digital'
export type SortOrder = 'latest' | 'deadline' | 'discount' | 'popular'

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
  published?: boolean
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
