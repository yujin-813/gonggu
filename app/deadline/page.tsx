import type { Metadata } from 'next'
import { visiblePosts, deadlinePosts, landingCopy } from '@/lib/landing'
import { landingMetadata, LandingPage } from '@/lib/landingPage'

export const dynamic = 'force-dynamic'

function load() {
  const posts = deadlinePosts(visiblePosts())
  return { posts, copy: landingCopy('deadline', posts.length) }
}

export function generateMetadata(): Metadata {
  const { posts, copy } = load()
  return landingMetadata(copy, posts)
}

export default function DeadlinePage() {
  const { posts, copy } = load()
  return <LandingPage copy={copy} posts={posts} />
}
