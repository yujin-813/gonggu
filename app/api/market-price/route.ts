import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ error: '검색어가 필요합니다' }, { status: 400 })

  const clientId     = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'API 키 미설정' }, { status: 503 })
  }

  const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(q)}&display=5&sort=sim`
  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id':     clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    return NextResponse.json({ error: `네이버 API 오류 (${res.status})` }, { status: res.status })
  }

  const data = await res.json()
  const items = (data.items ?? [])
    .map((item: Record<string, string>) => ({
      title:    item.title.replace(/<[^>]+>/g, ''),
      lprice:   parseInt(item.lprice) || 0,
      mallName: item.mallName,
      link:     item.link,
      image:    item.image,
    }))
    .filter((item: { lprice: number }) => item.lprice > 0)

  return NextResponse.json({ items })
}
