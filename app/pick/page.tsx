import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/siteUrl'
import { listCuratedSubjects, subjectPosts } from '@/lib/curatedSubjects'
import JsonLd, { breadcrumbSchema } from '@/components/JsonLd'
import PickIndexClient from './PickIndexClient'

export const dynamic = 'force-dynamic'

function load() {
  return listCuratedSubjects().map(subject => {
    const { active, upcoming, ended } = subjectPosts(subject)
    const thumbnail = [...active, ...upcoming, ...ended].find(p => p.img)?.img || null
    return { subject, activeCount: active.length, upcomingCount: upcoming.length, endedCount: ended.length, thumbnail }
  })
}

export function generateMetadata(): Metadata {
  const items = load()
  const pageTitle = '브랜드·인플루언서 공구 모음'
  const shareTitle = `${pageTitle} | 꿀공구`
  const description = items.length > 0
    ? `${items.map(i => i.subject.label).join(', ')} 등 ${items.length}곳의 공구를 모아 한눈에 볼 수 있어요.`
    : '브랜드·인플루언서별 공구를 모아 한눈에 볼 수 있어요.'
  const url = `${SITE_URL}/pick`

  return {
    title: pageTitle,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website', locale: 'ko_KR', url, siteName: '꿀공구',
      title: shareTitle, description,
    },
    twitter: { card: 'summary', title: shareTitle, description },
  }
}

export default function PickIndexPage() {
  const items = load()
  return (
    <>
      <JsonLd data={breadcrumbSchema([
        { name: '꿀공구', path: '/' },
        { name: '공구 모음', path: '/pick' },
      ])} />
      <PickIndexClient items={items} />
    </>
  )
}
