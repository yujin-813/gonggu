import { NextRequest, NextResponse } from 'next/server'
import { loadInpockSources, saveInpockSources } from '@/lib/store'

// 인포크 핸들 정규화: URL이 들어와도 핸들만 뽑아낸다.
function normalizeHandle(input: string): string {
  let h = input.trim()
  const m = h.match(/inpock\.co\.kr\/([^/?#]+)/)
  if (m) h = m[1]
  return h.replace(/^@/, '').trim()
}

export async function GET() {
  return NextResponse.json({ sources: loadInpockSources() })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const handle = normalizeHandle(String(body.handle || ''))
  if (!handle) {
    return NextResponse.json({ error: '인포크 핸들 또는 링크를 입력하세요' }, { status: 400 })
  }

  const sources = loadInpockSources()
  if (sources.includes(handle)) {
    return NextResponse.json({ error: '이미 등록된 인플루언서입니다' }, { status: 409 })
  }

  sources.push(handle)
  saveInpockSources(sources)
  return NextResponse.json({ success: true, handle }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const handle = normalizeHandle(request.nextUrl.searchParams.get('handle') || '')
  if (!handle) {
    return NextResponse.json({ error: '핸들이 필요합니다' }, { status: 400 })
  }
  const sources = loadInpockSources()
  const filtered = sources.filter(h => h !== handle)
  if (filtered.length === sources.length) {
    return NextResponse.json({ error: '소스를 찾을 수 없습니다' }, { status: 404 })
  }
  saveInpockSources(filtered)
  return NextResponse.json({ success: true })
}
