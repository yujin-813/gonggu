import { NextRequest, NextResponse } from 'next/server'
import { recordEvent, getSummary, getTopPosts } from '@/lib/analytics'
import { loadPosts } from '@/lib/store'

export async function POST(request: NextRequest) {
  try {
    const { type, sessionId, visitorId, postId } = await request.json()
    if (!type || !sessionId) return NextResponse.json({ error: 'missing' }, { status: 400 })
    const allowed = new Set(['view', 'bookmark', 'join', 'category', 'search'])
    if (!allowed.has(type)) return NextResponse.json({ error: 'invalid type' }, { status: 400 })
    recordEvent(type, sessionId, { visitorId, postId })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'server error' }, { status: 500 })
  }
}

export async function GET() {
  const summary = getSummary(14)
  const top = getTopPosts(10)
  const posts = loadPosts()
  const topPosts = top
    .map(({ postId, count }) => {
      const post = posts.find(p => p.id === postId)
      if (!post) return null
      return { id: postId, title: post.title, img: post.img || null, price: post.price, count }
    })
    .filter(Boolean)
  return NextResponse.json({ summary, topPosts })
}
