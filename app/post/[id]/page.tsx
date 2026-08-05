import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { loadPosts } from '@/lib/store'
import { isCustomerVisible } from '@/lib/period'
import PostDetailClient from './PostDetailClient'

const SITE_URL = 'https://gonggu.asknuggetdata.com'

function getPost(rawId: string) {
  const id = parseInt(rawId, 10)
  if (Number.isNaN(id)) return null
  const post = loadPosts().find(p => p.id === id)
  if (!post || !isCustomerVisible(post)) return null
  return post
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const post = getPost(params.id)
  if (!post) return { title: '공구를 찾을 수 없어요' }
  // 페이지 <title>은 루트 레이아웃의 template("%s | 꿀공구")을 타므로 접미사를 붙이지 않는다.
  // OG/Twitter 태그는 템플릿을 타지 않으므로 완결된 문자열을 직접 넣어야 한다.
  const shareTitle = `${post.title} | 꿀공구`
  const description = `${post.price.toLocaleString()}원 — 꿀공구에서 확인해보세요`
  const url = `${SITE_URL}/post/${post.id}`

  return {
    title: post.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      locale: 'ko_KR',
      url,
      siteName: '꿀공구',
      title: shareTitle,
      description,
      images: post.img ? [{ url: post.img }] : undefined,
    },
    twitter: {
      card: post.img ? 'summary_large_image' : 'summary',
      title: shareTitle,
      description,
      images: post.img ? [post.img] : undefined,
    },
  }
}

export default function PostPage({ params }: { params: { id: string } }) {
  const post = getPost(params.id)
  if (!post) notFound()
  return <PostDetailClient post={post} />
}
