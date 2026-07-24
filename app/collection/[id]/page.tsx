import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { loadCollections, loadPosts } from '@/lib/store'
import { isCustomerVisible } from '@/lib/period'
import CollectionDetailClient from './CollectionDetailClient'

const SITE_URL = 'https://gonggu.asknuggetdata.com'

function getCollectionAndPosts(rawId: string) {
  const id = decodeURIComponent(rawId)
  const collection = loadCollections().find(c => c.id === id)
  if (!collection) return null
  const postMap = new Map(loadPosts().map(p => [p.id, p]))
  const posts = collection.productIds
    .map(pid => postMap.get(pid))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .filter(isCustomerVisible)
  return { collection, posts }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const data = getCollectionAndPosts(params.id)
  if (!data) return { title: '컬렉션을 찾을 수 없어요' }
  const { collection, posts } = data
  // 페이지 <title>은 루트 레이아웃의 template("%s | 꿀공구")을 타므로 접미사를 붙이지 않는다.
  // OG/Twitter 태그는 템플릿을 타지 않으므로 완결된 문자열을 직접 넣어야 한다.
  const pageTitle = `${collection.emoji} ${collection.title}`
  const shareTitle = `${pageTitle} | 꿀공구`
  const description = collection.description || `${collection.title} — ${posts.length}개의 공구를 모아봤어요`
  const image = posts.find(p => p.img)?.img
  const url = `${SITE_URL}/collection/${collection.id}`

  return {
    title: pageTitle,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      locale: 'ko_KR',
      url,
      siteName: '꿀공구',
      title: shareTitle,
      description,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: shareTitle,
      description,
      images: image ? [image] : undefined,
    },
  }
}

export default function CollectionPage({ params }: { params: { id: string } }) {
  const data = getCollectionAndPosts(params.id)
  if (!data) notFound()
  return <CollectionDetailClient collection={data.collection} posts={data.posts} />
}
