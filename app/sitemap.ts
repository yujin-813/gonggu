import type { MetadataRoute } from 'next'
import { loadCollections, loadPosts } from '@/lib/store'
import { influencerItems, canonicalAccountFor } from '@/lib/influencerItems'
import { allBrands } from '@/lib/brandPages'
import { listCuratedSubjects } from '@/lib/curatedSubjects'
import {
  SITE_URL, visiblePosts, routablePosts, LANDING_KEYS, CATEGORY_KEYS, landingCopy,
  CATEGORY_COMBO_CATEGORIES, CATEGORY_COMBO_KEYS, categoryComboPosts,
} from '@/lib/landing'

// 컬렉션·공구는 재배포 없이 관리자가 수시로 바꾸므로 빌드 시점에 고정되지 않게 요청마다 새로 계산한다
export const dynamic = 'force-dynamic'

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = visiblePosts()
  const collections = loadCollections().filter(c => c.productIds.length > 0)

  // 인플루언서별 페이지는 화면에 띄울 상품이 있는 계정만.
  //
  // 예전에는 "공개 중인 공구가 있는 계정"만 넣었는데, 이 페이지는 마감·비공구까지 다 보여주는
  // 자리라 기준이 어긋나 있었다. 진행 중 공구가 0건이어도 지난 상품 20건이 떠 있는 계정이
  // 74개 중 35개였고 그게 통째로 색인에서 빠져 있었다. 화면이 보여주는 것과 같은 규칙으로 센다.
  const allPosts = loadPosts()
  const qualifyingAccounts = [...new Set(allPosts.map(p => p.account).filter(Boolean))]
    .filter(account => influencerItems(allPosts, account).length > 0)

  // 인스타 핸들이 바뀌면 account 값도 바뀐다 — 같은 사람이 계정 여러 개로 갈려서(실측
  // 80명 중 13명) sitemap에 URL이 쪼개져 있었다. influencer_name 기준으로 대표 계정
  // 하나만 낸다. 이미 /pick이 그 사람을 대표하면(관리자가 고른 공구 모음, 계정
  // 드리프트와 무관하게 전부 모음) /influencer 쪽 URL은 아예 뺀다 — 같은 사람을
  // 가리키는 두 URL이 sitemap에 같이 실리면 안 된다(사장님 요청).
  const pickedInfluencerNames = new Set(
    listCuratedSubjects().filter(s => s.matchField === 'influencer_name').map(s => s.matchValue),
  )
  const canonicalAccountByName = new Map<string, string>()
  for (const account of qualifyingAccounts) {
    const name = allPosts.find(p => p.account === account)?.influencer_name
    const key = name || account // 이름 없으면 계정 자체가 그룹
    if (name && pickedInfluencerNames.has(name)) continue
    if (!canonicalAccountByName.has(key)) {
      canonicalAccountByName.set(key, name ? canonicalAccountFor(allPosts, name) : account)
    }
  }
  const accounts = [...new Set(canonicalAccountByName.values())]

  const lastPostUpdate = posts.reduce<string>(
    (latest, p) => ((p.scraped_at || '') > latest ? p.scraped_at || '' : latest),
    '',
  )

  return [
    {
      url: SITE_URL,
      lastModified: lastPostUpdate ? new Date(lastPostUpdate) : new Date(),
      changeFrequency: 'hourly',
      priority: 1,
    },
    // 검색 착지 페이지 — "오늘 공구", "마감 임박 공구", "이달의 공구"
    ...LANDING_KEYS.map(key => ({
      url: `${SITE_URL}${landingCopy(key, 0).path}`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.9,
    })),
    // 카테고리별 — "유아 공구", "뷰티 공구" 등
    ...CATEGORY_KEYS.map(cat => ({
      url: `${SITE_URL}/category/${cat}`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
    // 카테고리×기간 조합 — "유아 마감임박 공구"처럼 검색어가 둘 다 있을 때(D-077).
    // 생활·유아만(게시물이 충분한 카테고리) + 지금 실제로 채울 게 있는 조합만 싣는다 —
    // today·deadline_today는 그날그날 0건일 수 있는데, 그런 날은 sitemap에서 빠졌다가
    // 다음 요청 때 다시 채워진다(force-dynamic이라 매 요청 새로 계산). 빈 페이지를
    // 검색엔진에 안내하지 않기 위함이지, 페이지 자체가 없어지는 건 아니다.
    ...CATEGORY_COMBO_CATEGORIES.flatMap(cat =>
      CATEGORY_COMBO_KEYS
        .filter(key => categoryComboPosts(visiblePosts(), cat, key).length > 0)
        .map(key => ({
          url: `${SITE_URL}${landingCopy(key, 0).path.replace(/^\//, `/category/${cat}/`)}`,
          lastModified: new Date(),
          changeFrequency: 'daily' as const,
          priority: 0.6,
        })),
    ),
    {
      url: `${SITE_URL}/influencers`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    // 개별 공구 상세 — "브랜드명 공구"로 들어오는 롱테일 검색이 실제로 착지하는 페이지다.
    // (이전에는 "공구는 상세 페이지가 없다"는 낡은 전제로 통째로 빠져 있었다)
    // 마감된 공구도 넣는다 — 페이지가 종료 안내와 대체 구매처로 계속 쓰이므로, 사이트맵에서
    // 빼면 검색엔진이 사라진 페이지로 보고 색인을 내린다.
    // updated_at은 가격·마감상태·공개 여부가 실제로 바뀐 시각(관리자 수정 포함),
    // scraped_at은 수집기가 마지막으로 훑은 시각 — updated_at이 있으면 그게 더 정확하다
    ...routablePosts().map(p => ({
      url: `${SITE_URL}/post/${p.id}`,
      lastModified: new Date(p.updated_at || p.scraped_at || Date.now()),
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
    // 인플루언서별 — "OOO 공구"로 들어오는 검색
    ...accounts.map(account => ({
      url: `${SITE_URL}/influencer/${encodeURIComponent(account.replace('@', ''))}`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
    // 브랜드별 — "스타우브 공구", "스타우브 최저가"로 들어오는 검색
    ...allBrands().map(brand => ({
      url: `${SITE_URL}/brand/${encodeURIComponent(brand)}`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
    // 관리자가 고른 공구 모음(/pick) — 자동 생성되는 브랜드 페이지와 별개
    {
      url: `${SITE_URL}/pick`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.7,
    },
    ...listCuratedSubjects().map(s => ({
      url: `${SITE_URL}/pick/${encodeURIComponent(s.slug)}`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
    // sitemap 프로토콜은 URL이 RFC 3986대로 이스케이프돼 있어야 해서, 한글 등 컬렉션 id를
    // encodeURI로 퍼센트 인코딩한다 (Next가 자동으로 해주지 않음)
    ...collections.map(c => ({
      url: encodeURI(`${SITE_URL}/collection/${c.id}`),
      lastModified: new Date(c.createdAt),
      changeFrequency: 'daily' as const,
      priority: 0.6,
    })),
  ]
}
