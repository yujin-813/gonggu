import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'URL 없음' }, { status: 400 })

  const match = url.match(/instagram\.com\/(?:p|reel)\/([^/?#]+)/)
  if (!match) {
    const profileMatch = url.match(/instagram\.com\/([^/?#]+)/)
    if (profileMatch) {
      return NextResponse.json({ account: `@${profileMatch[1]}`, title: '', shortcode: null })
    }
    return NextResponse.json({ error: '올바른 Instagram URL이 아닙니다' }, { status: 400 })
  }
  const shortcode = match[1]

  try {
    const res = await fetch(
      `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(url)}&omit_script=true`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Referer': 'https://www.instagram.com/',
        },
        signal: AbortSignal.timeout(8000),
      }
    )

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()

    // author_url: "https://www.instagram.com/artist._.mom" → 계정명 추출
    const username = (data.author_url as string | undefined)
      ?.match(/instagram\.com\/([^/?#]+)/)?.[1] ?? null

    // title = 전체 캡션 텍스트, 앞 100자만 상품명 힌트로 사용
    const caption = (data.title as string | undefined)?.trim() ?? ''
    const titleHint = caption.slice(0, 100).split('\n')[0].trim()

    return NextResponse.json({
      account:   username ? `@${username}` : null,
      title:     titleHint || null,
      caption,
      thumbnail: (data.thumbnail_url as string | undefined) ?? null,
      shortcode,
    })
  } catch {
    return NextResponse.json({ account: null, title: null, caption: null, thumbnail: null, shortcode })
  }
}
