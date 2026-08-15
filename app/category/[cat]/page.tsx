import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { Category } from '@/lib/types'
import { visiblePosts, categoryPosts, categoryCopy, CATEGORY_KEYS } from '@/lib/landing'
import { landingMetadata, LandingPage } from '@/lib/landingPage'

export const dynamic = 'force-dynamic'

function load(rawCat: string) {
  const cat = decodeURIComponent(rawCat) as Category
  if (!CATEGORY_KEYS.includes(cat)) return null
  const posts = categoryPosts(visiblePosts(), cat)
  return { posts, copy: categoryCopy(cat, posts.length) }
}

// generateStaticParams를 두면 force-dynamic이어도 빌드 시점에 프리렌더돼 목록이 고정된다.
// 공구는 매일 바뀌므로 요청마다 새로 계산하게 두고, 경로 발견은 sitemap과 내부 링크에 맡긴다.

export function generateMetadata({ params }: { params: { cat: string } }): Metadata {
  const data = load(params.cat)
  if (!data) return { title: '카테고리를 찾을 수 없어요' }
  return landingMetadata(data.copy, data.posts)
}

export default function CategoryPage({ params }: { params: { cat: string } }) {
  const data = load(params.cat)
  if (!data) notFound()
  return <LandingPage copy={data.copy} posts={data.posts} />
}
