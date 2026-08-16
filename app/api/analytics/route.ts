import { NextRequest, NextResponse } from 'next/server'
import { recordEvent, getSummary, getTopPosts, getTopSharedPosts, CLICK_TYPES } from '@/lib/analytics'
import { loadPosts } from '@/lib/store'
import { AUTH_COOKIE, computeToken, safeEqual } from '@/lib/auth'
import { ADMIN_SEEN_COOKIE, isAdminIp, clientIp, isBotRequest } from '@/lib/adminTrace'

// 운영자 본인의 방문인지 — 세 겹으로 본다. 자세한 이유는 lib/adminTrace.ts 참고.
// 클라이언트의 track()도 비슷한 판정을 하지만 그쪽은 건너뛸 수 있으므로(스크립트 차단,
// 캐시된 옛 번들, 직접 호출) 서버에서 최종 판정한다.
async function isAdminRequest(request: NextRequest): Promise<boolean> {
  // (2) 한 번이라도 관리자로 로그인한 브라우저 — 세션이 만료돼도 남는다
  if (request.cookies.get(ADMIN_SEEN_COOKIE)?.value === '1') return true
  // (3) 최근 관리자 로그인에 쓰인 회선 — 다른 브라우저·시크릿창·다른 기기까지 걸러진다
  if (isAdminIp(clientIp(request))) return true
  // (1) 지금 로그인 중인 브라우저
  const secret = process.env.ADMIN_PASSWORD
  const token = request.cookies.get(AUTH_COOKIE)?.value
  if (!secret || !token) return false
  return safeEqual(token, await computeToken(secret))
}

export async function POST(request: NextRequest) {
  try {
    const { type, sessionId, visitorId, postId, clickType } = await request.json()
    if (!type || !sessionId) return NextResponse.json({ error: 'missing' }, { status: 400 })
    const allowed = new Set(['view', 'bookmark', 'join', 'category', 'search', 'share', 'click'])
    if (!allowed.has(type)) return NextResponse.json({ error: 'invalid type' }, { status: 400 })
    const safeClickType = CLICK_TYPES.includes(clickType) ? clickType : undefined
    // 관리자 브라우저의 이벤트는 조용히 버린다 — 클라이언트에는 성공으로 응답해서
    // 통계 제외 여부가 화면 동작에 영향을 주지 않도록 한다
    // 크롤러가 JS를 실행해 찍는 이벤트를 걸러낸다 — 안 걸러내면 방문자 수가 봇으로 채워진다
    if (isBotRequest(request)) return NextResponse.json({ ok: true, skipped: 'bot' })
    if (await isAdminRequest(request)) return NextResponse.json({ ok: true, skipped: 'admin' })
    recordEvent(type, sessionId, { visitorId, postId, clickType: safeClickType })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'server error' }, { status: 500 })
  }
}

export async function GET() {
  const summary = getSummary(14)
  const top = getTopPosts(10)
  const topShared = getTopSharedPosts(10)
  const posts = loadPosts()
  const withPostInfo = (list: { postId: number; count: number }[]) => list
    .map(({ postId, count }) => {
      const post = posts.find(p => p.id === postId)
      if (!post) return null
      return { id: postId, title: post.title, img: post.img || null, price: post.price, count }
    })
    .filter(Boolean)
  const topPosts = withPostInfo(top)
  const topSharedPosts = withPostInfo(topShared)
  return NextResponse.json({ summary, topPosts, topSharedPosts })
}
