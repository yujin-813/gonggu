import { NextRequest, NextResponse } from 'next/server'
import { loadPosts, savePosts } from '@/lib/store'
import type { Post } from '@/lib/types'
import { enforcePurchaseLinkRequirement, syncPriceWithOptions, reconcileReviewReasons } from '@/lib/postGuards'
import { isPagePublic } from '@/lib/period'
import { pingIndexNow, postUrl } from '@/lib/indexnow'

// 가격·마감상태·공개 여부가 바뀌면 updated_at을 찍고 검색엔진에 알린다. 제목·이미지 같은
// 사소한 수정까지 매번 통보하면 진짜 중요한 변경(가격·마감)의 신호가 묻힌다.
const NOTIFY_FIELDS: (keyof Post)[] = ['price', 'deadline', 'published', 'status', 'ended_at']

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
  const allowed: (keyof Post)[] = ['published','status','review_reason','title','brand','group_key','market_url','market_price','market_price_note','purchase_url','is_always_on','is_evergreen_deal','sale_until_sold_out','is_exclusive_deal','extraction_debug','price','origPrice','start_date','deadline','cat','img','url','account','custom_verdict','custom_verdict_detail','custom_verdict_cls','partners_platform','partners_price','partners_url','partners_option_note','partners_checked_at','partners_visible','purchase_links','options','is_multi_option','is_featured','featured_order','compare_none_at','compare_none_reason','compare_none_note','ended_at','outreach_status','outreach_updated_at']
  const notifyChanged = NOTIFY_FIELDS.some(key => key in body)
  for (const key of allowed) {
    if (key in body) {
      (posts[idx] as unknown as Record<string, unknown>)[key] = body[key]
    }
  }
  posts[idx] = reconcileReviewReasons(syncPriceWithOptions(enforcePurchaseLinkRequirement(posts[idx])))
  if (notifyChanged) posts[idx].updated_at = new Date().toISOString()
  savePosts(posts)
  if (notifyChanged && isPagePublic(posts[idx])) pingIndexNow([postUrl(id)])
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
  const allowed: (keyof Post)[] = ['title','brand','group_key','market_url','market_price','market_price_note','purchase_url','is_always_on','is_evergreen_deal','sale_until_sold_out','is_exclusive_deal','extraction_debug','account','cat','price','origPrice','start_date','deadline','img','url','caption','published','status','review_reason','custom_verdict','custom_verdict_detail','custom_verdict_cls','partners_platform','partners_price','partners_url','partners_option_note','partners_checked_at','partners_visible','purchase_links','options','is_multi_option','is_featured','featured_order','compare_none_at','compare_none_reason','compare_none_note','ended_at','outreach_status','outreach_updated_at']
  const notifyChanged = NOTIFY_FIELDS.some(key => key in body)
  const patch: Partial<Post> = {}
  for (const key of allowed) {
    if (key in body) {
      (patch as Record<string, unknown>)[key] = body[key]
    }
  }
  posts[idx] = reconcileReviewReasons(syncPriceWithOptions(enforcePurchaseLinkRequirement({ ...posts[idx], ...patch, id })))
  if (notifyChanged) posts[idx].updated_at = new Date().toISOString()
  savePosts(posts)
  if (notifyChanged && isPagePublic(posts[idx])) pingIndexNow([postUrl(id)])
  return NextResponse.json({ success: true, post: posts[idx] })
}
