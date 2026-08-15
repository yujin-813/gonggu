import fs from 'fs'
import path from 'path'
import type { NextRequest } from 'next/server'

// 운영자 본인의 방문이 고객 통계에 섞이면 숫자를 믿을 수 없게 된다.
// 관리자 로그인 쿠키만으로는 다음 경우를 못 거른다.
//   - 세션이 12시간이라 만료된 뒤 둘러볼 때
//   - 로그아웃 상태로 고객 화면만 확인할 때
//   - 다른 브라우저·시크릿창·다른 기기로 볼 때
//
// 그래서 세 겹으로 막는다.
//   1) 로그인 쿠키 (app/api/analytics)         — 로그인 중인 브라우저
//   2) 관리자 흔적 쿠키 (아래 ADMIN_SEEN_COOKIE) — 한 번이라도 로그인한 브라우저, 1년
//   3) 관리자 IP 목록 (아래)                    — 같은 회선의 다른 브라우저·기기
//
// IP는 가장 넓게 걸리는 만큼 위험도 크다. 카페·회사처럼 여러 사람이 쓰는 회선에서
// 로그인하면 그 회선의 실제 고객까지 통계에서 빠진다. 그래서 기한을 두고 자동으로
// 만료시키고, 관리자 화면에서 목록을 확인·삭제할 수 있게 한다.

const DATA_DIR = path.join(process.cwd(), 'data')
const FILE = path.join(DATA_DIR, 'admin_ips.json')

/** 관리자 IP로 인정하는 기간 — 너무 길면 회선이 바뀐 뒤에도 남의 방문을 계속 지운다 */
export const ADMIN_IP_TTL_DAYS = 14

/** 한 번이라도 관리자로 로그인한 브라우저에 남기는 흔적. 로그인 세션과 별개로 오래 간다. */
export const ADMIN_SEEN_COOKIE = 'dj_admin_seen'
export const ADMIN_SEEN_MAX_AGE = 60 * 60 * 24 * 365

interface AdminIpRecord {
  ip: string
  lastSeen: string   // ISO
  hits: number
}

function load(): AdminIpRecord[] {
  if (!fs.existsSync(FILE)) return []
  try { return JSON.parse(fs.readFileSync(FILE, 'utf-8')) }
  catch { return [] }
}

function save(list: AdminIpRecord[]) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  const tmp = `${FILE}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2))
  fs.renameSync(tmp, FILE)
}

/**
 * 요청을 보낸 실제 클라이언트 IP.
 * nginx가 X-Forwarded-For를 붙여주는데, 프록시를 여러 번 거치면 값이 쉼표로 이어지므로
 * 맨 앞(원 클라이언트)만 쓴다.
 */
export function clientIp(request: NextRequest): string | null {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim() || null
  return request.headers.get('x-real-ip')?.trim() || null
}

function isFresh(rec: AdminIpRecord, now = Date.now()): boolean {
  const t = new Date(rec.lastSeen).getTime()
  if (Number.isNaN(t)) return false
  return now - t <= ADMIN_IP_TTL_DAYS * 86400_000
}

/** 관리자 로그인에 성공했을 때 그 IP를 기록한다 */
export function rememberAdminIp(ip: string | null) {
  if (!ip) return
  const now = new Date().toISOString()
  const list = load().filter(r => isFresh(r))
  const found = list.find(r => r.ip === ip)
  if (found) {
    found.lastSeen = now
    found.hits += 1
  } else {
    list.push({ ip, lastSeen: now, hits: 1 })
  }
  save(list)
}

/** 이 IP가 최근 관리자 로그인에 쓰였는지 */
export function isAdminIp(ip: string | null): boolean {
  if (!ip) return false
  const now = Date.now()
  return load().some(r => r.ip === ip && isFresh(r, now))
}

/** 관리자 화면에서 보여줄 목록 (만료된 건 빼고) */
export function listAdminIps(): AdminIpRecord[] {
  return load().filter(r => isFresh(r)).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
}

/** 잘못 등록된 IP(공용 와이파이 등)를 관리자가 직접 뺄 수 있게 한다 */
export function forgetAdminIp(ip: string) {
  save(load().filter(r => r.ip !== ip))
}
