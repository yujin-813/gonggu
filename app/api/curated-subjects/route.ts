import { NextRequest, NextResponse } from 'next/server'
import { loadCuratedSubjects, saveCuratedSubjects } from '@/lib/store'
import type { CuratedSubject } from '@/lib/types'

// 고객 화면(/pick, /pick/:slug)은 enabled만 봐야 하고, 관리자 화면(admin=1)은 비활성화된
// 것도 관리할 수 있어야 한다 — /api/collections와 같은 패턴
export async function GET(request: NextRequest) {
  const adminMode = request.nextUrl.searchParams.get('admin') === '1'
  let subjects = loadCuratedSubjects()
  if (!adminMode) subjects = subjects.filter(s => s.enabled)
  return NextResponse.json({ subjects })
}

export async function POST(request: NextRequest) {
  const data = await request.json()
  if (!data.label || !data.kind || !data.matchValue) {
    return NextResponse.json({ error: '필수 필드 누락: label, kind, matchValue' }, { status: 400 })
  }
  if (!['brand', 'influencer', 'seller'].includes(data.kind)) {
    return NextResponse.json({ error: 'kind는 brand/influencer/seller 중 하나여야 합니다' }, { status: 400 })
  }

  const subjects = loadCuratedSubjects()
  const slug = (data.slug?.trim() || data.label).trim()
  if (subjects.some(s => s.slug === slug)) {
    return NextResponse.json({ error: `이미 존재하는 slug입니다: ${slug}` }, { status: 409 })
  }

  const newSubject: CuratedSubject = {
    slug,
    label: data.label.trim(),
    kind: data.kind,
    matchField: data.kind === 'brand' ? 'brand' : 'influencer_name',
    matchValue: data.matchValue.trim(),
    enabled: true,
    added_at: new Date().toISOString(),
  }
  subjects.unshift(newSubject)
  saveCuratedSubjects(subjects)
  return NextResponse.json({ success: true, subject: newSubject }, { status: 201 })
}
