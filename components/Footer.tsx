'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// 인플루언서·브랜드가 "우리도 올리고 싶다"고 생각해도 연락할 곳이 없었다. 링크 하나만
// 둔다 — 상단 헤더 아이콘 줄은 이미 붐빈다(찜·팔로우·알림·등록요청·인플루언서목록).
// 관리자 화면(/admin)에는 안 보여준다 — 고객·제휴처를 향한 안내라 관리자 화면 성격과 안 맞는다.
export default function Footer() {
  const pathname = usePathname()
  if (pathname?.startsWith('/admin')) return null

  return (
    <footer style={{ padding: '28px 16px 40px', textAlign: 'center' }}>
      <Link href="/propose" style={{ fontSize: 12.5, color: 'var(--gray-4)', textDecoration: 'none', fontWeight: 600 }}>
        공구 제안 · 입점 문의
      </Link>
    </footer>
  )
}
