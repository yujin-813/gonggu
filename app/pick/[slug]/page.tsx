import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SITE_URL } from '@/lib/siteUrl'
import { getCuratedSubject, subjectPosts } from '@/lib/curatedSubjects'
import { getDealVerdict } from '@/lib/dealGrade'
import JsonLd, { itemListSchema, breadcrumbSchema } from '@/components/JsonLd'
import PickPageClient from './PickPageClient'

export const dynamic = 'force-dynamic'

const KIND_LABEL: Record<string, string> = { brand: '브랜드', influencer: '인플루언서', seller: '셀러' }

function load(rawSlug: string) {
  const slug = decodeURIComponent(rawSlug)
  const subject = getCuratedSubject(slug)
  if (!subject) return null
  return { subject, ...subjectPosts(subject) }
}

// 진행 중 공구 중 실제로 등급이 매겨진(판정 대기가 아닌) 게 몇 건인지 — 설명문에
// "가격을 비교한다"고 써놓고 실제로는 비교가 하나도 없으면 원칙 1을 어기는 셈이라 확인한다
function comparedCount(posts: ReturnType<typeof subjectPosts>['active']) {
  return posts.filter(p => getDealVerdict(p).display.key !== 'pending').length
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const data = load(params.slug)
  if (!data) return { title: '공구 모음을 찾을 수 없어요' }
  const { subject, active, upcoming, ended } = data
  const kindLabel = KIND_LABEL[subject.kind] || ''
  // <title>은 루트 레이아웃 template("%s | 꿀공구")을 타므로 접미사를 붙이지 않는다
  const pageTitle = `${subject.label} 공구 모음`
  const shareTitle = `${pageTitle} | 꿀공구`
  const compared = comparedCount(active)
  const description = active.length > 0
    ? `${kindLabel} ${subject.label}의 공동구매 ${active.length}건이 진행 중이에요.${compared > 0 ? ` 그중 ${compared}건은 일반 판매가와 비교해 지금 사도 되는지 판정까지 확인할 수 있어요.` : ''}`
    : upcoming.length > 0
      ? `${kindLabel} ${subject.label}의 오픈 예정 공구 ${upcoming.length}건을 모았어요.`
      : `${kindLabel} ${subject.label}의 지난 공구 ${ended.length}건의 가격을 모았어요. 다음 공구가 열리면 여기서 바로 확인하세요.`
  const url = `${SITE_URL}/pick/${encodeURIComponent(subject.slug)}`
  const image = [...active, ...upcoming, ...ended].find(p => p.img)?.img

  return {
    title: pageTitle,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
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

export default function PickPage({ params }: { params: { slug: string } }) {
  const data = load(params.slug)
  if (!data) notFound()
  const { subject, active, upcoming, ended } = data
  const path = `/pick/${encodeURIComponent(subject.slug)}`
  const url = `${SITE_URL}${path}`

  return (
    <>
      <JsonLd data={[
        itemListSchema(active, `${subject.label} 공구`, url),
        breadcrumbSchema([{ name: '꿀공구', path: '/' }, { name: `${subject.label} 공구 모음`, path }]),
      ]} />
      <PickPageClient subject={subject} active={active} upcoming={upcoming} ended={ended} />
    </>
  )
}
