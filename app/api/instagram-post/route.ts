import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'

// 특정 인스타그램 게시글 URL(또는 숏코드)을 받아 동기적으로 수집한다.
// 단일 게시글이므로 보통 5~15초 안에 완료된다.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const url = String(body.url || '').trim()
  if (!url) {
    return NextResponse.json({ error: 'url이 필요합니다' }, { status: 400 })
  }

  const scraperPath = path.join(process.cwd(), 'scraper.py')
  const venvPython = path.join(process.cwd(), 'venv', 'bin', 'python3')
  const python = existsSync(venvPython) ? venvPython : 'python3'

  const childEnv = {
    ...process.env,
    INSTAGRAM_USERNAME: process.env.INSTAGRAM_USERNAME || '',
    INSTAGRAM_PASSWORD: process.env.INSTAGRAM_PASSWORD || '',
  }

  return new Promise<NextResponse>((resolve) => {
    let stdout = ''
    let stderr = ''

    const proc = spawn(python, [scraperPath, '--post', url], {
      cwd: process.cwd(),
      env: childEnv,
    })

    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })

    const timer = setTimeout(() => {
      proc.kill()
      resolve(NextResponse.json({ error: '타임아웃 (30초 초과)' }, { status: 504 }))
    }, 30000)

    proc.on('close', (code) => {
      clearTimeout(timer)
      if (stdout.includes('✅')) {
        resolve(NextResponse.json({ success: true, output: stdout.trim() }))
      } else if (stdout.includes('⚠️')) {
        resolve(NextResponse.json({ error: stdout.trim() }, { status: 409 }))
      } else {
        resolve(NextResponse.json(
          { error: stderr.trim() || stdout.trim() || `프로세스 종료 코드: ${code}` },
          { status: 500 },
        ))
      }
    })

    proc.on('error', (err: Error) => {
      clearTimeout(timer)
      resolve(NextResponse.json({ error: err.message }, { status: 500 }))
    })
  })
}
