import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { loadPosts } from '@/lib/store'
import { isCustomerVisible, isPagePublic, isExpired, getPeriodState, periodLabel } from '@/lib/period'
import { SITE_URL } from '@/lib/landing'
import { CATEGORY_LABEL } from '@/lib/categoryIcons'
import { visiblePurchaseLinks } from '@/lib/purchaseLinks'
import { getDealVerdict } from '@/lib/dealGrade'
import { relatedPosts, type RelatedKind } from '@/lib/relatedPosts'
import JsonLd, { productSchema, breadcrumbSchema } from '@/components/JsonLd'
import type { Post } from '@/lib/types'
import PostDetailClient from './PostDetailClient'

const RELATED_LIMIT = 6

// 마감된 공구도 페이지를 유지한다 — isCustomerVisible은 마감을 걸러내므로 여기서 쓰면
// 검색에 색인된 URL이 마감과 동시에 404가 된다. 공개된 적이 있는지만 보는 isPagePublic을
// 쓰고, 화면은 아래 ended 플래그로 종료 상태로 바꾼다.
function getPost(rawId: string) {
  const id = parseInt(rawId, 10)
  if (Number.isNaN(id)) return null
  const post = loadPosts().find(p => p.id === id)
  if (!post || !isPagePublic(post)) return null
  return post
}

/** 종료 페이지 하단에 붙일 "비슷한 공구" — 같은 카테고리에서 진행 중인 것만 */
function getRelated(post: Post) {
  return relatedPosts(post, loadPosts(), RELATED_LIMIT)
}

// 기존 설명은 "13,800원 — 꿀공구에서 확인해보세요"뿐이라 검색 결과에서 상품을 구분할
// 단서가 없었다. 브랜드·인플루언서·판매기간을 넣어 "브랜드명 공구" 같은 검색어와 실제로
// 겹치게 하고, 사용자가 결과 목록에서 고를 수 있을 만큼의 정보를 담는다.
function buildDescription(post: Post, ended: boolean): string {
  const parts: string[] = []
  if (post.brand) parts.push(post.brand)
  parts.push(post.title)
  const head = parts.join(' ')

  const detail: string[] = []
  if (post.price) detail.push(ended ? `당시 공동구매가 ${post.price.toLocaleString()}원` : `${post.price.toLocaleString()}원`)
  if (post.influencer_name) detail.push(`${post.influencer_name} 공구`)
  else if (post.account) detail.push(`${post.account.replace('@', '')} 공구`)
  // periodLabel은 관리자용 문구다("마감일 미확인 (40일째)"). 기간을 단정할 수 없는 상태는
  // 검색 결과에 나가는 설명에서 통째로 뺀다 — 우리 사정을 고객 화면에 쓰지 않는다(원칙 3)
  const periodKind = getPeriodState(post).kind
  const period = periodKind === 'evergreen' || periodKind === 'deadline_unknown' ? '' : periodLabel(post)
  if (period) detail.push(period)
  detail.push(`${CATEGORY_LABEL[post.cat] || ''} 카테고리`.trim())

  // 종료돼도 설명을 비우지 않는다 — 검색으로 계속 들어오므로, 지금 이 페이지에서 무엇을
  // 할 수 있는지(대체 구매처·비슷한 공구)를 알려주는 편이 이탈을 줄인다
  const tail = ended
    ? '해당 공동구매는 종료되었습니다. 현재 구매 가능한 판매처와 비슷한 공동구매를 확인할 수 있습니다.'
    : '꿀공구에서 최저가와 마감일을 확인하세요.'

  return `${head} — ${detail.filter(Boolean).join(' · ')}. ${tail}`
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const post = getPost(params.id)
  if (!post) return { title: '공구를 찾을 수 없어요' }
  // 페이지 <title>은 루트 레이아웃의 template("%s | 꿀공구")을 타므로 접미사를 붙이지 않는다.
  // OG/Twitter 태그는 템플릿을 타지 않으므로 완결된 문자열을 직접 넣어야 한다.
  const ended = isExpired(post)
  // 종료돼도 title을 없애지 않는다. "OO 공동구매 가격" 형태로 유지해야 이미 색인된
  // 검색어("상품명 공동구매", "상품명 가격")와 계속 맞물린다.
  const pageTitle = ended
    ? `${post.title} 공동구매 가격 및 구매처`
    : `${post.title} 공동구매 가격 및 기간`
  const shareTitle = `${pageTitle} | 꿀공구`
  const description = buildDescription(post, ended)
  const url = `${SITE_URL}/post/${post.id}`

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
      images: post.img ? [{ url: post.img }] : undefined,
    },
    twitter: {
      card: post.img ? 'summary_large_image' : 'summary',
      title: shareTitle,
      description,
      images: post.img ? [post.img] : undefined,
    },
  }
}

export default function PostPage({ params }: { params: { id: string } }) {
  const post = getPost(params.id)
  if (!post) notFound()
  const ended = isExpired(post)
  // 공구가 더 비싼 경우(아쉽딜)에는 진행 중이어도 대체 구매처를 보여준다 — 판정만 하고
  // 살 곳을 안 알려주면 고객은 "여기가 비싸다"는 사실만 알고 빈손으로 나간다.
  // 꿀딜·괜찮딜에는 붙이지 않는다. "여기가 제일 싸다"고 해 놓고 다른 데로 보내는 모양이
  // 되기 때문이다 (D-027).
  const betterPrice = !ended && getDealVerdict(post).display.key === 'meh'
  const related = ended ? getRelated(post) : { posts: [] as Post[], kind: 'category' as RelatedKind }
  return (
    <>
      <JsonLd data={[
        productSchema(post),
        breadcrumbSchema([
          { name: '꿀공구', path: '/' },
          { name: `${CATEGORY_LABEL[post.cat]} 공구`, path: `/category/${post.cat}` },
          { name: post.title, path: `/post/${post.id}` },
        ]),
      ]} />
      <PostDetailClient
        post={post}
        ended={ended}
        purchaseLinks={ended || betterPrice ? visiblePurchaseLinks(post) : []}
        betterPrice={betterPrice}
        related={related.posts}
        relatedKind={related.kind}
        categoryLabel={CATEGORY_LABEL[post.cat]}
      />
    </>
  )
}
