import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { Category } from '@/lib/types'
import {
  visiblePosts, CATEGORY_COMBO_CATEGORIES, CATEGORY_COMBO_KEYS,
  categoryComboPosts, categoryComboCopy, comboPathSegment,
} from '@/lib/landing'
import type { LandingKey } from '@/lib/landing'
import { landingMetadata, LandingPage } from '@/lib/landingPage'

export const dynamic = 'force-dynamic'

// URL 세그먼트(today/deadline/deadline-today/...) ↔ LandingKey 역매핑
const KEY_BY_SEGMENT: Record<string, LandingKey> = Object.fromEntries(
  CATEGORY_COMBO_KEYS.map(k => [comboPathSegment(k), k]),
)

function load(rawCat: string, rawPeriod: string) {
  const cat = decodeURIComponent(rawCat) as Category
  if (!CATEGORY_COMBO_CATEGORIES.includes(cat)) return null
  const key = KEY_BY_SEGMENT[rawPeriod]
  if (!key) return null
  const posts = categoryComboPosts(visiblePosts(), cat, key)
  return { posts, copy: categoryComboCopy(cat, key, posts.length) }
}

export function generateMetadata({ params }: { params: { cat: string; period: string } }): Metadata {
  const data = load(params.cat, params.period)
  if (!data) return { title: '페이지를 찾을 수 없어요', robots: { index: false, follow: false } }
  return landingMetadata(data.copy, data.posts)
}

export default function CategoryComboPage({ params }: { params: { cat: string; period: string } }) {
  const data = load(params.cat, params.period)
  if (!data) notFound()
  return <LandingPage copy={data.copy} posts={data.posts} />
}
