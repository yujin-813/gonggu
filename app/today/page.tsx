import type { Metadata } from 'next'
import { visiblePosts, todayPosts, landingCopy } from '@/lib/landing'
import { landingMetadata, LandingPage } from '@/lib/landingPage'

// 공구는 매일 바뀌므로 빌드 시점에 고정되면 안 된다
export const dynamic = 'force-dynamic'

function load() {
  const posts = todayPosts(visiblePosts())
  return { posts, copy: landingCopy('today', posts.length) }
}

export function generateMetadata(): Metadata {
  const { posts, copy } = load()
  return landingMetadata(copy, posts)
}

export default function TodayPage() {
  const { posts, copy } = load()
  return <LandingPage copy={copy} posts={posts} />
}
