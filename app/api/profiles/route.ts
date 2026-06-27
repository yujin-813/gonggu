import { NextRequest, NextResponse } from 'next/server'
import { loadProfiles, saveProfiles } from '@/lib/store'

// 인스타 핸들 정규화: URL이 들어와도 핸들만 뽑아낸다.
function normalizeHandle(input: string): string {
  let h = input.trim()
  const m = h.match(/instagram\.com\/([^/?#]+)/)
  if (m) h = m[1]
  return h.replace(/^@/, '').trim()
}

export async function GET() {
  return NextResponse.json({ profiles: loadProfiles() })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const handle = normalizeHandle(String(body.handle || ''))
  if (!handle) {
    return NextResponse.json({ error: '인스타 계정을 입력하세요' }, { status: 400 })
  }

  const profiles = loadProfiles()
  if (profiles.includes(handle)) {
    return NextResponse.json({ error: '이미 등록된 계정입니다' }, { status: 409 })
  }

  profiles.push(handle)
  saveProfiles(profiles)
  return NextResponse.json({ success: true, handle }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const handle = normalizeHandle(request.nextUrl.searchParams.get('handle') || '')
  if (!handle) {
    return NextResponse.json({ error: '계정이 필요합니다' }, { status: 400 })
  }
  const profiles = loadProfiles()
  const filtered = profiles.filter(h => h !== handle)
  if (filtered.length === profiles.length) {
    return NextResponse.json({ error: '계정을 찾을 수 없습니다' }, { status: 404 })
  }
  saveProfiles(filtered)
  return NextResponse.json({ success: true })
}
