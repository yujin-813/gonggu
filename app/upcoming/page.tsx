import type { Metadata } from 'next'
import { visiblePosts, upcomingPosts, landingCopy } from '@/lib/landing'
import { landingMetadata, LandingPage } from '@/lib/landingPage'

// 오픈일이 다가오면 대상이 바뀌므로 빌드 시점에 고정되면 안 된다
export const dynamic = 'force-dynamic'

function load() {
  const posts = upcomingPosts(visiblePosts())
  return { posts, copy: landingCopy('upcoming', posts.length) }
}

export function generateMetadata(): Metadata {
  const { posts, copy } = load()
  return landingMetadata(copy, posts)
}

export default function UpcomingPage() {
  const { posts, copy } = load()
  return <LandingPage copy={copy} posts={posts} />
}
