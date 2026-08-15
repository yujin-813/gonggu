import {
  visiblePosts, featuredPosts, endingSoonPosts, popularPosts, categorySections, SITE_URL,
} from '@/lib/landing'
import { getPopularPostIds } from '@/lib/analytics'
import JsonLd, { websiteSchema, itemListSchema } from '@/components/JsonLd'
import HomeSections from '@/components/HomeSections'
import HomeClient from './HomeClient'

// 홈 자체는 클라이언트 컴포넌트라 구조화 데이터와 큐레이션 섹션을 넣을 수 없어서 서버
// 컴포넌트로 감쌌다. 여기서 계산한 결과는 첫 응답 HTML에 들어가므로 크롤러가 자바스크립트
// 없이 상품명·가격을 읽는다.
export const dynamic = 'force-dynamic'

const POPULAR_DAYS = 7
const POPULAR_LIMIT = 8
const FEATURED_LIMIT = 8
const ENDING_SOON_LIMIT = 8

export default function Home() {
  const posts = visiblePosts()

  // 인기 순위는 클릭 로그에서 뽑고, 실제 노출은 지금 진행 중인 공구로만 좁힌다 —
  // 마감된 공구가 클릭수만 높다고 홈 상단에 남아 있으면 안 되기 때문이다
  const popular = popularPosts(posts, getPopularPostIds(POPULAR_DAYS, POPULAR_LIMIT))
  const featured = featuredPosts(posts).slice(0, FEATURED_LIMIT)
  const endingSoon = endingSoonPosts(posts).slice(0, ENDING_SOON_LIMIT)
  const categories = categorySections(posts)

  return (
    <>
      <JsonLd data={[
        websiteSchema(),
        itemListSchema(posts, '진행 중인 공구', SITE_URL),
      ]} />
      <HomeClient
        sections={<HomeSections
          popular={popular}
          featured={featured}
          endingSoon={endingSoon}
          categories={categories}
        />}
      />
    </>
  )
}
