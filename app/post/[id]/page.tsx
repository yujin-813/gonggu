import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { loadPosts } from '@/lib/store'
import { isCustomerVisible, isPagePublic, isExpired, getPeriodState, periodLabel } from '@/lib/period'
import { SITE_URL } from '@/lib/landing'
import { CATEGORY_LABEL } from '@/lib/categoryIcons'
import { visiblePurchaseLinks, sameProductLinks } from '@/lib/purchaseLinks'
import { getDealVerdict } from '@/lib/dealGrade'
import { relatedPosts, type RelatedKind } from '@/lib/relatedPosts'
import { allBrands } from '@/lib/brandPages'
import { priceQA, periodQA } from '@/lib/postLongtail'
import JsonLd, { productSchema, breadcrumbSchema, faqSchema } from '@/components/JsonLd'
import type { Post } from '@/lib/types'
import { toPublicPost, toPublicPosts, stripAdminMemo } from '@/lib/publicPost'
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

/**
 * 같은 group_key로 묶인 다른 공구(다른 인플루언서의 같은 상품 공구가) — PostCard의
 * "N개 가격 비교"·PriceCompareModal이 이미 이 데이터를 받아 그리도록 돼 있는데, 지금까지
 * 상세 페이지엔 안 넘겨줘서 홈 목록에서만 보였다. loadPosts() 전체를 보므로 홈 화면
 * 리스트엔 없는(다른 카테고리·스크롤 밖) 형제 공구도 놓치지 않는다.
 */
function getSiblings(post: Post) {
  if (!post.group_key) return []
  return loadPosts().filter(p => p.group_key === post.group_key && isCustomerVisible(p))
}

/** 같은 상품의 지난 공구가 — /api/posts/group-history와 같은 계산(published였던 것만,
 * 최근 5건). 서버 컴포넌트라 API를 왕복할 필요 없이 loadPosts()로 바로 뽑는다. */
function getPastPrices(post: Post) {
  if (!post.group_key) return []
  return loadPosts()
    .filter(p => p.group_key === post.group_key && p.status === 'published' && p.price && p.id !== post.id)
    .map(p => ({ id: p.id, price: p.price, origPrice: p.origPrice ?? null, date: p.start_date || (p.scraped_at || '').slice(0, 10) || '' }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
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
  const priceLabel = post.price ? ` ${post.price.toLocaleString()}원` : ''
  // 인스타 캡션을 그대로 옮긴 제목이라 브랜드명이 안 들어간 경우가 있다("릴렉스틱/포인트링
  // /마사지볼"처럼) — 그러면 "브랜드명 공구" 검색으로는 이 페이지가 아예 안 걸린다.
  // 제목에 이미 있으면 중복으로 안 붙인다.
  const brandPrefix = post.brand && !post.title.includes(post.brand) ? `[${post.brand}] ` : ''
  // 마감 후에도 살 곳이 있으면 그 사실을 제목에서부터 말한다 — "OO 공구 지금 사도 될까"류
  // 검색에 "마감 후 구매처"보다 더 정확히 맞물린다. 살 곳이 없으면 과장하지 않는다(원칙 1).
  const hasBuyLink = ended && visiblePurchaseLinks(post).length > 0
  // "브랜드 상품명 공구 가격 일정" 형태로 실제 네이버 검색에 들어오는 문구와 맞춘다.
  // 가격이 없는 상품(아직 안 열린 공구 등)에서는 "가격"을 붙이지 않는다 — 없는 걸
  // 있다고 말하면 원칙 1 위반이다.
  const priceScheduleSuffix = post.price ? ' 가격·일정' : ''
  const pageTitle = ended
    ? `${brandPrefix}${post.title} 공구${priceLabel} | ${hasBuyLink ? '지금 살 수 있는 곳' : '마감 후 구매처'}`
    : `${brandPrefix}${post.title} 공구${priceScheduleSuffix}`
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
  const upcoming = getPeriodState(post).kind === 'upcoming'
  const betterPrice = !ended && getDealVerdict(post).display.key === 'meh'
  const related = ended ? getRelated(post) : { posts: [] as Post[], kind: 'category' as RelatedKind }
  // 진행 중일 때만 "다른 인플루언서 공구가도 비교" — 마감 공구는 EndedDealNotice가 이미
  // 별도의 비교(대체 구매처)를 보여주고 있어서 겹치지 않게 여기선 안 낸다
  const siblings = ended ? [] : getSiblings(post)
  const pastPrices = ended ? [] : getPastPrices(post)
  const brandPageExists = !!post.brand && allBrands().includes(post.brand)
  const qas = [priceQA(post), periodQA(post)].filter((qa): qa is NonNullable<typeof qa> => qa !== null)
  return (
    <>
      <JsonLd data={[
        productSchema(post),
        breadcrumbSchema([
          { name: '꿀공구', path: '/' },
          { name: `${CATEGORY_LABEL[post.cat]} 공구`, path: `/category/${post.cat}` },
          { name: post.title, path: `/post/${post.id}` },
        ]),
        ...(qas.length > 0 ? [faqSchema(qas)] : []),
      ]} />
      <PostDetailClient
        post={toPublicPost(post)}
        ended={ended}
        purchaseLinks={stripAdminMemo(
          ended ? visiblePurchaseLinks(post)         // 마감: 같은 상품·대체 상품 다 넘기고 컴포넌트가 나눠 그린다
          : betterPrice ? sameProductLinks(post)      // 아쉽딜: "더 싸다"는 같은 상품일 때만 말할 수 있다
          : []
        )}
        upcoming={upcoming}
        betterPrice={betterPrice}
        related={toPublicPosts(related.posts)}
        relatedKind={related.kind}
        categoryLabel={CATEGORY_LABEL[post.cat]}
        siblings={toPublicPosts(siblings)}
        pastPrices={pastPrices}
        brandPageExists={brandPageExists}
      />
    </>
  )
}
