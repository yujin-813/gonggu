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
}

interface AnalyticsData {
  daily: Record<string, DayData>
  visitorFirstSeen?: Record<string, string>  // visitorId -> 최초 방문일(YYYY-MM-DD)
  postViews?: Record<string, number>         // postId -> "공구 보기" 클릭 누적 수
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
  // 임시 파일에 쓴 뒤 rename — 쓰기 도중 프로세스가 죽어도 기존 파일이 손상되지 않는다.
  const tmp = `${FILE}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, FILE)
}

export function recordEvent(type: string, sessionId: string, opts?: { visitorId?: string; postId?: number }) {
  const data = load()
  const today = new Date().toISOString().split('T')[0]
  if (!data.daily[today]) data.daily[today] = { visitors: 0, sessions: [], events: {} }
  const day = data.daily[today]

  if (type === 'view' && !day.sessions.includes(sessionId)) {
    day.sessions.push(sessionId)
    day.visitors = day.sessions.length
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
