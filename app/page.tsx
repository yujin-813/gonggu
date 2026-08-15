import { visiblePosts, SITE_URL } from '@/lib/landing'
import JsonLd, { websiteSchema, itemListSchema } from '@/components/JsonLd'
import HomeClient from './HomeClient'

// 홈 자체는 클라이언트 컴포넌트라 구조화 데이터를 넣을 수 없어서 서버 컴포넌트로 감쌌다.
// 여기서 렌더한 JSON-LD는 첫 응답 HTML에 들어가므로 크롤러가 자바스크립트 없이 읽는다.
export const dynamic = 'force-dynamic'

export default function Home() {
  const posts = visiblePosts()
  return (
    <>
      <JsonLd data={[
        websiteSchema(),
        itemListSchema(posts, '진행 중인 공구', SITE_URL),
      ]} />
      <HomeClient />
    </>
  )
}
