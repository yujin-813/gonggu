import { NextRequest, NextResponse } from 'next/server'
import { upsertSubscription, removeSubscription } from '@/lib/push'

export async function POST(request: NextRequest) {
  try {
    const { visitorId, subscription, bookmarkedPostIds } = await request.json()
    if (!visitorId || !subscription) return NextResponse.json({ error: 'missing' }, { status: 400 })
    upsertSubscription(visitorId, subscription, Array.isArray(bookmarkedPostIds) ? bookmarkedPostIds : [])
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { visitorId } = await request.json()
    if (!visitorId) return NextResponse.json({ error: 'missing' }, { status: 400 })
    removeSubscription(visitorId)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'server error' }, { status: 500 })
  }
}
