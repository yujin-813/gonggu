import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/siteUrl'
import RequestPageClient from './RequestPageClient'

// 이 페이지는 고객이 아니라 "내가 진행 중인 공구를 꿀공구에 올리고 싶은" 인플루언서·
// 판매자가 대상이다(RequestPageClient.tsx의 안내문 참고) — 소비자 유입용이 아니라
// 판매자 확보용 SEO라 제목·설명도 그쪽 검색 의도에 맞춘다.
const title = '인스타 공동구매 등록 요청'
const description = '진행 중인 인스타그램 공동구매를 꿀공구에 올려드려요. 구매 링크와 가격만 있으면 검토 후 바로 등록돼요.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/request` },
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: `${SITE_URL}/request`,
    siteName: '꿀공구',
    title: `${title} | 꿀공구`,
    description,
  },
  twitter: { card: 'summary', title: `${title} | 꿀공구`, description },
}

export default function RequestPage() {
  return <RequestPageClient />
}
