import { NextRequest, NextResponse } from 'next/server'
import { listAdminIps, forgetAdminIp, clientIp, ADMIN_IP_TTL_DAYS } from '@/lib/adminTrace'

// 관리자 IP 목록 조회·삭제. IP 제외는 가장 넓게 걸리는 만큼 오탐도 크다 —
// 카페·회사처럼 여러 사람이 쓰는 회선에서 로그인했다면 그 회선의 실제 고객까지 통계에서
// 빠지므로, 목록을 눈으로 보고 직접 뺄 수 있어야 한다.
// (미들웨어 matcher에 등록해 관리자 인증이 걸린다)

export async function GET(request: NextRequest) {
  return NextResponse.json({
    ips: listAdminIps(),
    ttlDays: ADMIN_IP_TTL_DAYS,
    currentIp: clientIp(request),
  })
}

export async function DELETE(request: NextRequest) {
  const { ip } = await request.json().catch(() => ({ ip: '' }))
  if (!ip || typeof ip !== 'string') {
    return NextResponse.json({ error: 'ip가 필요합니다' }, { status: 400 })
  }
  forgetAdminIp(ip)
  return NextResponse.json({ ok: true })
}
