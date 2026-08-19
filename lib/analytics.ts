import fs from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')
const FILE = path.join(DATA_DIR, 'analytics.json')

interface DayData {
  visitors: number
  sessions: string[]
  events: Record<string, number>
  visitorIds?: string[]       // 그 날 집계된 persistent visitorId (탭/세션과 무관하게 브라우저당 하나)
  newVisitors?: number        // 그 날 처음 방문한 visitorId 수
  returningVisitors?: number  // 그 날 이전에도 방문했던 visitorId 수
  // 유입 경로별 방문 수 — sources[TrafficSource] = 방문 수.
  // 어디서 오는지 몰라 nginx 로그를 뒤져야 했고, 그 로그는 2주면 지워진다. 여기 쌓아 둔다.
  sources?: Record<string, number>
}

// 클릭 종류 — 어떤 버튼을 눌렀는지 구분해야 "공구는 끝났는데 쿠팡으로는 계속 나간다"
// 같은 판단을 할 수 있다. groupbuy=공구 보러가기, coupang/naver=대체 구매처, detail=상세 조회
export type ClickType = 'groupbuy' | 'coupang' | 'naver' | 'other' | 'detail'

export const CLICK_TYPES: ClickType[] = ['groupbuy', 'coupang', 'naver', 'other', 'detail']

interface AnalyticsData {
  daily: Record<string, DayData>
  visitorFirstSeen?: Record<string, string>  // visitorId -> 최초 방문일(YYYY-MM-DD)
  postViews?: Record<string, number>         // postId -> "공구 보기" 클릭 누적 수 (레거시 누적값, 보존)
  postShares?: Record<string, number>        // postId -> 공유 버튼 클릭 누적 수
  // 날짜별 클릭 — postViews가 날짜 없는 누적값이라 "최근 7일 인기"를 계산할 수 없었다.
  // postClicks[YYYY-MM-DD][postId][clickType] = 횟수
  postClicks?: Record<string, Record<string, Partial<Record<ClickType, number>>>>
}

function load(): AnalyticsData {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(FILE)) return { daily: {} }
  try { return JSON.parse(fs.readFileSync(FILE, 'utf-8')) }
  catch { return { daily: {} } }
}

function save(data: AnalyticsData) {
  // 30일 이전 데이터 정리
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  const cutoffStr = cutoff.toISOString().split('T')[0]
  for (const date of Object.keys(data.daily)) {
    if (date < cutoffStr) delete data.daily[date]
  }
  if (data.postClicks) {
    for (const date of Object.keys(data.postClicks)) {
      if (date < cutoffStr) delete data.postClicks[date]
    }
  }
  // 임시 파일에 쓴 뒤 rename — 쓰기 도중 프로세스가 죽어도 기존 파일이 손상되지 않는다.
  const tmp = `${FILE}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, FILE)
}


/**
 * 유입 경로 분류.
 *
 * 리퍼러만으로는 절반을 놓친다 — 인스타그램·카카오톡 인앱 브라우저는 리퍼러를 아예
 * 안 보내서, 우리 주력 유입이 "직접 방문"에 뭉쳐 버린다. 그래서 세 가지를 함께 본다.
 *   1) utm_source — 우리가 붙인 링크면 이게 가장 정확하다
 *   2) 리퍼러 도메인 — 검색·외부 사이트 유입
 *   3) 인앱 브라우저 표식(User-Agent의 "; wv)") — 리퍼러가 없어도 앱에서 왔다는 건 안다
 */
export type TrafficSource =
  | 'instagram' | 'kakao' | 'naver_search' | 'google_search' | 'other_search'
  | 'inapp' | 'external' | 'direct'

const SOURCE_LABEL: Record<TrafficSource, string> = {
  instagram: '인스타그램',
  kakao: '카카오톡',
  naver_search: '네이버 검색',
  google_search: '구글 검색',
  other_search: '기타 검색',
  inapp: '앱 내 브라우저(경로 미상)',
  external: '외부 사이트',
  direct: '직접 방문·북마크',
}

export function sourceLabel(s: string): string {
  return SOURCE_LABEL[s as TrafficSource] || s
}

export function classifySource(opts: {
  utmSource?: string | null
  referrer?: string | null
  userAgent?: string | null
}): { source: TrafficSource; detail: string | null } {
  const utm = (opts.utmSource || '').toLowerCase().trim()
  if (utm) {
    if (utm.includes('insta')) return { source: 'instagram', detail: utm }
    if (utm.includes('kakao') || utm.includes('talk')) return { source: 'kakao', detail: utm }
    if (utm.includes('naver')) return { source: 'naver_search', detail: utm }
    if (utm.includes('google')) return { source: 'google_search', detail: utm }
    return { source: 'external', detail: utm }
  }

  const ref = (opts.referrer || '').trim()
  let host = ''
  if (ref) {
    try { host = new URL(ref).hostname.replace(/^www\./, '') } catch { host = '' }
  }
  if (host && !host.endsWith('asknuggetdata.com')) {
    if (/instagram|cdninstagram|l\.facebook|fb\./.test(host)) return { source: 'instagram', detail: host }
    if (/kakao|daum/.test(host)) return { source: 'kakao', detail: host }
    if (/naver/.test(host)) return { source: 'naver_search', detail: host }
    if (/google/.test(host)) return { source: 'google_search', detail: host }
    if (/bing|duckduckgo|yahoo|zum\.com/.test(host)) return { source: 'other_search', detail: host }
    return { source: 'external', detail: host }
  }

  // 리퍼러가 없을 때 — 인앱 브라우저면 최소한 "앱에서 왔다"까지는 말할 수 있다
  const ua = opts.userAgent || ''
  if (/; wv\)|Instagram|KAKAOTALK|FBAN|FBAV|NAVER\(inapp/i.test(ua)) {
    if (/Instagram/i.test(ua)) return { source: 'instagram', detail: 'ua' }
    if (/KAKAOTALK/i.test(ua)) return { source: 'kakao', detail: 'ua' }
    return { source: 'inapp', detail: 'wv' }
  }
  return { source: 'direct', detail: null }
}

/** 최근 N일 유입 경로 집계 — 많은 순으로 */
export function getSourceCounts(days = 14): { source: string; label: string; count: number }[] {
  const data = load()
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]
  const total: Record<string, number> = {}
  for (const [date, day] of Object.entries(data.daily)) {
    if (date < cutoff) continue
    for (const [src, n] of Object.entries(day.sources || {})) {
      total[src] = (total[src] || 0) + n
    }
  }
  return Object.entries(total)
    .map(([source, count]) => ({ source, label: sourceLabel(source), count }))
    .sort((a, b) => b.count - a.count)
}

export function recordEvent(type: string, sessionId: string, opts?: { visitorId?: string; postId?: number; clickType?: ClickType; source?: string }) {
  const data = load()
  const today = new Date().toISOString().split('T')[0]
  if (!data.daily[today]) data.daily[today] = { visitors: 0, sessions: [], events: {} }
  const day = data.daily[today]

  if (type === 'view' && !day.sessions.includes(sessionId)) {
    day.sessions.push(sessionId)
    day.visitors = day.sessions.length
    // 유입 경로는 방문 1건당 한 번만 센다 — 같은 사람이 여러 페이지를 봐도 경로는 하나다
    if (opts?.source) {
      if (!day.sources) day.sources = {}
      day.sources[opts.source] = (day.sources[opts.source] || 0) + 1
    }
  }

  // 신규/재방문 판별 — sessionStorage 기반 sessionId는 탭마다 새로 생기므로, 브라우저에
  // localStorage로 영구 저장된 visitorId를 별도로 받아 "이 브라우저를 예전에도 봤는지"를 추적한다
  if (type === 'view' && opts?.visitorId) {
    const vid = opts.visitorId
    if (!day.visitorIds) day.visitorIds = []
    if (!day.visitorIds.includes(vid)) {
      day.visitorIds.push(vid)
      if (!data.visitorFirstSeen) data.visitorFirstSeen = {}
      const firstSeen = data.visitorFirstSeen[vid]
      if (!firstSeen) {
        data.visitorFirstSeen[vid] = today
        day.newVisitors = (day.newVisitors || 0) + 1
      } else if (firstSeen !== today) {
        day.returningVisitors = (day.returningVisitors || 0) + 1
      }
    }
  }

  if (type === 'join' && opts?.postId) {
    if (!data.postViews) data.postViews = {}
    const key = String(opts.postId)
    data.postViews[key] = (data.postViews[key] || 0) + 1
  }

  // 상품 클릭은 날짜·종류별로도 따로 쌓는다 (인기 순위·전환 분석용).
  // join은 예전부터 "공구 보러가기"를 뜻했으므로 clickType이 안 오면 groupbuy로 본다.
  if ((type === 'join' || type === 'click') && opts?.postId) {
    const clickType: ClickType = opts.clickType || 'groupbuy'
    if (!data.postClicks) data.postClicks = {}
    if (!data.postClicks[today]) data.postClicks[today] = {}
    const key = String(opts.postId)
    const forPost = data.postClicks[today][key] || (data.postClicks[today][key] = {})
    forPost[clickType] = (forPost[clickType] || 0) + 1
  }

  if (type === 'share' && opts?.postId) {
    if (!data.postShares) data.postShares = {}
    const key = String(opts.postId)
    data.postShares[key] = (data.postShares[key] || 0) + 1
  }

  day.events[type] = (day.events[type] || 0) + 1
  save(data)
}

export function getSummary(days = 14) {
  const data = load()
  const result = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    const day = data.daily[dateStr] || { visitors: 0, sessions: [], events: {} }
    result.push({
      date: dateStr,
      visitors: day.visitors,
      events: day.events,
      newVisitors: day.newVisitors || 0,
      returningVisitors: day.returningVisitors || 0,
    })
  }
  return result
}

export function getTopPosts(limit = 10): { postId: number; count: number }[] {
  const data = load()
  const views = data.postViews || {}
  return Object.entries(views)
    .map(([postId, count]) => ({ postId: parseInt(postId), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export function getTopSharedPosts(limit = 10): { postId: number; count: number }[] {
  const data = load()
  const shares = data.postShares || {}
  return Object.entries(shares)
    .map(([postId, count]) => ({ postId: parseInt(postId), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

/**
 * 최근 N일 클릭수를 상품별로 합산한다. postViews(누적)로는 기간을 자를 수 없어서
 * postClicks(날짜별)를 쓴다 — 그래서 이 함수는 postClicks가 쌓이기 시작한 날 이후의
 * 데이터만 본다. 도입 직후에는 결과가 비거나 적을 수 있고, 그건 정상이다.
 */
export function getClickCounts(days = 7, types?: ClickType[]): Record<number, number> {
  const data = load()
  const clicks = data.postClicks || {}
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - (days - 1))
  const cutoffStr = cutoff.toISOString().split('T')[0]

  const totals: Record<number, number> = {}
  for (const [date, byPost] of Object.entries(clicks)) {
    if (date < cutoffStr) continue
    for (const [postId, byType] of Object.entries(byPost)) {
      let sum = 0
      for (const [t, n] of Object.entries(byType)) {
        if (types && !types.includes(t as ClickType)) continue
        sum += n || 0
      }
      if (sum) totals[parseInt(postId)] = (totals[parseInt(postId)] || 0) + sum
    }
  }
  return totals
}

/** 최근 N일 클릭이 많은 순으로 상품 id를 돌려준다 */
export function getPopularPostIds(days = 7, limit = 12, types?: ClickType[]): number[] {
  return Object.entries(getClickCounts(days, types))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([postId]) => parseInt(postId))
}
