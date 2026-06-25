import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '딜조아 🛍️',
  description: '인스타그램 공동구매 딜조아',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
