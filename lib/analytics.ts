import fs from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')
const FILE = path.join(DATA_DIR, 'analytics.json')

interface DayData {
  visitors: number
  sessions: string[]
  events: Record<string, number>
}

interface AnalyticsData {
  daily: Record<string, DayData>
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

export function recordEvent(type: string, sessionId: string) {
  const data = load()
  const today = new Date().toISOString().split('T')[0]
  if (!data.daily[today]) data.daily[today] = { visitors: 0, sessions: [], events: {} }
  const day = data.daily[today]

  if (type === 'view' && !day.sessions.includes(sessionId)) {
    day.sessions.push(sessionId)
    day.visitors = day.sessions.length
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
    })
  }
  return result
}
