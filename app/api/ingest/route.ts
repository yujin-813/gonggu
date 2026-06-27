import { NextRequest, NextResponse } from 'next/server'
import { loadPosts, savePosts } from '@/lib/store'
import type { Post } from '@/lib/types'

// 로컬에서 수집한 공구를 받아 '신규만' 추가한다.
// 서버에 이미 있는 데이터(수동등록·검수상태)는 절대 건드리지 않는다.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const incoming: Post[] = Array.isArray(body.posts) ? body.posts : []
  if (incoming.length === 0) {
    return NextResponse.json({ error: 'posts 배열이 필요합니다' }, { status: 400 })
  }

  const existing = loadPosts()
  // 기존 식별자 집합 — 이미 있는 건 절대 덮어쓰지 않는다
  const seenShortcodes = new Set(existing.map(p => p.shortcode).filter(Boolean))
  const seenIds = new Set(existing.map(p => p.id))

  let added = 0
  let skipped = 0
  for (const p of incoming) {
    const dupByShortcode = p.shortcode && seenShortcodes.has(p.shortcode)
    const dupById = seenIds.has(p.id)
    if (dupByShortcode || dupById) {
      skipped++
      continue
    }
    // 신규는 검수 대기 상태로 추가 (관리자가 EC2에서 보완 후 공개)
    existing.unshift({ ...p, published: false })
    if (p.shortcode) seenShortcodes.add(p.shortcode)
    seenIds.add(p.id)
    added++
  }

  if (added > 0) savePosts(existing)

  return NextResponse.json({ added, skipped, total: existing.length })
}
