import type { Metadata } from 'next'
import { loadPosts } from '@/lib/store'
import { SITE_URL } from '@/lib/landing'
import { influencerItems, influencerName } from '@/lib/influencerItems'
import JsonLd, { itemListSchema, breadcrumbSchema } from '@/components/JsonLd'
import InfluencerPageClient from './InfluencerPageClient'

export const dynamic = 'force-dynamic'

// "도현맘 공구", "쑥쑥맘 공동구매"처럼 인플루언서 이름으로 찾는 검색이 실제로 많은데,
// 이 페이지가 'use client'라 제목이 홈과 똑같이 나오고 있었다. 서버 컴포넌트로 감싸
// 이름이 들어간 제목·설명을 붙이고 목록을 구조화 데이터로도 내보낸다.

// 메타데이터·JSON-LD는 화면이 실제로 보여주는 목록과 같은 것을 세야 한다.
// 예전에는 isCustomerVisible로 따로 세서, 화면엔 20건이 떠 있는데 검색엔진에는 "공동구매
// 0건"으로 나가는 계정이 74개 중 35개였다.
function getInfluencer(rawAccount: string) {
  const account = decodeURIComponent(rawAccount)
  const normalized = account.startsWith('@') ? account : `@${account}`
  const all = loadPosts()
  const items = influencerItems(all, normalized)
  if (items.length === 0) return null
  return { account: normalized, name: influencerName(all, normalized), items }
}

export function generateMetadata({ params }: { params: { account: string } }): Metadata {
  const data = getInfluencer(params.account)
  const handle = decodeURIComponent(params.account).replace('@', '')
  if (!data) {
    return { title: `${handle} 공구`, description: `${handle}님의 공동구매 정보를 꿀공구에서 확인하세요.` }
  }
  const { name, items } = data
  const count = items.length
  const pageTitle = `${name} 공구`
  const shareTitle = `${pageTitle} | 꿀공구`
  const description = `${name}님의 공동구매 ${count}건을 모았어요. 상품별 가격과 마감일, 최저가 비교까지 한눈에 확인하세요.`
  const url = `${SITE_URL}/influencer/${encodeURIComponent(params.account)}`
  const image = items.find(p => p.img)?.img

  return {
    title: pageTitle,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'profile',
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

export default function InfluencerPage({ params }: { params: { account: string } }) {
  const data = getInfluencer(params.account)
  const path = `/influencer/${encodeURIComponent(params.account)}`
  return (
    <>
      {data && (
        <JsonLd data={[
          itemListSchema(data.items, `${data.name} 공구`, `${SITE_URL}${path}`),
          breadcrumbSchema([
            { name: '꿀공구', path: '/' },
            { name: '인플루언서', path: '/influencers' },
            { name: `${data.name} 공구`, path },
          ]),
        ]} />
      )}
      <InfluencerPageClient params={params} />
    </>
  )
}
