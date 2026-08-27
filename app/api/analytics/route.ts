import { NextRequest, NextResponse } from 'next/server'
import { recordEvent, getSummary, getTopPosts, getTopSharedPosts, getSourceCounts, getClickCounts, getClickBreakdown, getPostSourceCounts, getRecentSessions, classifySource, CLICK_TYPES } from '@/lib/analytics'
import { loadPosts } from '@/lib/store'
import { isPagePublic } from '@/lib/period'
import { visiblePurchaseLinks } from '@/lib/purchaseLinks'
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
    const { type, sessionId, visitorId, postId, clickType, referrer, utmSource } = await request.json()
    if (!type || !sessionId) return NextResponse.json({ error: 'missing' }, { status: 400 })
    const allowed = new Set(['view', 'bookmark', 'join', 'category', 'search', 'share', 'click'])
    if (!allowed.has(type)) return NextResponse.json({ error: 'invalid type' }, { status: 400 })
    const safeClickType = CLICK_TYPES.includes(clickType) ? clickType : undefined
    // 관리자 브라우저의 이벤트는 조용히 버린다 — 클라이언트에는 성공으로 응답해서
    // 통계 제외 여부가 화면 동작에 영향을 주지 않도록 한다
    // 크롤러가 JS를 실행해 찍는 이벤트를 걸러낸다 — 안 걸러내면 방문자 수가 봇으로 채워진다
    if (isBotRequest(request)) return NextResponse.json({ ok: true, skipped: 'bot' })
    if (await isAdminRequest(request)) return NextResponse.json({ ok: true, skipped: 'admin' })
    // 유입 경로 판정. 리퍼러는 브라우저의 document.referrer를 클라이언트가 보내주고,
    // 그게 없을 때를 대비해 User-Agent의 인앱 브라우저 표식까지 함께 본다.
    const { source } = classifySource({
      utmSource: typeof utmSource === 'string' ? utmSource.slice(0, 60) : null,
      referrer: typeof referrer === 'string' ? referrer.slice(0, 300) : null,
      userAgent: request.headers.get('user-agent'),
    })
    recordEvent(type, sessionId, { visitorId, postId, clickType: safeClickType, source })
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
  const sources = getSourceCounts(14)
  // 상품별 상세 조회수. 상세 페이지는 열릴 때 clickType 'detail'을 찍으므로 이게 곧 조회수다.
  // 관리자 채우기 목록을 "사람이 실제로 보고 있는 순"으로 세우는 데 쓴다 — 판정이 없는 공구가
  // 2,300건이라 어디부터 채울지가 실제 손실을 가른다.
  const detailViews = getClickCounts(14, ['detail'])
  // 수익화 현황 표 — 상품별 클릭을 종류별로, 그리고 유입 경로별로 함께 내려준다
  const clickBreakdown = getClickBreakdown(14)
  const postSources = getPostSourceCounts(14)
  const recentSessions = getRecentSessions(40)
  // 성장 목표 카드의 "공구 클릭"·"구매처 클릭" — 지금 고객 화면에 실제로 떠 있는 상품만
  // 센다(isPagePublic). 제외됐거나 비공개인 상품의 옛 클릭까지 합치면, 여기 나오는
  // 합계와 「수익화 현황 → 상품별로 보기」(똑같이 isPagePublic만 나열)의 합이 안 맞아서
  // "어디 갔지?"가 된다 — 사장님이 실제로 이 불일치를 발견하고 지적했다.
  // 구매처 클릭은 진짜 제휴(쿠팡·네이버 파트너스)만. 'other'(제휴 없는 판매처 링크,
  // D-058)는 수수료가 없어서 뺀다.
  const publicIds = new Set(posts.filter(isPagePublic).map(p => p.id))
  const sumIds = (counts: Record<number, number>, ids: Set<number>) =>
    Object.entries(counts).filter(([id]) => ids.has(Number(id))).reduce((a, [, v]) => a + v, 0)
  const detailViews7 = sumIds(getClickCounts(7, ['detail']), publicIds)
  const groupbuyClicks7 = sumIds(getClickCounts(7, ['groupbuy']), publicIds)
  const moneyClicks7 = sumIds(getClickCounts(7, ['coupang', 'naver']), publicIds)
  // 제휴 클릭률의 분모 — "제휴 링크가 실제로 노출된 상세조회"만. 전체 상세조회로 나누면
  // 제휴 링크가 아예 없는 상품을 본 사람까지 분모에 들어가서 클릭률이 실제보다 낮게 나온다
  // (사장님 지적: 4/515=0.8%는 틀린 숫자는 아니지만 쓸모가 없다). commission:false(D-058)
  // 링크는 제휴가 아니므로 뺀다.
  const affiliateExposedIds = new Set(
    posts.filter(p => isPagePublic(p) && visiblePurchaseLinks(p)
      .some(l => (l.platform === 'coupang' || l.platform === 'naver') && l.commission !== false))
      .map(p => p.id)
  )
  const affiliateDetailViews7 = sumIds(getClickCounts(7, ['detail']), affiliateExposedIds)
  return NextResponse.json({
    summary, topPosts, topSharedPosts, sources, detailViews, clickBreakdown, postSources, recentSessions,
    detailViews7, groupbuyClicks7, moneyClicks7, affiliateDetailViews7,
  })
}
