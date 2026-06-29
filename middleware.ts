import { NextRequest, NextResponse } from 'next/server'
import { AUTH_COOKIE, computeToken, safeEqual } from '@/lib/auth'

// 관리자 권한이 필요한 요청인지 판별
function isProtected(req: NextRequest): boolean {
  const { pathname, searchParams } = req.nextUrl
  const method = req.method

  // 게시글: 일반 GET(고객 페이지)은 허용, admin=1 조회와 모든 쓰기는 보호
  if (pathname === '/api/posts') {
    return method !== 'GET' || searchParams.get('admin') === '1'
  }
  if (pathname.startsWith('/api/posts/')) return true // PATCH/PUT/DELETE

  // 스크래퍼 실행/상태
  if (pathname.startsWith('/api/scrape')) return true

  // 인스타 추적 계정 관리 (관리자 전용)
  if (pathname.startsWith('/api/profiles')) return true

  // 인포크 수집 및 소스 관리 (관리자 전용)
  if (pathname.startsWith('/api/inpock')) return true

  // 로컬 수집분 병합 수신 (관리자 전용)
  if (pathname.startsWith('/api/ingest')) return true

  // 업로드
  if (pathname === '/api/upload') return true

  // 통계 조회만 보호 (POST는 고객 이벤트 수집이라 허용)
  if (pathname === '/api/analytics') return method === 'GET'

  return false
}

export async function middleware(req: NextRequest) {
  if (!isProtected(req)) return NextResponse.next()

  const secret = process.env.ADMIN_PASSWORD
  if (!secret) {
    return NextResponse.json(
      { error: 'ADMIN_PASSWORD가 서버에 설정되지 않았습니다' },
      { status: 500 },
    )
  }

  const token = req.cookies.get(AUTH_COOKIE)?.value
  const expected = await computeToken(secret)
  if (!token || !safeEqual(token, expected)) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/api/posts',
    '/api/posts/:path*',
    '/api/scrape',
    '/api/scrape/:path*',
    '/api/profiles',
    '/api/profiles/:path*',
    '/api/inpock',
    '/api/inpock/:path*',
    '/api/inpock-sources',
    '/api/inpock-sources/:path*',
    '/api/ingest',
    '/api/upload',
    '/api/analytics',
  ],
}
