'use client'
import Link from 'next/link'
import { ExternalLink, ShoppingBag } from 'lucide-react'
import type { Post, PurchaseLink, PurchaseLinkRelation } from '@/lib/types'
import { PLATFORM_LABEL, PLATFORM_DISCLOSURE, disclosureText, isSameProduct, linkReason, linkRelation } from '@/lib/purchaseLinks'
import { fmtDate, isExpired } from '@/lib/period'
import { getDealVerdict, rateText } from '@/lib/dealGrade'
import { track, type ClickType } from '@/lib/track'

// 공구가 끝난 상세 페이지에 붙는 안내. 검색으로 들어온 사용자는 두 가지 중 하나를 원한다 —
// (1) 비싸도 지금 바로 사기 (2) 비슷한 공구 기다리기. 그래서 대체 구매처와 진행 중 공구를
// 둘 다 제시한다.
//
// 가장 조심할 부분은 가격이다. 공동구매 가격과 현재 판매가는 다르므로, 지난 공구가는
// "당시" 라고 못박고 대체 구매처 가격은 확인 시점을 함께 적는다. 실시간 조회가 아니라서
// 확인한 가격이 없으면 숫자를 아예 쓰지 않고 "가격 확인하기"로만 보낸다.
//
// 링크를 같은 상품(kind=same)과 비슷한 용도의 다른 상품(kind=alternative)으로 나눠 다르게
// 그린다. "오르다 매쓰파워빌더스"·"르베르360유모카"처럼 니치 브랜드는 쿠팡 파트너스에
// 동일 상품 자체가 없는 경우가 실제로 있었다(D-030에서 예상했던 신호). 같은 상품이 있으면
// 그것만 "구매하기"로 보여주고, 없을 때만 대체 상품을 — 다른 상품이라는 걸 분명히 밝히고
// 보여준다. 섞어서 "구매하기"로 내밀면 다른 상품을 같은 상품인 것처럼 파는 셈이 된다.

interface Props {
  post: Post
  purchaseLinks: PurchaseLink[]
  related: Post[]
  /**
   * 어느 부분을 그릴지.
   *
   * 마감 공구에서는 "지금 어디서 사나"가 제일 급한 정보인데, 공구 카드(제목·구성·판정)를 다
   * 지나야 구매 버튼이 나왔다. 그래서 구매 영역은 카드 위로 올리고 비슷한 공구 추천은 아래에
   * 남긴다 — 당시 가격을 보기도 전에 다른 공구를 권하는 건 순서가 뒤집힌 것이다.
   */
  section?: 'buy' | 'related'
  /** 추천이 진짜 비슷한 것인지, 같은 카테고리를 채운 것인지 */
  relatedKind?: 'similar' | 'influencer' | 'category'
  categoryLabel?: string
}

/** 참고 문구 자리에 고지 문구를 그대로 넣은 데이터가 있다 — 같은 말이 두 번 나가지 않게 거른다 */
function isDisclosureText(note: string, platform: PurchaseLink['platform']): boolean {
  const norm = (t: string) => t.replace(/["\u201c\u201d\s]/g, '')
  return norm(note).includes(norm(PLATFORM_DISCLOSURE[platform]).slice(0, 25))
}

// \ub300\uccb4 \uc0c1\ud488 \uc601\uc5ed \uc81c\ubaa9\u00b7\ubc30\uc9c0 \u2014 "\uc774\ub7f0 \uac74 \uc5b4\ub54c\uc694?" \uac19\uc740 \ubb49\ub6b1\uadf8\ub9b0 \ub9d0 \ub300\uc2e0 \uad00\uacc4\ub97c \uadf8\ub300\ub85c \ubc1d\ud78c\ub2e4
const ALT_SECTION_TITLE: Record<PurchaseLinkRelation, string> = {
  same: '\uc9c0\uae08 \uc0b4 \uc218 \uc788\uc5b4\uc694',
  same_brand: '\uac19\uc740 \ube0c\ub79c\ub4dc \uc0c1\ud488\ub3c4 \uc788\uc5b4\uc694',
  similar: '\ube44\uc2b7\ud55c \uc0c1\ud488\ub3c4 \ucc3e\uc544\ubd24\uc5b4\uc694',
}
const ALT_TAG_LABEL: Record<PurchaseLinkRelation, string> = {
  same: '\ub3d9\uc77c \uc0c1\ud488',
  same_brand: '\uac19\uc740 \ube0c\ub79c\ub4dc \u00b7 \ub3d9\uc77c \uc0c1\ud488 \uc544\ub2d8',
  similar: '\ube44\uc2b7\ud55c \uc0c1\ud488 \u00b7 \ub3d9\uc77c \uc0c1\ud488 \uc544\ub2d8',
}

export default function EndedDealNotice({ post, purchaseLinks, related, section, relatedKind = 'category', categoryLabel = '' }: Props) {
  const sameLinks = purchaseLinks.filter(isSameProduct)
  const altLinks = purchaseLinks.filter(l => !isSameProduct(l))
  const notesOf = (links: PurchaseLink[]) => links.filter(l => l.note && !isDisclosureText(l.note, l.platform))

  const renderLinks = (links: PurchaseLink[], onClickType: (l: PurchaseLink) => ClickType) => (
    <div className="ended-links">
      {links.map(link => (
        <a
          key={`${link.platform}-${link.url}`}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="ended-link-btn"
          onClick={() => track('click', { postId: post.id, clickType: onClickType(link) })}
        >
          <ShoppingBag size={15} />
          <span>
            {PLATFORM_LABEL[link.platform]}에서{' '}
            {link.price ? `${link.price.toLocaleString()}원에 지금 보기` : '가격 확인하기'}
          </span>
          <ExternalLink size={13} />
        </a>
      ))}
    </div>
  )

  // 마감 페이지는 "판단"보다 "다음 행동"이 우선이다 — 판정 카드 전체를 다시 그리지 않고,
  // 당시 가격 옆에 할인율 한 줄만 붙인다. 자세한 근거(옵션별 표 등)는 PostCard의 접이식
  // 판정 카드가 아래에서 맡는다
  const verdict = getDealVerdict(post)
  const rateLine = verdict.rateRange
    ? (verdict.rateRange.min === verdict.rateRange.max
        ? `약 ${rateText(verdict.rateRange.max)}했던 꿀딜`
        : `${Math.round(verdict.rateRange.min * 100)}~${Math.round(verdict.rateRange.max * 100)}% 저렴했던 꿀딜`)
    : verdict.discountRate !== null
    ? `${verdict.referenceLabel} 대비 약 ${rateText(verdict.discountRate)}했던 꿀딜`
    : null

  return (
    <div className="ended-wrap">
      {section !== 'related' && (
      <section className="ended-box">
        <h2 className="ended-title">이 공동구매는 종료됐어요</h2>

        {post.price > 0 && (
          <div className="ended-price">
            <span className="ended-price-label">당시 공구가</span>
            <strong className="ended-price-value">{post.price.toLocaleString()}원</strong>
            {rateLine && <span className="ended-price-rate">{rateLine}</span>}
            {post.deadline && <span className="ended-price-date">{fmtDate(post.deadline)} 마감</span>}
          </div>
        )}

        {sameLinks.length > 0 ? (
          <>
            <p className="ended-lead">지금 구매하려면</p>
            {renderLinks(sameLinks, l => l.platform as ClickType)}
            {sameLinks.some(l => l.checked_at) && (
              <p className="ended-checked-at">
                {sameLinks.find(l => l.checked_at)!.checked_at!.slice(0, 10)} 확인 가격 · 현재 가격은 달라질 수 있어요
              </p>
            )}

            {notesOf(sameLinks).length > 0 && (
              <ul className="ended-notes">
                {notesOf(sameLinks).map(l => (
                  <li key={`note-${l.platform}`}>{PLATFORM_LABEL[l.platform]}: {l.note}</li>
                ))}
              </ul>
            )}

            {disclosureText(sameLinks) && (
              <p className="ended-disclosure">{disclosureText(sameLinks)}</p>
            )}
          </>
        ) : altLinks.length > 0 ? (
          <>
            {/* 똑같은 상품 링크를 못 찾았을 때만 여기로 온다. "구매하기"와 문구·톤을 분명히
                갈라서, 다른 상품을 같은 상품인 것처럼 파는 일이 없게 한다. 단순 "구매하기"
                버튼이 아니라 상품명·추천 이유를 먼저 보여줘 광고처럼 안 읽히게 한다 */}
            <h3 className="ended-alt-title">{ALT_SECTION_TITLE[linkRelation(altLinks[0])]}</h3>
            <p className="ended-lead">
              같은 상품은 찾지 못했어요.<br />
              대신 비슷한 조건의 상품을 찾아봤어요.
            </p>
            <div className="ended-alt-list">
              {altLinks.map(link => (
                <a
                  key={`${link.platform}-${link.url}`}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="ended-alt-card"
                  onClick={() => track('click', { postId: post.id, clickType: link.platform })}
                >
                  {link.productName && <span className="ended-alt-name">{link.productName}</span>}
                  <span className="ended-alt-reason">{linkReason(link)}</span>
                  <span className="ended-alt-row">
                    <span className="ended-alt-price">
                      {link.price ? `${link.price.toLocaleString()}원` : '가격 확인하기'}
                    </span>
                    <span className="ended-alt-cta">
                      비슷한 상품 보기 <ExternalLink size={12} />
                    </span>
                  </span>
                  <span className="ended-alt-tag">{ALT_TAG_LABEL[linkRelation(link)]}</span>
                </a>
              ))}
            </div>

            <p className="ended-caution">
              ※ 이 공구와 같은 상품이 아니라서 저희가 가격을 비교하지 않았어요. 구성·품질을
              직접 확인하고 골라주세요.
            </p>
            {disclosureText(altLinks) && (
              <p className="ended-disclosure">{disclosureText(altLinks)}</p>
            )}
          </>
        ) : (
          <p className="ended-lead">
            이 상품은 지금 살 수 있는 곳을 찾지 못했어요. 아래에서 다른 공구를 골라보세요.
          </p>
        )}
      </section>
      )}

      {section !== 'buy' && (
      <section className="ended-related">
        {/* 카테고리만 같은 걸 "비슷한 공구"라고 부르면 거짓말이 된다. 곰탕 페이지에
            세이펜·그림책이 "비슷한 공구"로 떠 있었다. 무엇을 모아 왔는지 그대로 적는다. */}
        <h2 className="ended-related-title">
          {relatedKind === 'similar'
            ? '이런 건 어때요?'
            : relatedKind === 'influencer'
            ? '같은 인플루언서의 다른 공구'
            : `지금 진행 중인 다른 ${categoryLabel} 공구`}
        </h2>
        {related.length === 0 ? (
          <p className="ended-related-empty">
            지금 보여드릴 만한 공구가 없어요.{' '}
            <Link href="/">전체 공구 보러 가기 →</Link>
          </p>
        ) : (
          <>
            <ul className="ended-related-list">
              {related.map(r => (
                <li key={r.id}>
                  <Link href={`/post/${r.id}`} className="ended-related-item">
                    {r.img && <img src={r.img} alt="" loading="lazy" />}
                    <span className="ended-related-info">
                      <span className="ended-related-name">{r.title}</span>
                      <span className="ended-related-meta">
                        {r.price > 0 && <span className="ended-related-price">{r.price.toLocaleString()}원</span>}
                        {/* 마감됐지만 살 곳이 확인된 공구도 후보에 넣는다 — 관련도가 같으면
                            지금 살 수 있는 쪽이 쓸모 있다 */}
                        {isExpired(r) && <span className="ended-related-buyable">지금 살 수 있어요</span>}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href={`/category/${post.cat}`} className="ended-related-more">
              같은 카테고리 공구 전체보기 →
            </Link>
          </>
        )}
      </section>
      )}
    </div>
  )
}
