import { NextResponse } from 'next/server'
import { loadPosts } from '@/lib/store'

// 이 라우트는 searchParams 등 동적 API를 안 써서 Next가 빌드 시점에 정적으로 캐싱해버리면
// 이후 스크래퍼가 새로 수집해도 목록이 절대 갱신되지 않는다 — 매 요청마다 새로 읽도록 강제
export const dynamic = 'force-dynamic'

// /influencer/[account] 페이지에 실제로 보여줄 게 있는 계정만 추린 목록 —
// by-influencer 라우트와 동일한 기준(가격/링크/이미지 있고, 이미지 다운로드 실패 아님).
//
// influencer_name으로 묶는다(account 아님) — 인스타 핸들이 바뀌면 account 값도 바뀌어서,
// 같은 사람이 두 줄로 따로 뜨던 문제(실측 13명)가 있었다. influencer_name이 없는(아직
// 한글 활동명 안 채운) 경우만 account를 그룹 키로 대신 쓴다.
export async function GET() {
  const posts = loadPosts().filter(p =>
    !!p.account &&
    !!p.price &&
    !!(p.purchase_url || p.url) &&
    !!p.img &&
    !(p.review_reason || []).includes('이미지 다운로드 실패')
  )

  const byName = new Map<string, {
    name: string; count: number; thumbnail: string; latest: string
    catCounts: Record<string, number>
    accountCounts: Map<string, number> // 대표 계정(게시물 가장 많은 계정) 고르는 용도
  }>()
  for (const p of posts) {
    const account = p.account!
    const key = p.influencer_name || account
    const existing = byName.get(key)
    const accountCount = (existing?.accountCounts.get(account) || 0) + 1
    if (existing) {
      existing.count += 1
      existing.catCounts[p.cat] = (existing.catCounts[p.cat] || 0) + 1
      existing.accountCounts.set(account, accountCount)
      if ((p.scraped_at || '') > existing.latest) {
        existing.latest = p.scraped_at || ''
        existing.thumbnail = p.img!
      }
    } else {
      byName.set(key, {
        name: p.influencer_name || account.replace('@', ''),
        count: 1,
        thumbnail: p.img!,
        latest: p.scraped_at || '',
        catCounts: { [p.cat]: 1 },
        accountCounts: new Map([[account, 1]]),
      })
    }
  }

  const influencers = [...byName.values()]
    .sort((a, b) => b.latest.localeCompare(a.latest))
    .map(({ name, count, thumbnail, catCounts, accountCounts }) => ({
      // 대표 계정 — 게시물이 가장 많은 계정 (동점이면 먼저 잡힌 쪽)
      account: [...accountCounts.entries()].sort((a, b) => b[1] - a[1])[0][0],
      name, count, thumbnail,
      // 가장 많이 올리는 카테고리를 그 인플루언서의 대표 카테고리로 — 필터용
      primaryCategory: Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0][0],
    }))

  return NextResponse.json({ influencers })
}
