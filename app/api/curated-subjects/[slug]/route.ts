import { NextRequest, NextResponse } from 'next/server'
import { loadCuratedSubjects, saveCuratedSubjects } from '@/lib/store'
import type { CuratedSubject } from '@/lib/types'

type Ctx = { params: { slug: string } }

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const body = await request.json()
  const subjects = loadCuratedSubjects()
  const idx = subjects.findIndex(s => s.slug === params.slug)
  if (idx === -1) return NextResponse.json({ error: '공구 모음 대상을 찾을 수 없습니다' }, { status: 404 })

  const allowed: (keyof CuratedSubject)[] = ['label', 'matchValue', 'enabled']
  const patch: Partial<CuratedSubject> = {}
  for (const key of allowed) {
    if (key in body) (patch as Record<string, unknown>)[key] = body[key]
  }
  subjects[idx] = { ...subjects[idx], ...patch }
  saveCuratedSubjects(subjects)
  return NextResponse.json({ success: true, subject: subjects[idx] })
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const subjects = loadCuratedSubjects()
  const filtered = subjects.filter(s => s.slug !== params.slug)
  if (filtered.length === subjects.length) {
    return NextResponse.json({ error: '공구 모음 대상을 찾을 수 없습니다' }, { status: 404 })
  }
  saveCuratedSubjects(filtered)
  return NextResponse.json({ success: true })
}
