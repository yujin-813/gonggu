import { NextRequest, NextResponse } from 'next/server'
import { loadPosts, savePosts } from '@/lib/store'
import type { Post } from '@/lib/types'
import { daysLeft } from '@/lib/period'

const CAT_EMOJI: Record<string, string> = {
  fashion: '👗', beauty: '💄', food: '🍱', life: '🏠',
  kids: '🧸', health: '💊', pet: '🐾', digital: '📱',
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const cat      = searchParams.get('cat')
  const search   = (searchParams.get('q') || '').toLowerCase()
  const sort     = searchParams.get('sort') || 'latest'
  const page     = parseInt(searchParams.get('page') || '1')
  const perPage  = parseInt(searchParams.get('per_page') || '50')
  const adminMode = searchParams.get('admin') === '1'

  let posts = loadPosts()

  // 고객 페이지: published + upcoming 포함, 마감일 미경과
  if (!adminMode) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    posts = posts.filter(p => {
      if (p.status === 'upcoming' && p.published !== false) return true  // 오픈 예정 (명시적 숨김 제외)
      const isPublished = p.status === 'published' || (!p.status && p.published !== false)
      if (!isPublished) return false
      if (p.is_evergreen_deal || p.is_always_on) return true
      if (!p.deadline) return true  // 마감일 미확인 + 소진시 마감(sale_until_sold_out) 둘 다 포함 — 지난 게 아니므로 계속 노출
      return new Date(p.deadline) >= today
    })
  }

  if (cat && cat !== 'all') posts = posts.filter(p => p.cat === cat)
  if (search) {
    posts = posts.filter(p =>
      p.title.toLowerCase().includes(search) ||
      p.account.toLowerCase().includes(search) ||
      (p.brand || '').toLowerCase().includes(search) ||
      (p.caption || '').toLowerCase().includes(search)
    )
  }

  if (sort === 'latest') {
    posts = [...posts].sort((a, b) =>
      (b.scraped_at || '').localeCompare(a.scraped_at || '')
    )
  } else if (sort === 'deadline') {
    posts = [...posts].sort((a, b) => {
      const da = daysLeft(a.deadline), db = daysLeft(b.deadline)
      if (da < 0 && db >= 0) return 1
      if (db < 0 && da >= 0) return -1
      return da - db
    })
  } else if (sort === 'discount') {
    posts = [...posts].sort((a, b) => {
      const da = a.origPrice && a.origPrice > a.price ? (a.origPrice - a.price) / a.origPrice : 0
      const db = b.origPrice && b.origPrice > b.price ? (b.origPrice - b.price) / b.origPrice : 0
      return db - da
    })
  } else if (sort === 'popular') {
    posts = [...posts].sort((a, b) => (b.participants || 0) - (a.participants || 0))
  }

  const total  = posts.length
  const start  = (page - 1) * perPage
  const paged  = posts.slice(start, start + perPage)

  return NextResponse.json({ posts: paged, total, page, per_page: perPage, pages: Math.ceil(total / perPage) })
}

export async function POST(request: NextRequest) {
  const data = await request.json()
  const required = ['title', 'account', 'cat']
  for (const field of required) {
    if (!data[field]) return NextResponse.json({ error: `필수 필드 누락: ${field}` }, { status: 400 })
  }
  if (data.status !== 'upcoming' && !data.price) {
    return NextResponse.json({ error: '필수 필드 누락: price' }, { status: 400 })
  }

  const posts = loadPosts()
  // 같은 밀리초에 2건이 등록돼도 충돌하지 않도록 기존 최대 id보다 항상 큰 값을 보장
  const maxId = posts.reduce((m, p) => Math.max(m, p.id || 0), 0)
  const newPost: Post = {
    id:         Math.max(Date.now(), maxId + 1),
    shortcode:  null,
    title:      data.title,
    account:    data.account.startsWith('@') ? data.account : '@' + data.account,
    cat:        data.cat,
    price:      parseInt(data.price),
    origPrice:  data.origPrice ? parseInt(data.origPrice) : null,
    group_key:     data.group_key?.trim() || null,
    market_url:    data.market_url?.trim() || null,
    purchase_url:     data.purchase_url?.trim() || null,
    is_always_on:     Boolean(data.is_always_on),
    is_evergreen_deal: Boolean(data.is_evergreen_deal),
    extraction_debug:  data.extraction_debug || null,
    status:        data.status || 'ready',
    review_reason: data.review_reason || [],
    start_date: data.start_date || '',
    deadline:   data.deadline || '',
    brand:      data.brand || null,
    img:        data.img || '',
    url:        data.url || '',
    participants: 0,
    avatar:     CAT_EMOJI[data.cat] || '🛍️',
    caption:    data.caption || '',
    scraped_at: new Date().toISOString(),
    source:     'manual',
    published:  true,  // 관리자가 직접 등록한 것은 바로 공개
    custom_verdict:        data.custom_verdict?.trim() || null,
    custom_verdict_detail: data.custom_verdict_detail?.trim() || null,
    custom_verdict_cls:    data.custom_verdict_cls || null,
  }

  posts.unshift(newPost)
  savePosts(posts)

  return NextResponse.json({ success: true, post: newPost }, { status: 201 })
}
