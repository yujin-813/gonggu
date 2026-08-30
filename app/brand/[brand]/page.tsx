import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SITE_URL } from '@/lib/siteUrl'
import { brandPosts, allBrands } from '@/lib/brandPages'
import { getDealVerdict } from '@/lib/dealGrade'
import JsonLd, { itemListSchema, breadcrumbSchema } from '@/components/JsonLd'
import BrandPageClient from './BrandPageClient'

export const dynamic = 'force-dynamic'

function load(rawBrand: string) {
  const brand = decodeURIComponent(rawBrand)
  if (!allBrands().includes(brand)) return null
  return { brand, ...brandPosts(brand) }
}

// 진행 중 공구 중 실제로 등급이 매겨진(판정 대기가 아닌) 게 몇 건인지 — 설명문에
// "가격을 비교한다"고 써놓고 실제로는 비교가 하나도 없으면 원칙 1을 어기는 셈이라 확인한다
function comparedCount(posts: ReturnType<typeof brandPosts>['active']) {
  return posts.filter(p => getDealVerdict(p).display.key !== 'pending').length
}

export function generateMetadata({ params }: { params: { brand: string } }): Metadata {
  const data = load(params.brand)
  if (!data) return { title: '브랜드를 찾을 수 없어요' }
  const { brand, active, ended } = data
  // <title>은 루트 레이아웃 template("%s | 꿀공구")을 타므로 접미사를 붙이지 않는다
  const pageTitle = `${brand} 공구 가격 비교·최저가`
  const shareTitle = `${pageTitle} | 꿀공구`
  const compared = comparedCount(active)
  const description = active.length > 0
    ? `${brand} 공동구매 ${active.length}건이 진행 중이에요.${compared > 0 ? ` 그중 ${compared}건은 일반 판매가와 비교해 지금 사도 되는지 판정까지 확인할 수 있어요.` : ''}`
    : `${brand} 공동구매 ${ended.length}건의 지난 가격을 모았어요. 다음 공구가 열리면 여기서 바로 확인하세요.`
  const url = `${SITE_URL}/brand/${encodeURIComponent(brand)}`
  const image = [...active, ...ended].find(p => p.img)?.img

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

export default function BrandPage({ params }: { params: { brand: string } }) {
  const data = load(params.brand)
  if (!data) notFound()
  const { brand, active, ended } = data
  const path = `/brand/${encodeURIComponent(brand)}`
  const url = `${SITE_URL}${path}`

  return (
    <>
      <JsonLd data={[
        itemListSchema(active, `${brand} 공구`, url),
        breadcrumbSchema([{ name: '꿀공구', path: '/' }, { name: `${brand} 공구`, path }]),
      ]} />
      <BrandPageClient brand={brand} active={active} ended={ended} />
    </>
  )
}
