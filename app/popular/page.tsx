import type { Metadata } from 'next'
import { visiblePosts, popularPosts, landingCopy } from '@/lib/landing'
import { getPopularPostIds } from '@/lib/analytics'
import { landingMetadata, LandingPage } from '@/lib/landingPage'

export const dynamic = 'force-dynamic'

// 홈의 "지금 많이 보는 공구"(app/page.tsx)와 같은 집계(최근 7일 클릭)를 쓰되, 홈은
// 가로 스트립이라 6개만 보여주고 여기는 전용 페이지라 더 넉넉히 담는다
const POPULAR_DAYS = 7
const LIMIT = 30

function load() {
  const posts = popularPosts(visiblePosts(), getPopularPostIds(POPULAR_DAYS, LIMIT))
  return { posts, copy: landingCopy('popular', posts.length) }
}

export function generateMetadata(): Metadata {
  const { posts, copy } = load()
  return landingMetadata(copy, posts)
}

export default function PopularPage() {
  const { posts, copy } = load()
  return <LandingPage copy={copy} posts={posts} />
}
