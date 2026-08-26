import { NextRequest, NextResponse } from 'next/server'
import { loadGrowthGoals, saveGrowthGoals } from '@/lib/store'

// 관리자 대시보드 "성장 목표" 단계(일 방문자 기준). 관리자만 보고 고친다 — 고객에게
// 보여줄 숫자가 아니라 미들웨어에서 GET도 함께 막는다.
// (미들웨어 matcher에 등록해 관리자 인증이 걸린다)

export async function GET() {
  return NextResponse.json(loadGrowthGoals())
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const stages = body?.stages
  if (!Array.isArray(stages) || stages.length === 0) {
    return NextResponse.json({ error: 'stages가 필요합니다' }, { status: 400 })
  }
  const clean = stages.map((n: unknown) => Number(n))
  if (clean.some(n => !Number.isFinite(n) || n <= 0)) {
    return NextResponse.json({ error: '모든 단계는 0보다 큰 숫자여야 합니다' }, { status: 400 })
  }
  for (let i = 1; i < clean.length; i++) {
    if (clean[i] <= clean[i - 1]) {
      return NextResponse.json({ error: '단계는 앞보다 커야 합니다' }, { status: 400 })
    }
  }
  saveGrowthGoals({ stages: clean })
  return NextResponse.json({ ok: true })
}
