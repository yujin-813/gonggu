import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/siteUrl'
import ProposePageClient from './ProposePageClient'

// /request와 마찬가지로 소비자가 아니라 인플루언서·브랜드가 대상인 창구다(D-067) —
// "제휴 제안", "입점 문의" 같은 판매자 쪽 검색 의도에 맞춘 제목·설명을 쓴다.
const title = '인플루언서·브랜드 제휴 제안'
const description = '인플루언서·브랜드가 꿀공구에 공구를 소개하거나 제휴를 제안하는 창구예요. 이메일과 연락처만 남기면 확인 후 답변드려요.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/propose` },
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: `${SITE_URL}/propose`,
    siteName: '꿀공구',
    title: `${title} | 꿀공구`,
    description,
  },
  twitter: { card: 'summary', title: `${title} | 꿀공구`, description },
}

export default function ProposePage() {
  return <ProposePageClient />
}
