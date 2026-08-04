import { NextRequest, NextResponse } from 'next/server'
import { loadPosts } from '@/lib/store'

// 고객 화면에서 "지난 공구가" 참고용으로 쓰는 경량 조회 — 실제로 공개(published)됐던
// 공구의 가격/날짜만 돌려주고, 검수 전/제외된 글이나 제목·이미지·링크 등은 절대 노출하지
// 않는다(검색으로 마감/제외 글을 찾아내는 우회로가 되면 안 되므로 group_key를 아는 요청에만 응답)
export async function GET(request: NextRequest) {
  const keysParam = request.nextUrl.searchParams.get('keys') || ''
  const keys = new Set(keysParam.split(',').map(k => k.trim()).filter(Boolean))
  if (keys.size === 0) return NextResponse.json({ history: {} })

  const posts = loadPosts()
  const history: Record<string, { id: number; price: number; origPrice: number | null; date: string }[]> = {}

  for (const p of posts) {
    if (!p.group_key || !keys.has(p.group_key) || !p.price) continue
    // published였던 적 있는(=실제로 공개된 적 있는) 공구만 "실제 있었던 가격"으로 인정
    if (p.status !== 'published') continue
    const date = p.start_date || (p.scraped_at || '').slice(0, 10) || ''
    ;(history[p.group_key] ??= []).push({ id: p.id, price: p.price, origPrice: p.origPrice ?? null, date })
  }
  for (const key in history) {
    history[key].sort((a, b) => b.date.localeCompare(a.date))
    history[key] = history[key].slice(0, 5)
  }

  return NextResponse.json({ history })
}
