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
  // 고객 화면에서 쓰는 읽기 전용 조회(지난 공구가, 인플루언서별 상품)는 인증 없이 허용
  if (pathname === '/api/posts/group-history' || pathname === '/api/posts/by-influencer') {
    return method !== 'GET'
  }
  // 인플루언서/고객이 직접 공구 등록을 요청하는 공개 제보 창구 — 항상 needs_review로만
  // 들어가고 절대 published=true로 안 뜨게 서버(app/api/posts/request/route.ts)가 강제한다
  if (pathname === '/api/posts/request') {
    return method !== 'POST'
  }
  // 제휴 문의 — 제출(POST)은 누구나, 목록 조회(GET)·처리 표시(PATCH)는 관리자만
  if (pathname === '/api/inquiries') {
    return method !== 'POST'
  }
  if (pathname.startsWith('/api/posts/')) return true // PATCH/PUT/DELETE

  // 컬렉션: 일반 GET(고객 페이지)은 허용, admin=1 조회와 모든 쓰기는 보호
  if (pathname === '/api/collections') {
    return method !== 'GET' || searchParams.get('admin') === '1'
  }
  if (pathname.startsWith('/api/collections/')) {
    return method !== 'GET' || searchParams.get('admin') === '1'
  }

  // 공구 모음 대상(/pick/:slug) — 컬렉션과 같은 규칙
  if (pathname === '/api/curated-subjects') {
    return method !== 'GET' || searchParams.get('admin') === '1'
  }
  if (pathname.startsWith('/api/curated-subjects/')) return true // PATCH/DELETE만 있음

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

  // 관리자 IP 목록 (관리자 전용)
  if (pathname === '/api/admin-ips') return true

  // 성장 목표 단계 (관리자 전용)
  if (pathname === '/api/growth-goals') return true

  // 구매 기록 (관리자 전용)
  if (pathname === '/api/purchase-log') return true

  // 옵션 가져오기 — 임의 URL을 서버가 대신 요청해 주는 창구라 반드시 막아야 한다
  if (pathname === '/api/options') return true

  // 인스타 단일 게시글 수집 — /api/options와 같은 위험(임의 URL을 서버가 인스타
  // 계정 자격증명으로 대신 요청)이라 반드시 막아야 한다
  if (pathname === '/api/instagram-post') return true

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
    '/api/inquiries',
    '/api/collections',
    '/api/collections/:path*',
    '/api/curated-subjects',
    '/api/curated-subjects/:path*',
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
    '/api/admin-ips',
    '/api/growth-goals',
    '/api/purchase-log',
    '/api/options',
    '/api/instagram-post',
  ],
}
