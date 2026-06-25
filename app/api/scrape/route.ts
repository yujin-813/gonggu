import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { loadScraperStatus, saveScraperStatus } from '@/lib/store'

export async function POST(request: NextRequest) {
  const status = loadScraperStatus()

  if (status.running) {
    return NextResponse.json({ error: '스크래퍼가 이미 실행 중입니다', status }, { status: 409 })
  }

  const body = await request.json().catch(() => ({}))
  const limit: number = body.limit || 30
  const hashtags: string[] | undefined = body.hashtags
  const profiles: string[] | undefined = body.profiles

  const scraperPath = path.join(process.cwd(), 'scraper.py')
  const args = ['--limit', String(limit)]
  if (hashtags?.length) args.push('--hashtag', ...hashtags)
  if (profiles?.length) args.push('--profile', ...profiles)

  saveScraperStatus({ running: true, last_run: null, last_count: 0, error: null })

  // .env.local 의 Instagram 자격증명을 스크래퍼 프로세스에 전달
  const childEnv = {
    ...process.env,
    INSTAGRAM_USERNAME: process.env.INSTAGRAM_USERNAME || '',
    INSTAGRAM_PASSWORD: process.env.INSTAGRAM_PASSWORD || '',
  }

  const proc = spawn('python3', [scraperPath, ...args], {
    cwd: process.cwd(),
    env: childEnv,
  })

  proc.on('close', (code) => {
    saveScraperStatus({
      running: false,
      last_run: new Date().toISOString(),
      last_count: 0,
      error: code !== 0 ? `프로세스 종료 코드: ${code}` : null,
    })
  })

  proc.on('error', (err) => {
    saveScraperStatus({
      running: false,
      last_run: new Date().toISOString(),
      last_count: 0,
      error: err.message,
    })
  })

  return NextResponse.json({ message: '스크래퍼 시작됨' })
}
