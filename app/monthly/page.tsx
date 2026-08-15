import type { Metadata } from 'next'
import { visiblePosts, monthlyPosts, landingCopy } from '@/lib/landing'
import { landingMetadata, LandingPage } from '@/lib/landingPage'

export const dynamic = 'force-dynamic'

function load() {
  const posts = monthlyPosts(visiblePosts())
  return { posts, copy: landingCopy('monthly', posts.length) }
}

export function generateMetadata(): Metadata {
  const { posts, copy } = load()
  return landingMetadata(copy, posts)
}

export default function MonthlyPage() {
  const { posts, copy } = load()
  return <LandingPage copy={copy} posts={posts} />
}
