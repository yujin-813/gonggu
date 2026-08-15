import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { loadPosts } from '@/lib/store'
import { isCustomerVisible, getPeriodState, periodLabel } from '@/lib/period'
import { SITE_URL } from '@/lib/landing'
import { CATEGORY_LABEL } from '@/lib/categoryIcons'
import JsonLd, { productSchema, breadcrumbSchema } from '@/components/JsonLd'
import type { Post } from '@/lib/types'
import PostDetailClient from './PostDetailClient'

function getPost(rawId: string) {
  const id = parseInt(rawId, 10)
  if (Number.isNaN(id)) return null
  const post = loadPosts().find(p => p.id === id)
  if (!post || !isCustomerVisible(post)) return null
  return post
}

// 기존 설명은 "13,800원 — 꿀공구에서 확인해보세요"뿐이라 검색 결과에서 상품을 구분할
// 단서가 없었다. 브랜드·인플루언서·판매기간을 넣어 "브랜드명 공구" 같은 검색어와 실제로
// 겹치게 하고, 사용자가 결과 목록에서 고를 수 있을 만큼의 정보를 담는다.
function buildDescription(post: Post): string {
  const parts: string[] = []
  if (post.brand) parts.push(post.brand)
  parts.push(post.title)
  const head = parts.join(' ')

  const detail: string[] = []
  if (post.price) detail.push(`${post.price.toLocaleString()}원`)
  if (post.influencer_name) detail.push(`${post.influencer_name} 공구`)
  else if (post.account) detail.push(`${post.account.replace('@', '')} 공구`)
  const period = getPeriodState(post).kind === 'evergreen' ? '' : periodLabel(post)
  if (period) detail.push(period)
  detail.push(`${CATEGORY_LABEL[post.cat] || ''} 카테고리`.trim())

  return `${head} — ${detail.filter(Boolean).join(' · ')}. 꿀공구에서 최저가와 마감일을 확인하세요.`
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const post = getPost(params.id)
  if (!post) return { title: '공구를 찾을 수 없어요' }
  // 페이지 <title>은 루트 레이아웃의 template("%s | 꿀공구")을 타므로 접미사를 붙이지 않는다.
  // OG/Twitter 태그는 템플릿을 타지 않으므로 완결된 문자열을 직접 넣어야 한다.
  const shareTitle = `${post.title} | 꿀공구`
  const description = buildDescription(post)
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
  return (
    <>
      <JsonLd data={[
        productSchema(post),
        breadcrumbSchema([
          { name: '꿀공구', path: '/' },
          { name: `${CATEGORY_LABEL[post.cat]} 공구`, path: `/category/${post.cat}` },
          { name: post.title, path: `/post/${post.id}` },
        ]),
      ]} />
      <PostDetailClient post={post} />
    </>
  )
}
