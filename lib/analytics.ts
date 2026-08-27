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
// 같은 판단을 할 수 있다. groupbuy=공구 보러가기, coupang/naver=대체 구매처, detail=상세 조회,
// calendar=캘린더에 담기(구매·수수료와 무관 — 'other'에 섞이면 "구매처 클릭률"이 오염된다)
export type ClickType = 'groupbuy' | 'coupang' | 'naver' | 'other' | 'detail' | 'calendar'

export const CLICK_TYPES: ClickType[] = ['groupbuy', 'coupang', 'naver', 'other', 'detail', 'calendar']

interface AnalyticsData {
  daily: Record<string, DayData>
  visitorFirstSeen?: Record<string, string>  // visitorId -> 최초 방문일(YYYY-MM-DD)
  postViews?: Record<string, number>         // postId -> "공구 보기" 클릭 누적 수 (레거시 누적값, 보존)
  postShares?: Record<string, number>        // postId -> 공유 버튼 클릭 누적 수
  // 날짜별 클릭 — postViews가 날짜 없는 누적값이라 "최근 7일 인기"를 계산할 수 없었다.
  // postClicks[YYYY-MM-DD][postId][clickType] = 횟수
  postClicks?: Record<string, Record<string, Partial<Record<ClickType, number>>>>
  /**
   * 상품별 유입 경로 — postSources[YYYY-MM-DD][postId][TrafficSource] = 횟수.
   *
   * daily[날짜].sources는 방문 단위라 "이 상품을 검색으로 몇 명이 봤나"를 답하지 못한다.
   * 관리자 수익화 화면에서 "검색으로 들어오는데 살 곳이 없는 상품"을 찾으려면 상품과 경로가
   * 묶여 있어야 한다. 상세 페이지가 열릴 때 찍는 detail 클릭에 그 방문의 유입 경로를 함께 센다.
   *
   * 경로는 "그 방문이 처음 들어온 곳"이다(track.ts가 세션에 고정한다). 홈에 검색으로 들어와
   * 상세로 넘어간 것도 검색으로 잡힌다 — 그 사람을 데려온 건 검색이 맞다.
   */
  postSources?: Record<string, Record<string, Record<string, number>>>
  /**
   * 최근 방문의 개별 동작 — 집계만으로는 못 보는 것을 본다.
   *
   * daily.sources는 "네이버 74건"까지만 알려주고, 그 74명이 **들어와서 뭘 하고 나갔는지**는
   * 답하지 못한다. 세션을 따라가 보려면 사건이 순서대로 남아 있어야 한다.
   *
   * 링 버퍼로 최근 것만 들고 있는다. 하루 이벤트가 40건이라 300건이면 대략 일주일치이고
   * 파일은 50KB쯤 는다. 오래 보관할 값이 아니다 — 추세는 daily가 이미 갖고 있다.
   *
   * 필드 이름을 한 글자로 줄인 건 같은 구조가 300번 반복되기 때문이다.
   * at=시각 · s=세션 · v=방문자 · t=종류 · p=상품 · c=클릭종류 · src=유입경로
   */
  recent?: RecentEvent[]
}

export interface RecentEvent {
  at: string
  s: string
  v?: string
  t: string
  p?: number
  c?: ClickType
  src?: string
}

const RECENT_LIMIT = 300

function load(): AnalyticsData {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(FILE)) return { daily: {} }
  try { return JSON.parse(fs.readFileSync(FILE, 'utf-8')) }
  catch { return { daily: {} } }
}

function save(data: AnalyticsData) {
  // 예전엔 30일이 지난 daily·postClicks·postSources를 여기서 지웠다. 지금 화면은 전부
  // 최근 N일만 잘라 보여주니 당장은 안 보이지만, 나중에 "몇 달 전엔 어땠나"를 보려 해도
  // 이미 사라진 뒤였다 — 날짜별 조회수·클릭수는 지우지 않고 계속 쌓는다(D-065).
  // 각 조회 함수(getSummary 등)가 스스로 최근 N일만 잘라 쓰므로 오래 쌓여도 계산량엔
  // 영향이 없다. recent(세션 단위 최근 이벤트 링 버퍼)는 원래도 날짜가 아니라 개수로
  // 제한하므로 그대로 둔다.

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
  // 오픈 예정 공구를 캘린더에 담아 둔 사람이 그날 다시 들어온 것 — 그 기능이 실제로
  // 사람을 데려오는지 재려면 external과 섞이면 안 된다
  | 'calendar'
  | 'inapp' | 'external' | 'direct'

const SOURCE_LABEL: Record<TrafficSource, string> = {
  instagram: '인스타그램',
  kakao: '카카오톡',
  naver_search: '네이버 검색',
  calendar: '캘린더 알림',
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
    if (utm.includes('calendar')) return { source: 'calendar', detail: utm }
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

  // 상세 페이지 조회에 유입 경로를 함께 남긴다 — 상품별로 "어디서 왔나"를 알아야
  // 살 곳이 없는데 검색 유입만 받는 상품을 찾을 수 있다
  if (type === 'click' && opts?.clickType === 'detail' && opts?.postId && opts?.source) {
    if (!data.postSources) data.postSources = {}
    const forDay = data.postSources[today] || (data.postSources[today] = {})
    const forPost = forDay[String(opts.postId)] || (forDay[String(opts.postId)] = {})
    forPost[opts.source] = (forPost[opts.source] || 0) + 1
  }

  if (type === 'share' && opts?.postId) {
    if (!data.postShares) data.postShares = {}
    const key = String(opts.postId)
    data.postShares[key] = (data.postShares[key] || 0) + 1
  }

  day.events[type] = (day.events[type] || 0) + 1

  // 개별 사건도 최근 것만 남긴다 — 세션 흐름을 따라가려면 순서가 있어야 한다
  if (!data.recent) data.recent = []
  data.recent.push({
    at: new Date().toISOString(),
    s: sessionId,
    ...(opts?.visitorId ? { v: opts.visitorId } : {}),
    t: type,
    ...(opts?.postId ? { p: opts.postId } : {}),
    ...(opts?.clickType ? { c: opts.clickType } : {}),
    ...(opts?.source ? { src: opts.source } : {}),
  })
  if (data.recent.length > RECENT_LIMIT) data.recent = data.recent.slice(-RECENT_LIMIT)

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

/** 최근 N일 상품별 클릭을 종류까지 나눠서 — 관리자 수익화 화면이 한 표로 보여주는 데 쓴다 */
export function getClickBreakdown(days = 14): Record<number, Partial<Record<ClickType, number>>> {
  const data = load()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - (days - 1))
  const cutoffStr = cutoff.toISOString().split('T')[0]

  const out: Record<number, Partial<Record<ClickType, number>>> = {}
  for (const [date, byPost] of Object.entries(data.postClicks || {})) {
    if (date < cutoffStr) continue
    for (const [postId, byType] of Object.entries(byPost)) {
      const id = parseInt(postId)
      const row = out[id] || (out[id] = {})
      for (const [t, n] of Object.entries(byType)) {
        row[t as ClickType] = (row[t as ClickType] || 0) + (n || 0)
      }
    }
  }
  return out
}

/** 최근 N일 상품별 유입 경로 — postSources를 합산한다 */
export function getPostSourceCounts(days = 14): Record<number, Record<string, number>> {
  const data = load()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - (days - 1))
  const cutoffStr = cutoff.toISOString().split('T')[0]

  const out: Record<number, Record<string, number>> = {}
  for (const [date, byPost] of Object.entries(data.postSources || {})) {
    if (date < cutoffStr) continue
    for (const [postId, bySource] of Object.entries(byPost)) {
      const id = parseInt(postId)
      const row = out[id] || (out[id] = {})
      for (const [src, n] of Object.entries(bySource)) row[src] = (row[src] || 0) + (n || 0)
    }
  }
  return out
}

/**
 * 최근 방문을 세션 단위로 묶어 돌려준다 — 관리자 「데이터」 화면용.
 *
 * 한 사람이 들어와서 무엇을 했는지가 한 줄이어야 읽힌다. 이벤트 목록만 나열하면
 * 누구 것인지 알 수 없다.
 */
export function getRecentSessions(limit = 40): {
  sessionId: string
  visitorId: string | null
  startedAt: string
  lastAt: string
  source: string | null
  isReturning: boolean
  pageViews: number
  events: RecentEvent[]
}[] {
  const data = load()
  const bySession = new Map<string, RecentEvent[]>()
  for (const e of data.recent || []) {
    const list = bySession.get(e.s) || []
    list.push(e)
    bySession.set(e.s, list)
  }
  const firstSeen = data.visitorFirstSeen || {}
  return [...bySession.entries()]
    .map(([sessionId, events]) => {
      const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at))
      const vid = sorted.find(e => e.v)?.v
      const day = sorted[0].at.slice(0, 10)
      return {
        sessionId,
        visitorId: vid ?? null,
        startedAt: sorted[0].at,
        lastAt: sorted[sorted.length - 1].at,
        source: sorted.find(e => e.src)?.src ?? null,
        // view는 어느 페이지인지 안 남아서 타임라인에 점으로 찍을 게 없다 — 개수만 센다
        pageViews: sorted.filter(e => e.t === 'view').length,
        // 이 방문자를 오늘 이전에 본 적이 있으면 재방문이다
        isReturning: !!vid && !!firstSeen[vid] && firstSeen[vid] < day,
        events: sorted,
      }
    })
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
    .slice(0, limit)
}

/** 최근 N일 클릭이 많은 순으로 상품 id를 돌려준다 */
export function getPopularPostIds(days = 7, limit = 12, types?: ClickType[]): number[] {
  return Object.entries(getClickCounts(days, types))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([postId]) => parseInt(postId))
}
