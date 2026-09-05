import type { Metadata } from 'next'
import { permanentRedirect } from 'next/navigation'
import { loadPosts } from '@/lib/store'
import { SITE_URL } from '@/lib/landing'
import { influencerNameOf, canonicalAccountFor, influencerItemsByName } from '@/lib/influencerItems'
import { getCuratedSubjectForInfluencer } from '@/lib/curatedSubjects'
import JsonLd, { itemListSchema, breadcrumbSchema } from '@/components/JsonLd'
import InfluencerPageClient from './InfluencerPageClient'

export const dynamic = 'force-dynamic'

// "도현맘 공구", "쑥쑥맘 공동구매"처럼 인플루언서 이름으로 찾는 검색이 실제로 많은데,
// 이 페이지가 'use client'라 제목이 홈과 똑같이 나오고 있었다. 서버 컴포넌트로 감싸
// 이름이 들어간 제목·설명을 붙이고 목록을 구조화 데이터로도 내보낸다.

// 메타데이터·JSON-LD는 화면이 실제로 보여주는 목록과 같은 것을 세야 한다.
// 예전에는 isCustomerVisible로 따로 세서, 화면엔 20건이 떠 있는데 검색엔진에는 "공동구매
// 0건"으로 나가는 계정이 74개 중 35개였다.
//
// 인스타 핸들이 바뀌면 post.account 값도 바뀐다 — 같은 사람인데 계정이 여러 개로 갈려서
// (실측: 표시 가능한 인플루언서 80명 중 13명) /influencer/[account]·sitemap에 각각 별도
// URL로 잡혀 검색 유입이 쪼개졌다. influencer_name은 안정적이라 이걸로 "같은 사람"을
// 묶고, 대표가 아닌 URL은 대표로 308 리다이렉트한다. 이미 /pick으로 등록된 인플루언서가
// 있으면(관리자가 고른 공구 모음, 계정 드리프트와 무관하게 전부 모음) 그게 더 완전한
// 대표라 그쪽으로 보낸다.
function resolve(rawAccount: string) {
  const account = decodeURIComponent(rawAccount)
  const normalized = account.startsWith('@') ? account : `@${account}`
  const all = loadPosts()
  const name = influencerNameOf(all, normalized)
  if (!name) return null
  const canonicalAccount = canonicalAccountFor(all, name)
  const pickSubject = getCuratedSubjectForInfluencer(name)
  return {
    name,
    canonicalAccount,
    pickSlug: pickSubject?.slug ?? null,
    isCanonicalUrl: normalized.toLowerCase() === canonicalAccount.toLowerCase(),
    items: influencerItemsByName(all, name),
  }
}

// 대표 URL이 아니면 리다이렉트해야 하는데, generateMetadata 안에서 permanentRedirect를
// 부르면 진짜 HTTP 308이 아니라 200 + <meta http-equiv="refresh"> 클라이언트 리다이렉트가
// 나간다(실측 확인 — 스트리밍 응답이 이미 200으로 시작된 뒤라 상태코드를 못 바꾼다).
// 검색엔진에 링크 신호를 제대로 넘기려면 진짜 308이어야 해서, 리다이렉트는 기본 export
// (페이지 컴포넌트) 쪽에서만 부른다 — generateMetadata는 계산만 하고 리다이렉트 안 함.
function redirectIfNotCanonical(data: ReturnType<typeof resolve>) {
  if (!data) return
  if (data.pickSlug) permanentRedirect(`/pick/${encodeURIComponent(data.pickSlug)}`)
  if (!data.isCanonicalUrl) {
    permanentRedirect(`/influencer/${encodeURIComponent(data.canonicalAccount.replace('@', ''))}`)
  }
}

export function generateMetadata({ params }: { params: { account: string } }): Metadata {
  const data = resolve(params.account)
  const handle = decodeURIComponent(params.account).replace('@', '')
  if (!data) {
    return { title: `${handle} 공구`, description: `${handle}님의 공동구매 정보를 꿀공구에서 확인하세요.` }
  }
  const { name, items } = data
  const count = items.length
  const pageTitle = `${name} 공동구매 일정·진행중 공구 모아보기`
  const shareTitle = `${pageTitle} | 꿀공구`
  const description = `${name}님의 공동구매 ${count}건을 모았어요. 상품별 가격과 마감일, 최저가 비교까지 한눈에 확인하세요.`
  const url = `${SITE_URL}/influencer/${encodeURIComponent(params.account)}`
  const image = items.find(p => p.img)?.img

  return {
    title: pageTitle,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'profile',
      locale: 'ko_KR',
      url,
      siteName: '꿀공구',
      title: shareTitle,
      description,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: shareTitle,
      description,
      images: image ? [image] : undefined,
    },
  }
}

export default function InfluencerPage({ params }: { params: { account: string } }) {
  const data = resolve(params.account)
  redirectIfNotCanonical(data)
  const path = `/influencer/${encodeURIComponent(params.account)}`

  // InfluencerPageClient가 예전엔 /api/posts/by-influencer를 클라이언트에서 fetch해서
  // 서버 HTML엔 "불러오는 중..."만 있고 실제 상품(제목·가격·이미지)은 검색엔진이 못
  // 읽었다(80개 페이지 전부 해당). 여기서 이미 계산한 걸 그대로 props로 내려서
  // 서버 HTML에 상품이 포함되게 한다 — /api/posts/by-influencer와 같은 모양으로 매핑.
  const initialInfluencer = data ? { account: data.canonicalAccount, name: data.name, source_url: data.items[0]?.source_url || null } : null
  const initialItems = data
    ? data.items.map(p => ({ id: p.id, title: p.title, brand: p.brand || null, price: p.price, img: p.img || '', link: p.purchase_url || p.url || '' }))
    : []

  return (
    <>
      {data && (
        <JsonLd data={[
          itemListSchema(data.items, `${data.name} 공구`, `${SITE_URL}${path}`),
          breadcrumbSchema([
            { name: '꿀공구', path: '/' },
            { name: '인플루언서', path: '/influencers' },
            { name: `${data.name} 공구`, path },
          ]),
        ]} />
      )}
      <InfluencerPageClient params={params} initialInfluencer={initialInfluencer} initialItems={initialItems} />
    </>
  )
}
