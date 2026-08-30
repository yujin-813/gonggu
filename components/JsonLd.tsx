import type { Post } from '@/lib/types'
import { SITE_URL } from '@/lib/landing'
import { isExpired, getPeriodState } from '@/lib/period'

// 네이버·구글 모두 JSON-LD를 읽는다. 서버 컴포넌트에서 렌더해 첫 응답 HTML에 들어가게 한다.
// (next/script는 클라이언트에서 주입돼 크롤러가 놓칠 수 있으므로 쓰지 않는다)

export default function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      // 사용자 입력(상품명 등)이 들어가므로 </script>로 문서를 깨뜨리지 못하게 이스케이프한다
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}

/** 목록 페이지용 — 어떤 공구들이 실려 있는지 검색엔진에 알린다 */
export function itemListSchema(posts: Post[], name: string, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    url,
    numberOfItems: posts.length,
    itemListElement: posts.slice(0, 50).map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE_URL}/post/${p.id}`,
      name: p.title,
    })),
  }
}

/** 공구 상세용 — 가격·판매기간이 검색 결과에 함께 노출될 수 있다 */
export function productSchema(post: Post) {
  const offer: Record<string, unknown> = {
    '@type': 'Offer',
    priceCurrency: 'KRW',
    url: `${SITE_URL}/post/${post.id}`,
    // 마감된 공구를 InStock으로 두면 검색결과에 "판매 중"으로 잘못 노출된다.
    // 페이지는 유지하되 이 공구 자체는 더 못 산다는 사실을 정확히 알린다.
    availability: getPeriodState(post).kind === 'upcoming'
      ? 'https://schema.org/PreOrder'
      : isExpired(post)
      ? 'https://schema.org/SoldOut'
      : 'https://schema.org/InStock',
  }
  if (post.price) offer.price = post.price
  // 마감일이 있으면 이 가격이 언제까지 유효한지 알려준다
  if (post.deadline) offer.priceValidUntil = post.deadline

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: post.title,
    url: `${SITE_URL}/post/${post.id}`,
    offers: offer,
  }
  if (post.img) data.image = post.img.startsWith('http') ? post.img : `${SITE_URL}${post.img}`
  if (post.brand) data.brand = { '@type': 'Brand', name: post.brand }
  return data
}

/** 홈에 한 번만 — 사이트 이름과 사이트 내 검색 경로를 알린다 */
export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: '꿀공구',
    alternateName: ['꿀공구 공구모아', '인스타 공구 모아보기'],
    url: SITE_URL,
    description: '인스타그램 인플루언서 공동구매(공구)를 한곳에 모아보는 서비스',
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  }
}

/** 상세페이지 롱테일 Q&A용 — 실제 데이터가 있는 질문만 lib/postLongtail.ts가 만들어
 * 넘긴다. 빈 배열이면 호출하는 쪽에서 아예 JsonLd 목록에 넣지 않는다. */
export function faqSchema(qas: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: qas.map(qa => ({
      '@type': 'Question',
      name: qa.q,
      acceptedAnswer: { '@type': 'Answer', text: qa.a },
    })),
  }
}

/** 페이지 위치를 알려 검색결과에 경로가 표시되게 한다 */
export function breadcrumbSchema(trail: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      item: `${SITE_URL}${t.path}`,
    })),
  }
}
