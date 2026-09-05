import { NextResponse } from 'next/server'
import { loadPosts } from '@/lib/store'
import { influencerNameOf, canonicalAccountFor } from '@/lib/influencerItems'
import { getCuratedSubjectForInfluencer } from '@/lib/curatedSubjects'

export const dynamic = 'force-dynamic'

// /influencer/[account] 안에서 permanentRedirect()를 부르면(React 스트리밍 렌더링 중) 실제
// 서버(Node 20)에서는 진짜 308이 아니라 200+메타리프레시로 나갔다 — 로컬(Node 22)에서는
// 재현이 안 되는 Node 버전별 스트리밍 타이밍 차이로 확인됨. 미들웨어가 렌더링 시작 전에
// 이 라우트로 대상을 물어보고 직접 리다이렉트하면 그 문제를 아예 피할 수 있다.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const account = decodeURIComponent(searchParams.get('account') || '')
  const normalized = account.startsWith('@') ? account : `@${account}`

  const all = loadPosts()
  const name = influencerNameOf(all, normalized)
  if (!name) return NextResponse.json({ redirectTo: null })

  const pickSubject = getCuratedSubjectForInfluencer(name)
  if (pickSubject) {
    return NextResponse.json({ redirectTo: `/pick/${encodeURIComponent(pickSubject.slug)}` })
  }

  const canonicalAccount = canonicalAccountFor(all, name)
  if (normalized.toLowerCase() !== canonicalAccount.toLowerCase()) {
    return NextResponse.json({ redirectTo: `/influencer/${encodeURIComponent(canonicalAccount.replace('@', ''))}` })
  }

  return NextResponse.json({ redirectTo: null })
}
