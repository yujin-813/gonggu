import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'
import { loadInpockStatus, saveInpockStatus, loadInpockSources } from '@/lib/store'

// 수집 상태 조회
export async function GET() {
  return NextResponse.json(loadInpockStatus())
}

// 수집 실행 — 인포크는 차단이 없어 서버(EC2)에서 직접 긁는다.
export async function POST() {
  const status = loadInpockStatus()
  if (status.running) {
    return NextResponse.json({ error: '이미 수집 중입니다', status }, { status: 409 })
  }
  if (loadInpockSources().length === 0) {
    return NextResponse.json({ error: '등록된 인플루언서가 없습니다' }, { status: 400 })
  }

  const scriptPath = path.join(process.cwd(), 'inpock.py')
  const venvPython = path.join(process.cwd(), 'venv', 'bin', 'python3')
  const python = existsSync(venvPython) ? venvPython : 'python3'

  saveInpockStatus({ running: true, last_run: null, last_count: 0, skipped_count: 0, error: null })

  const proc = spawn(python, [scriptPath], { cwd: process.cwd(), env: process.env })

  proc.on('close', (code) => {
    // inpock.py가 정상 종료하면 자신이 inpock_status.json에 결과를 기록한다(running:false).
    // 여전히 running:true면 비정상 종료이므로 여기서 정리한다.
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

  return NextResponse.json({ message: '인포크 수집 시작됨' })
}
