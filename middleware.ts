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

// 인플루언서 계정 중복 URL을 대표 URL로 308 리다이렉트한다. 페이지 렌더링(React 스트리밍)
// 안에서 permanentRedirect()를 부르면 실서버(Node 20)에서 진짜 308이 아니라 200+메타리프레시로
// 나가는 문제가 있어(app/influencer/[account]/page.tsx 참고) 렌더링이 시작되기 전인 미들웨어에서
// 처리한다. 실패해도 페이지 쪽에 같은 로직이 한 번 더 있어 안전망은 있다(소프트 리다이렉트로라도 나감).
async function influencerRedirect(req: NextRequest): Promise<NextResponse | null> {
  const match = req.nextUrl.pathname.match(/^\/influencer\/([^/]+)$/)
  if (!match) return null
  try {
    // req.url 그대로 쓰면(공개 도메인) 서버가 자기 자신의 공개 도메인으로 다시 나갔다
    // 들어와야 해서 실패할 수 있다(실측: 로컬은 되는데 배포 서버에서 이 경로로는 응답이
    // 안 왔다) — 같은 프로세스 안이므로 루프백으로 바로 부른다.
    const internalPort = process.env.PORT || req.nextUrl.port
    const base = internalPort ? `http://127.0.0.1:${internalPort}` : req.nextUrl.origin
    const resolveUrl = new URL(`/api/influencer-redirect?account=${encodeURIComponent(match[1])}`, base)
    const res = await fetch(resolveUrl, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return null
    const { redirectTo } = await res.json()
    if (!redirectTo) return null
    return NextResponse.redirect(new URL(redirectTo, req.url), 308)
  } catch (err) {
    console.error('[influencerRedirect] 대표 URL 확인 실패 — 페이지 쪽 안전망으로 넘어감', err)
    return null
  }
}

export async function middleware(req: NextRequest) {
  const influencerRes = await influencerRedirect(req)
  if (influencerRes) return influencerRes

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
    '/influencer/:path*',
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
