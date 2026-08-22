import { NextRequest, NextResponse } from 'next/server'
import { loadInfluencerSources, saveInfluencerSources, updateInfluencerSource, loadPosts, savePosts } from '@/lib/store'
import type { LinkSourceType, InfluencerSource } from '@/lib/types'

function detectSourceType(url: string): LinkSourceType {
  // inpk.link는 inpock의 커스텀 단축 도메인 — 같은 __NEXT_DATA__ 구조를 쓰고
  // handle이 link.inpock.co.kr에서도 그대로 동작해서 동일하게 취급한다
  if (/inpock\.co\.kr|inpk\.link/i.test(url)) return 'inpock'
  if (/linktr\.ee/i.test(url)) return 'linktree'
  if (/litt\.ly/i.test(url)) return 'littly'
  if (/smartstore\.naver\.com/i.test(url)) return 'smartstore'
  if (/instagram\.com/i.test(url)) return 'instagram'
  return 'unknown'
}

function extractHandle(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean)
    if (parts.length > 0) return parts[parts.length - 1]
  } catch { /* ignore */ }
  return url.trim()
}

export async function GET() {
  return NextResponse.json({ sources: loadInfluencerSources() })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const rawUrl = String(body.url || '').trim()
  const influencer_name = String(body.influencer_name || '').trim()
  if (!rawUrl) {
    return NextResponse.json({ error: 'URL을 입력하세요' }, { status: 400 })
  }

  const url = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`
  const source_type = detectSourceType(url)
  const handle = extractHandle(url)
  const id = `${source_type}_${handle}_${Date.now()}`

  const sources = loadInfluencerSources()
  if (sources.some(s => s.url === url)) {
    return NextResponse.json({ error: '이미 등록된 링크입니다' }, { status: 409 })
  }

  const newSource: InfluencerSource = {
    id,
    url,
    source_type,
    handle,
    influencer_name: influencer_name || handle,
    added_at: new Date().toISOString(),
  }
  sources.push(newSource)
  saveInfluencerSources(sources)
  return NextResponse.json({ success: true, source: newSource }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') || ''
  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다' }, { status: 400 })
  }
  const sources = loadInfluencerSources()
  const filtered = sources.filter(s => s.id !== id)
  if (filtered.length === sources.length) {
    return NextResponse.json({ error: '소스를 찾을 수 없습니다' }, { status: 404 })
  }
  saveInfluencerSources(filtered)
  return NextResponse.json({ success: true })
}

export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id가 필요합니다' }, { status: 400 })
  const body = await request.json().catch(() => ({}))
  const allowed = ['influencer_name', 'instagram_handle', 'category', 'collection_status', 'last_collected_at', 'memo', 'url', 'source_type']
  const patch = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)))
  const before = loadInfluencerSources().find(s => s.id === id)
  const ok = updateInfluencerSource(id, patch as Partial<InfluencerSource>)
  if (!ok) return NextResponse.json({ error: '소스를 찾을 수 없습니다' }, { status: 404 })

  // 이름은 게시물에도 복사돼 있고, 인플루언서 페이지 제목("OOO 공구")은 게시물 쪽 값을 읽는다.
  // 소스만 고치면 화면이 안 바뀌어서, 관리자가 한글 활동명을 넣어도 검색 결과에는 그대로
  // "bobpro__ 공구"가 나갔다. 같은 계정의 게시물을 함께 갱신한다.
  const newName = typeof patch.influencer_name === 'string' ? patch.influencer_name.trim() : ''
  let renamed = 0
  if (newName && before && newName !== before.influencer_name) {
    const handles = [before.instagram_handle, before.handle, before.influencer_name]
      .filter(Boolean)
      .map(h => `@${String(h).replace('@', '')}`.toLowerCase())
    if (handles.length) {
      const posts = loadPosts()
      for (const post of posts) {
        if (handles.includes((post.account || '').toLowerCase())) {
          post.influencer_name = newName
          renamed++
        }
      }
      if (renamed) savePosts(posts)
    }
  }
  return NextResponse.json({ success: true, renamed })
}
