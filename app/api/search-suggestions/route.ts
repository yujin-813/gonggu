import { NextResponse } from 'next/server'
import { getTopSearchQueries } from '@/lib/analytics'
import { kstToday, kstDateOffset } from '@/lib/kst'

// 홈 검색창 자동완성용 — 최근 30일 인기 검색어를 고객 화면에 그대로 보여준다(집계된
// 검색어 텍스트일 뿐 개인정보가 아니다). 관리자 전용 /api/analytics와 달리 이건
// 고객이 직접 쓰는 화면이라 middleware.ts에 보호 등록하지 않는다 — 항상 공개.
export const dynamic = 'force-dynamic'

export async function GET() {
  const queries = getTopSearchQueries(kstDateOffset(29), kstToday(), 10).map(q => q.query)
  return NextResponse.json({ queries })
}
