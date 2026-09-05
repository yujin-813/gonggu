import { NextResponse } from 'next/server'
import { getTopSearchQueriesWithTrend } from '@/lib/analytics'

// 홈 화면 "인기 검색어" TOP 10 위젯용 — 고객 화면이라 middleware.ts에 보호 등록하지
// 않는다(집계된 검색어 텍스트일 뿐 개인정보 아님, /api/search-suggestions와 같은 원칙).
export const dynamic = 'force-dynamic'

export async function GET() {
  const items = getTopSearchQueriesWithTrend(7, 10)
  return NextResponse.json({ items })
}
