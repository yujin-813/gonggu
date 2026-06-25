import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '공구모아 🛍️',
  description: '인스타그램 공구 모아보기',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
