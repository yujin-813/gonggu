import { NextRequest, NextResponse } from 'next/server'
import { recordEvent, getSummary } from '@/lib/analytics'

export async function POST(request: NextRequest) {
  try {
    const { type, sessionId } = await request.json()
    if (!type || !sessionId) return NextResponse.json({ error: 'missing' }, { status: 400 })
    const allowed = new Set(['view', 'bookmark', 'join', 'category', 'search'])
    if (!allowed.has(type)) return NextResponse.json({ error: 'invalid type' }, { status: 400 })
    recordEvent(type, sessionId)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'server error' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json(getSummary(14))
}
