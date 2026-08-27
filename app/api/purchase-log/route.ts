import { NextRequest, NextResponse } from 'next/server'
import { loadPurchaseLog, savePurchaseLog } from '@/lib/store'
import type { PurchaseRecord } from '@/lib/types'

// 실제 구매 기록 — 관리자가 쿠팡·네이버 파트너스 대시보드를 보고 손으로 남긴다.
// 자동 감지가 아니다(그런 API가 없다, 원칙 2). 관리자 전용이라 GET도 막는다.
// (미들웨어 matcher에 등록해 관리자 인증이 걸린다)

export async function GET() {
  return NextResponse.json({ records: loadPurchaseLog() })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body || !body.postId || !body.postTitle || !body.linkType) {
    return NextResponse.json({ error: 'postId·postTitle·linkType이 필요합니다' }, { status: 400 })
  }
  const now = new Date().toISOString()
  const record: PurchaseRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    postId: Number(body.postId),
    postTitle: String(body.postTitle),
    source: String(body.source || ''),
    linkType: body.linkType,
    endedAtPurchase: Boolean(body.endedAtPurchase),
    orderAmount: Number(body.orderAmount) || 0,
    revenue: Number(body.revenue) || 0,
    note: body.note ? String(body.note) : undefined,
    purchasedAt: body.purchasedAt || now.slice(0, 10),
    recordedAt: now,
  }
  const records = loadPurchaseLog()
  records.push(record)
  savePurchaseLog(records)
  return NextResponse.json({ ok: true, record }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json().catch(() => ({ id: '' }))
  if (!id) return NextResponse.json({ error: 'id가 필요합니다' }, { status: 400 })
  const records = loadPurchaseLog().filter(r => r.id !== id)
  savePurchaseLog(records)
  return NextResponse.json({ ok: true })
}
