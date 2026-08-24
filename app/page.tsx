import {
  visiblePosts, featuredPosts, endingSoonPosts, popularPosts, categorySections,
  todayPosts, upcomingPosts, monthlyPosts, influencerSummaries, endedButBuyablePosts, SITE_URL,
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
// 크게 보여주는 영역은 스크롤이 길어지지 않게 적게, 가로로 훑는 영역은 넉넉히 담는다
const BIG_LIMIT = 6
const STRIP_LIMIT = 12

export default function Home() {
  const posts = visiblePosts()

  // 인기 순위는 클릭 로그에서 뽑되 노출은 진행 중인 공구로만 좁힌다 — 마감된 공구가
  // 클릭수만 높다고 홈 상단에 남아 있으면 안 되기 때문이다
  const popular = popularPosts(posts, getPopularPostIds(POPULAR_DAYS, BIG_LIMIT))
  const featured = featuredPosts(posts).slice(0, BIG_LIMIT)

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
          today={todayPosts(posts).slice(0, STRIP_LIMIT)}
          upcoming={upcomingPosts(posts).slice(0, STRIP_LIMIT)}
          endingSoon={endingSoonPosts(posts).slice(0, STRIP_LIMIT)}
          monthly={monthlyPosts(posts).slice(0, STRIP_LIMIT)}
          categories={categorySections(posts, STRIP_LIMIT)}
          influencers={influencerSummaries(posts)}
          endedButBuyable={endedButBuyablePosts()}
        />}
      />
    </>
  )
}
