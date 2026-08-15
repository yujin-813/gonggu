import { NextRequest, NextResponse } from 'next/server'
import { recordEvent, getSummary, getTopPosts, getTopSharedPosts, CLICK_TYPES } from '@/lib/analytics'
import { loadPosts } from '@/lib/store'
import { AUTH_COOKIE, computeToken, safeEqual } from '@/lib/auth'

// 관리자 로그인 쿠키가 붙어 있는 요청인지 — 클라이언트의 track()도 같은 판정을 하지만
// 그쪽은 건너뛸 수 있으므로(스크립트 차단, 캐시된 옛 번들, 직접 호출) 서버에서 한 번 더 막는다
async function isAdminRequest(request: NextRequest): Promise<boolean> {
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
