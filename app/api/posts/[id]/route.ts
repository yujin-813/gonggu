import { NextRequest, NextResponse } from 'next/server'
import { loadPosts, savePosts } from '@/lib/store'
import type { Post } from '@/lib/types'

type Ctx = { params: { id: string } }

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const id = parseInt(params.id)
  const posts = loadPosts()
  const filtered = posts.filter(p => p.id !== id)
  if (filtered.length === posts.length) {
    return NextResponse.json({ error: '게시글을 찾을 수 없습니다' }, { status: 404 })
  }
  savePosts(filtered)
  return NextResponse.json({ success: true })
}

// published 토글 또는 일부 필드 업데이트
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const id   = parseInt(params.id)
  const body = await request.json()
  const posts = loadPosts()
  const idx  = posts.findIndex(p => p.id === id)
  if (idx === -1) {
    return NextResponse.json({ error: '게시글을 찾을 수 없습니다' }, { status: 404 })
  }
  const allowed: (keyof Post)[] = ['published','status','review_reason','title','brand','group_key','market_url','purchase_url','is_always_on','is_evergreen_deal','sale_until_sold_out','extraction_debug','price','origPrice','start_date','deadline','cat','img','url','account','custom_verdict','custom_verdict_detail','custom_verdict_cls']
  for (const key of allowed) {
    if (key in body) {
      (posts[idx] as unknown as Record<string, unknown>)[key] = body[key]
    }
  }
  savePosts(posts)
  return NextResponse.json({ success: true, post: posts[idx] })
}

// 전체 수정 (allowlist 적용으로 임의 필드 주입 방지)
export async function PUT(request: NextRequest, { params }: Ctx) {
  const id   = parseInt(params.id)
  const body = await request.json()
  const posts = loadPosts()
  const idx  = posts.findIndex(p => p.id === id)
  if (idx === -1) {
    return NextResponse.json({ error: '게시글을 찾을 수 없습니다' }, { status: 404 })
  }
  const allowed: (keyof Post)[] = ['title','brand','group_key','market_url','purchase_url','is_always_on','is_evergreen_deal','sale_until_sold_out','extraction_debug','account','cat','price','origPrice','start_date','deadline','img','url','caption','published','status','review_reason','custom_verdict','custom_verdict_detail','custom_verdict_cls']
  const patch: Partial<Post> = {}
  for (const key of allowed) {
    if (key in body) {
      (patch as Record<string, unknown>)[key] = body[key]
    }
  }
  posts[idx] = { ...posts[idx], ...patch, id }
  savePosts(posts)
  return NextResponse.json({ success: true, post: posts[idx] })
}
