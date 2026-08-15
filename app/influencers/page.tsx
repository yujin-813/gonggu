import type { Metadata } from 'next'
import { loadPosts } from '@/lib/store'
import { SITE_URL } from '@/lib/landing'
import { isCustomerVisible } from '@/lib/period'
import JsonLd, { breadcrumbSchema } from '@/components/JsonLd'
import InfluencersPageClient from './InfluencersPageClient'

export const dynamic = 'force-dynamic'

function influencerCount(): number {
  const accounts = new Set(
    loadPosts().filter(isCustomerVisible).map(p => p.account).filter(Boolean)
  )
  return accounts.size
}

export function generateMetadata(): Metadata {
  const count = influencerCount()
  const pageTitle = '인플루언서별 공구 모아보기'
  const shareTitle = `${pageTitle} | 꿀공구`
  const description = count > 0
    ? `공구를 진행 중인 인스타그램 인플루언서 ${count}명을 카테고리별로 모았어요. 좋아하는 인플루언서의 공동구매를 한곳에서 확인하세요.`
    : '공구를 진행하는 인스타그램 인플루언서를 한곳에 모았어요.'
  const url = `${SITE_URL}/influencers`

  return {
    title: pageTitle,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website', locale: 'ko_KR', url, siteName: '꿀공구',
      title: shareTitle, description,
    },
    twitter: { card: 'summary', title: shareTitle, description },
  }
}

export default function InfluencersPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema([
        { name: '꿀공구', path: '/' },
        { name: '인플루언서별 공구', path: '/influencers' },
      ])} />
      <InfluencersPageClient />
    </>
  )
}
