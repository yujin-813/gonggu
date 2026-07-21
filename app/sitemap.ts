import type { MetadataRoute } from 'next'
import { loadCollections } from '@/lib/store'

const SITE_URL = 'https://gonggu.asknuggetdata.com'

// 컬렉션은 재배포 없이 관리자가 수시로 추가/삭제하므로 빌드 시점에 고정되지 않게 요청마다 새로 계산한다
export const dynamic = 'force-dynamic'

export default function sitemap(): MetadataRoute.Sitemap {
  // 개별 공구는 자체 상세 페이지 없이 외부 구매 링크로 바로 연결되는 구조라 sitemap에 넣을
  // 고유 URL이 없다 — 대신 실제 공개 페이지인 컬렉션 상세 페이지를 넣는다
  const collections = loadCollections().filter(c => c.productIds.length > 0)

  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 1,
    },
    // sitemap 프로토콜은 URL이 RFC 3986대로 이스케이프돼 있어야 해서, 한글 등 컬렉션 id를
    // encodeURI로 퍼센트 인코딩한다 (Next가 자동으로 해주지 않음)
    ...collections.map(c => ({
      url: encodeURI(`${SITE_URL}/collection/${c.id}`),
      lastModified: new Date(c.createdAt),
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
  ]
}
