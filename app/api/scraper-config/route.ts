import { NextRequest, NextResponse } from 'next/server'
import { loadScraperConfig, saveScraperConfig } from '@/lib/store'

export async function GET() {
  return NextResponse.json(loadScraperConfig())
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const { type, keyword } = body

  if (!type || !keyword?.trim()) {
    return NextResponse.json({ error: '타입과 키워드를 입력하세요' }, { status: 400 })
  }
  if (type !== 'include' && type !== 'exclude') {
    return NextResponse.json({ error: 'type은 include 또는 exclude여야 합니다' }, { status: 400 })
  }

  const config = loadScraperConfig()
  const key = type === 'include' ? 'include_keywords' : 'exclude_keywords'
  const kw = keyword.trim()

  if (config[key].includes(kw)) {
    return NextResponse.json({ error: '이미 등록된 키워드입니다' }, { status: 409 })
  }

  config[key].push(kw)
  saveScraperConfig(config)
  return NextResponse.json({ success: true }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type')
  const keyword = request.nextUrl.searchParams.get('keyword')

  if (!type || !keyword) {
    return NextResponse.json({ error: '타입과 키워드가 필요합니다' }, { status: 400 })
  }

  const config = loadScraperConfig()
  const key = type === 'include' ? 'include_keywords' : 'exclude_keywords'
  config[key] = config[key].filter(k => k !== keyword)
  saveScraperConfig(config)
  return NextResponse.json({ success: true })
}
