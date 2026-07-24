import type { Metadata } from 'next'
import './globals.css'

const SITE_URL = 'https://gonggu.asknuggetdata.com'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: '꿀공구 | 꿀 같은 공구만 모아드려요',
    template: '%s | 꿀공구',
  },
  description: '인스타그램 인플루언서 공동구매(공구) 정보를 한곳에 모아보는 꿀공구. 마감 임박 공구, 카테고리별 공구, 최저가 비교까지 한눈에 확인하세요.',
  keywords: ['공동구매', '공구', '인스타 공구', '인플루언서 공구', '꿀공구', '공구모아', '공구 사이트'],
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: SITE_URL,
    siteName: '꿀공구',
    title: '꿀공구 | 꿀 같은 공구만 모아드려요',
    description: '인스타그램 인플루언서 공동구매(공구) 정보를 한곳에 모아보는 꿀공구.',
  },
  twitter: {
    card: 'summary_large_image',
    title: '꿀공구 | 꿀 같은 공구만 모아드려요',
    description: '인스타그램 인플루언서 공동구매(공구) 정보를 한곳에 모아보는 꿀공구.',
  },
  robots: {
    index: true,
    follow: true,
  },
  // 구글 서치콘솔(GOOGLE_SITE_VERIFICATION) / 네이버 서치어드바이저(NAVER_SITE_VERIFICATION)에서
  // 발급받은 코드를 .env.local 에 넣으면 아래에서 자동으로 메타태그에 반영됩니다.
  verification: {
    ...(process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : {}),
    ...(process.env.NAVER_SITE_VERIFICATION
      ? { other: { 'naver-site-verification': process.env.NAVER_SITE_VERIFICATION } }
      : {}),
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
