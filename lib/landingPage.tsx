import type { Metadata } from 'next'
import type { Post } from './types'
import type { LandingCopy } from './landing'
import { SITE_URL, LANDING_KEYS, CATEGORY_KEYS, landingCopy, categoryCopy } from './landing'
import { CATEGORY_LABEL } from './categoryIcons'
import DealListClient from '@/components/DealListClient'
import JsonLd, { itemListSchema, breadcrumbSchema } from '@/components/JsonLd'

// /today, /deadline, /monthly, /category/[cat]가 metadata와 렌더를 똑같이 만들도록 모아둔 곳.
// 페이지 파일에는 "어떤 공구를 고를지"만 남기고 나머지는 전부 여기서 처리한다.

export function landingMetadata(copy: LandingCopy, posts: Post[]): Metadata {
  const url = `${SITE_URL}${copy.path}`
  const shareTitle = `${copy.title} | 꿀공구`
  const image = posts.find(p => p.img)?.img
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      locale: 'ko_KR',
      url,
      siteName: '꿀공구',
      title: shareTitle,
      description: copy.description,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: shareTitle,
      description: copy.description,
      images: image ? [image] : undefined,
    },
  }
}

/** 현재 페이지를 뺀 나머지 모아보기 링크 — 크롤러가 페이지 사이를 옮겨다닐 수 있게 한다.
 * 성격이 다른 링크(시간·인기 기준 모음 vs 카테고리)를 한 줄에 섞어 나열하면 뭐가 뭔지
 * 안 읽혀서 두 그룹으로 나눈다 — 링크 자체는 그대로라 SEO엔 영향 없다. */
function relatedLinks(currentPath: string) {
  const timely = [
    ...LANDING_KEYS.map(k => {
      const c = landingCopy(k, 0)
      return { href: c.path, label: c.h1.replace(/\s*\(.*\)$/, '') }
    }),
    { href: '/influencers', label: '인플루언서별 공구' },
  ].filter(l => l.href !== currentPath)
  const category = CATEGORY_KEYS
    .map(cat => ({ href: `/category/${cat}`, label: `${CATEGORY_LABEL[cat]} 공구` }))
    .filter(l => l.href !== currentPath)
  return [
    { title: '모아보기', links: timely },
    { title: '카테고리', links: category },
  ].filter(g => g.links.length > 0)
}

export function LandingPage({ copy, posts }: { copy: LandingCopy; posts: Post[] }) {
  const url = `${SITE_URL}${copy.path}`
  return (
    <>
      <JsonLd data={[
        itemListSchema(posts, copy.h1, url),
        breadcrumbSchema([{ name: '꿀공구', path: '/' }, { name: copy.h1, path: copy.path }]),
      ]} />
      <DealListClient
        h1={copy.h1}
        description={copy.description}
        empty={copy.empty}
        posts={posts}
        related={relatedLinks(copy.path)}
      />
    </>
  )
}

export { landingCopy, categoryCopy }
