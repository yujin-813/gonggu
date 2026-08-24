import fs from 'fs'
import path from 'path'

// 인플루언서·브랜드가 "우리 공구도 올려주세요" "제휴하고 싶어요"라고 생각해도 연락할 곳이
// 없었다. /request(app/api/posts/request)는 "이 공구 하나를 등록해 주세요"용이라 구매
// 링크·가격이 필수다 — 아직 판매 페이지가 없는 제휴 제안은 못 받는다. 이건 별도 창구다.

const DATA_DIR = path.join(process.cwd(), 'data')
const FILE = path.join(DATA_DIR, 'inquiries.json')

export type InquiryKind = 'influencer' | 'brand' | 'company'

export interface Inquiry {
  id: string
  kind: InquiryKind
  name: string
  contact: string
  link?: string | null
  product?: string | null
  message: string
  createdAt: string
  /** 이메일 발송 성공 여부 — 실패해도 데이터는 남는다. 관리자 목록이 최종 백업이다 */
  emailed: boolean
  /** 관리자가 확인·응답했는지 — 목록이 계속 쌓이기만 하면 뭐가 새 건지 알 수 없다 */
  handled: boolean
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

export function loadInquiries(): Inquiry[] {
  ensureDir()
  if (!fs.existsSync(FILE)) return []
  try { return JSON.parse(fs.readFileSync(FILE, 'utf-8')) }
  catch { return [] }
}

export function saveInquiries(list: Inquiry[]) {
  ensureDir()
  const tmp = `${FILE}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2))
  fs.renameSync(tmp, FILE)
}

export function addInquiry(input: Omit<Inquiry, 'id' | 'createdAt' | 'handled'> & { emailed: boolean }): Inquiry {
  const list = loadInquiries()
  const inquiry: Inquiry = {
    ...input,
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    handled: false,
  }
  list.unshift(inquiry)
  saveInquiries(list)
  return inquiry
}

export function markHandled(id: string, handled: boolean): boolean {
  const list = loadInquiries()
  const item = list.find(i => i.id === id)
  if (!item) return false
  item.handled = handled
  saveInquiries(list)
  return true
}
