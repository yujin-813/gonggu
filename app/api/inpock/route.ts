import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'
import { loadInpockStatus, saveInpockStatus, loadInfluencerSources } from '@/lib/store'

// 수집 상태 조회
export async function GET() {
  return NextResponse.json(loadInpockStatus())
}

// 수집 실행 — collector.py가 source_type에 따라 적절한 수집기로 라우팅한다.
export async function POST(request: NextRequest) {
  const influencerId = request.nextUrl.searchParams.get('id') || ''
  const status = loadInpockStatus()
  if (status.running) {
    return NextResponse.json({ error: '이미 수집 중입니다', status }, { status: 409 })
  }
  if (!influencerId && loadInfluencerSources().length === 0) {
    return NextResponse.json({ error: '등록된 인플루언서가 없습니다' }, { status: 400 })
  }

  const collectorPath = path.join(process.cwd(), 'collector.py')
  const venvPython = path.join(process.cwd(), 'venv', 'bin', 'python3')
  const python = existsSync(venvPython) ? venvPython : 'python3'

  saveInpockStatus({ running: true, last_run: null, last_count: 0, skipped_count: 0, error: null })

  const args = influencerId ? [collectorPath, '--id', influencerId] : [collectorPath]
  const proc = spawn(python, args, { cwd: process.cwd(), env: process.env })

  proc.on('close', (code) => {
    const s = loadInpockStatus()
    if (s.running) {
      saveInpockStatus({
        running: false,
        last_run: new Date().toISOString(),
        last_count: s.last_count || 0,
        skipped_count: s.skipped_count || 0,
        error: code !== 0 ? `프로세스 종료 코드: ${code}` : '수집기가 상태를 기록하지 못하고 종료됨',
      })
    }
  })

  proc.on('error', (err) => {
    saveInpockStatus({
      running: false,
      last_run: new Date().toISOString(),
      last_count: 0,
      skipped_count: 0,
      error: err.message,
    })
  })

  return NextResponse.json({ message: '수집 시작됨' })
}
