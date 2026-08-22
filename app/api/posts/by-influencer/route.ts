import { NextRequest, NextResponse } from 'next/server'
import { loadPosts } from '@/lib/store'
import { influencerItems, influencerName } from '@/lib/influencerItems'

// 인플루언서가 올린 "상품 추천" 전체를 보여주는 페이지용 — 메인 피드의 dealJudgment(공구
// 가격 판단)와는 무관하게, 공구로 분류 안 된 것(비공구/제외 포함)도 다 보여준다. 단, 이미지
// 다운로드가 실패했거나 가격·구매링크가 아예 없는 건 화면에 띄울 수 없으니 제외한다.
export async function GET(request: NextRequest) {
  const account = (request.nextUrl.searchParams.get('account') || '').trim()
  if (!account) return NextResponse.json({ error: '계정명이 필요합니다' }, { status: 400 })

  const normalized = account.startsWith('@') ? account : `@${account}`
  const all = loadPosts()
  const posts = influencerItems(all, normalized)

  if (posts.length === 0) return NextResponse.json({ influencer: null, items: [] })

  const influencer = {
    account: normalized,
    name: influencerName(all, normalized),
    source_url: posts[0].source_url || null,
  }
  const items = posts.map(p => ({
    id: p.id,
    title: p.title,
    brand: p.brand || null,
    price: p.price,
    img: p.img,
    link: p.purchase_url || p.url,
  }))

  return NextResponse.json({ influencer, items })
}
