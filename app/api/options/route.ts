import { NextRequest, NextResponse } from 'next/server'
import { scrapeOptions } from '@/lib/optionScrape'

// 관리자가 "옵션 가져오기"를 눌렀을 때 판매 페이지에서 세트 구성을 즉시 긁어온다.
// 수집기는 새로 들어오는 글에만 돌기 때문에, 이미 등록된 공구나 손으로 추가한 공구는
// 이 경로로만 자동 수집을 쓸 수 있다.
export async function POST(request: NextRequest) {
  let url = ''
  try {
    url = (await request.json())?.url || ''
  } catch {
    return NextResponse.json({ error: '요청을 읽지 못했습니다' }, { status: 400 })
  }

  url = url.trim()
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: '구매 링크를 먼저 입력해 주세요' }, { status: 400 })
  }

  const { options, reason } = await scrapeOptions(url)
  return NextResponse.json({ options, reason })
}
