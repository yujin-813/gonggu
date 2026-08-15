'use client'
import Link from 'next/link'
import { ExternalLink, ShoppingBag } from 'lucide-react'
import type { Post, PurchaseLink } from '@/lib/types'
import { PLATFORM_LABEL, PLATFORM_DISCLOSURE } from '@/lib/purchaseLinks'
import { fmtDate } from '@/lib/period'
import { track } from '@/lib/track'

// 공구가 끝난 상세 페이지에 붙는 안내. 검색으로 들어온 사용자는 두 가지 중 하나를 원한다 —
// (1) 비싸도 지금 바로 사기 (2) 비슷한 공구 기다리기. 그래서 대체 구매처와 진행 중 공구를
// 둘 다 제시한다.
//
// 가장 조심할 부분은 가격이다. 공동구매 가격과 현재 판매가는 다르므로, 지난 공구가는
// "당시" 라고 못박고 대체 구매처 가격은 확인 시점을 함께 적는다. 실시간 조회가 아니라서
// 확인한 가격이 없으면 숫자를 아예 쓰지 않고 "가격 확인하기"로만 보낸다.

interface Props {
  post: Post
  purchaseLinks: PurchaseLink[]
  related: Post[]
}

export default function EndedDealNotice({ post, purchaseLinks, related }: Props) {
  return (
    <div className="ended-wrap">
      <section className="ended-box">
        <h2 className="ended-title">이 공동구매는 종료되었습니다</h2>

        {post.price > 0 && (
          <div className="ended-price">
            <span className="ended-price-label">당시 공동구매 가격</span>
            <strong className="ended-price-value">{post.price.toLocaleString()}원</strong>
            {post.deadline && <span className="ended-price-date">{fmtDate(post.deadline)} 마감</span>}
          </div>
        )}

        {purchaseLinks.length > 0 ? (
          <>
            <p className="ended-lead">지금 바로 필요하다면 아래에서 구매할 수 있어요.</p>
            <div className="ended-links">
              {purchaseLinks.map(link => (
                <a
                  key={`${link.platform}-${link.url}`}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="ended-link-btn"
                  onClick={() => track('click', { postId: post.id, clickType: link.platform })}
                >
                  <ShoppingBag size={15} />
                  <span>
                    {PLATFORM_LABEL[link.platform]}에서{' '}
                    {link.price ? `${link.price.toLocaleString()}원에 구매하기` : '가격 확인하기'}
                  </span>
                  <ExternalLink size={13} />
                </a>
              ))}
            </div>

            {purchaseLinks.some(l => l.note) && (
              <ul className="ended-notes">
                {purchaseLinks.filter(l => l.note).map(l => (
                  <li key={`note-${l.platform}`}>{PLATFORM_LABEL[l.platform]}: {l.note}</li>
                ))}
              </ul>
            )}

            <p className="ended-caution">
              ※ 공동구매는 종료되었습니다. 현재 판매처의 가격은 당시 공동구매 가격과 다를 수 있습니다
              {purchaseLinks.some(l => l.checked_at)
                && ` (가격 확인: ${purchaseLinks.find(l => l.checked_at)!.checked_at!.slice(0, 10)})`}
              .
            </p>
            <p className="ended-disclosure">
              {[...new Set(purchaseLinks.map(l => PLATFORM_DISCLOSURE[l.platform]))].join(' ')}
            </p>
          </>
        ) : (
          <p className="ended-lead">
            현재 이 상품의 대체 구매처는 확인되지 않았어요. 아래에서 비슷한 공구를 찾아보세요.
          </p>
        )}
      </section>

      <section className="ended-related">
        <h2 className="ended-related-title">현재 진행 중인 비슷한 공구</h2>
        {related.length === 0 ? (
          <p className="ended-related-empty">
            같은 카테고리에 진행 중인 공구가 아직 없어요.{' '}
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
                      {r.price > 0 && <span className="ended-related-price">{r.price.toLocaleString()}원</span>}
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
    </div>
  )
}
