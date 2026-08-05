import { NextRequest, NextResponse } from 'next/server'
import { loadPosts, savePosts } from '@/lib/store'
import type { Post, Category } from '@/lib/types'

const CAT_EMOJI: Record<string, string> = {
  kids: '👶', life: '🏠', food: '🍽️', health: '💊', beauty: '💄',
}
const VALID_CATS = new Set<Category>(['kids', 'life', 'food', 'health', 'beauty'])

// 공개 제보/등록 요청 — 로그인 없이 누구나 호출 가능하므로(middleware 보호 대상 아님),
// 절대 published=true로 바로 노출하지 않고 항상 검수 대기(needs_review)로만 들어간다.
// 그 외 위험한 필드(status/published/source 등)는 클라이언트 입력을 신뢰하지 않고 서버가 직접 고정한다.
export async function POST(request: NextRequest) {
  const data = await request.json().catch(() => null)
  if (!data) return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 })

  // 스팸봇이 자동으로 채우기 쉬운 허니팟 필드 — 사람 눈엔 안 보이는 폼 필드라 값이 있으면 봇으로 간주
  if (typeof data.website === 'string' && data.website.trim()) {
    return NextResponse.json({ success: true })  // 봇에게는 성공한 것처럼 보이게만 하고 실제로는 버림
  }

  const title = (data.title || '').toString().trim().slice(0, 200)
  const account = (data.account || '').toString().trim().slice(0, 100)
  const purchaseUrl = (data.purchase_url || '').toString().trim().slice(0, 1000)
  const url = (data.url || '').toString().trim().slice(0, 1000)
  const price = parseInt(data.price)
  const cat: Category = VALID_CATS.has(data.cat) ? data.cat : 'life'

  if (!title || !account) {
    return NextResponse.json({ error: '상품명과 인스타 계정을 입력해주세요' }, { status: 400 })
  }
  if (!purchaseUrl || !/^https?:\/\//i.test(purchaseUrl)) {
    return NextResponse.json({ error: '올바른 구매 링크를 입력해주세요' }, { status: 400 })
  }
  if (!price || price <= 0) {
    return NextResponse.json({ error: '판매가를 입력해주세요' }, { status: 400 })
  }

  const posts = loadPosts()
  const maxId = posts.reduce((m, p) => Math.max(m, p.id || 0), 0)
  const newPost: Post = {
    id: Math.max(Date.now(), maxId + 1),
    shortcode: null,
    title,
    account: account.startsWith('@') ? account : `@${account}`,
    cat,
    price,
    origPrice: null,
    purchase_url: purchaseUrl,
    url: url || purchaseUrl,
    start_date: (data.start_date || '').toString().slice(0, 10),
    deadline: (data.deadline || '').toString().slice(0, 10),
    brand: null,
    img: '',
    participants: 0,
    avatar: CAT_EMOJI[cat] || '🛍️',
    caption: (data.memo || '').toString().trim().slice(0, 500),
    scraped_at: new Date().toISOString(),
    source: 'influencer_request',
    status: 'needs_review',
    review_reason: [],
    published: false,
  }

  posts.unshift(newPost)
  savePosts(posts)

  return NextResponse.json({ success: true })
}
