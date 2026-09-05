import type { CuratedSubject, Post } from './types'
import { loadPosts, loadCuratedSubjects } from './store'
import { isCustomerVisible, isExpired, isPagePublic } from './period'
import { toPublicPosts } from './publicPost'

// lib/brandPages.ts의 brandPosts()와 같은 모양이지만, 매칭 필드가 brand뿐 아니라
// account(인플루언서/셀러)까지 될 수 있다. /brand/[brand](자동 생성, 405개)는 그대로
// 두고 완전히 별도로 둔다 — 이건 관리자가 고른 대상만 페이지가 생긴다.
const RECENT_ENDED_LIMIT = 10

export function getCuratedSubject(slug: string): CuratedSubject | null {
  const s = loadCuratedSubjects().find(s => s.slug === slug && s.enabled)
  return s || null
}

export function listCuratedSubjects(): CuratedSubject[] {
  return loadCuratedSubjects().filter(s => s.enabled)
}

/** 이 인플루언서(influencer_name)를 이미 대표하는 공구 모음이 있는지 — 있으면 그게
 * /influencer/[account]보다 더 완전한 대표 URL이다(계정 핸들 드리프트와 무관하게 전부
 * 모으므로). sitemap·리다이렉트가 이걸로 우선순위를 정한다. */
export function getCuratedSubjectForInfluencer(name: string): CuratedSubject | null {
  const s = loadCuratedSubjects().find(s => s.enabled && s.matchField === 'influencer_name' && s.matchValue === name)
  return s || null
}

export function subjectPosts(subject: CuratedSubject): { active: Post[]; upcoming: Post[]; ended: Post[] } {
  const all = loadPosts().filter(p =>
    (subject.matchField === 'brand' ? p.brand === subject.matchValue : p.influencer_name === subject.matchValue)
    && isPagePublic(p)
  )
  // isCustomerVisible이 이미 오픈일이 실제로 지났는지까지 확인해주므로, 그 위에서
  // status==='upcoming'으로만 갈라도 안전하다(사이트 전체가 이 함수를 신뢰하고 있다).
  const visible = all.filter(isCustomerVisible)
  const upcoming = toPublicPosts(visible.filter(p => p.status === 'upcoming'))
  const active = toPublicPosts(visible.filter(p => p.status !== 'upcoming'))
  const ended = toPublicPosts(
    all
      .filter(p => isExpired(p) && !isCustomerVisible(p))
      .sort((a, b) => (b.updated_at || b.scraped_at || '').localeCompare(a.updated_at || a.scraped_at || ''))
      .slice(0, RECENT_ENDED_LIMIT),
  )
  return { active, upcoming, ended }
}
