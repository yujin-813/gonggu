import type { MetadataRoute } from 'next'
import { loadCollections } from '@/lib/store'
import { SITE_URL, visiblePosts, LANDING_KEYS, CATEGORY_KEYS, landingCopy } from '@/lib/landing'

// 컬렉션·공구는 재배포 없이 관리자가 수시로 바꾸므로 빌드 시점에 고정되지 않게 요청마다 새로 계산한다
export const dynamic = 'force-dynamic'

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = visiblePosts()
  const collections = loadCollections().filter(c => c.productIds.length > 0)

  // 인플루언서별 페이지는 공개된 공구가 있는 계정만 — 빈 페이지를 색인시키면 품질 평가에 불리하다
  const accounts = [...new Set(posts.map(p => p.account).filter(Boolean))]

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
    {
      url: `${SITE_URL}/influencers`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    // 개별 공구 상세 — "브랜드명 공구"로 들어오는 롱테일 검색이 실제로 착지하는 페이지다.
    // (이전에는 "공구는 상세 페이지가 없다"는 낡은 전제로 통째로 빠져 있었다)
    ...posts.map(p => ({
      url: `${SITE_URL}/post/${p.id}`,
      lastModified: p.scraped_at ? new Date(p.scraped_at) : new Date(),
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
