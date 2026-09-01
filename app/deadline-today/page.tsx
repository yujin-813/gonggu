import type { Metadata } from 'next'
import { visiblePosts, todayDeadlinePosts, landingCopy } from '@/lib/landing'
import { landingMetadata, LandingPage } from '@/lib/landingPage'

export const dynamic = 'force-dynamic'

function load() {
  const posts = todayDeadlinePosts(visiblePosts())
  return { posts, copy: landingCopy('deadline_today', posts.length) }
}

export function generateMetadata(): Metadata {
  const { posts, copy } = load()
  return landingMetadata(copy, posts)
}

export default function DeadlineTodayPage() {
  const { posts, copy } = load()
  return <LandingPage copy={copy} posts={posts} />
}
