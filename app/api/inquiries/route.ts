import { NextRequest, NextResponse } from 'next/server'
import { loadInquiries, addInquiry, markHandled } from '@/lib/inquiries'
import { sendInquiryEmail } from '@/lib/mailer'

// 공개 제안 창구 — 로그인 없이 누구나 호출 가능하다(middleware 보호 대상 아님, GET만 보호).
// /api/posts/request와 달리 구매 링크·가격을 안 받는다 — 아직 판매 페이지가 없는 제휴
// 제안(브랜드가 "이런 상품이 있는데 공구해 볼래요?")도 여기로는 들어와야 한다.
export async function POST(request: NextRequest) {
  const data = await request.json().catch(() => null)
  if (!data) return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 })

  // 스팸봇용 허니팟 — /api/posts/request와 같은 방식
  if (typeof data.website === 'string' && data.website.trim()) {
    return NextResponse.json({ success: true })
  }

  const email = (data.email || '').toString().trim().slice(0, 200)
  const contact = (data.contact || '').toString().trim().slice(0, 200)
  const message = (data.message || '').toString().trim().slice(0, 2000)

  if (!email || !contact) {
    return NextResponse.json({ error: '이메일과 연락처를 입력해주세요' }, { status: 400 })
  }
  if (!message) {
    return NextResponse.json({ error: '제휴 내용을 입력해주세요' }, { status: 400 })
  }

  // 저장이 먼저다 — 메일 서버가 죽어도 문의는 안 사라져야 한다
  const emailed = await sendInquiryEmail({ email, contact, message })
  addInquiry({ email, contact, message, emailed })

  return NextResponse.json({ success: true })
}

// 관리자만 — middleware.ts의 isProtected()/matcher에 /api/inquiries 등록돼 있어야 한다
export async function GET() {
  return NextResponse.json({ inquiries: loadInquiries() })
}

export async function PATCH(request: NextRequest) {
  const data = await request.json().catch(() => null)
  const id = typeof data?.id === 'string' ? data.id : ''
  if (!id) return NextResponse.json({ error: 'id가 필요합니다' }, { status: 400 })
  const ok = markHandled(id, data.handled !== false)
  if (!ok) return NextResponse.json({ error: '문의를 찾을 수 없습니다' }, { status: 404 })
  return NextResponse.json({ success: true })
}
