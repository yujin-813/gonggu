'use client'
import { ExternalLink, ShoppingBag } from 'lucide-react'
import type { Post, PurchaseLink } from '@/lib/types'
import { PLATFORM_LABEL, PLATFORM_DISCLOSURE } from '@/lib/purchaseLinks'
import { track } from '@/lib/track'

/**
 * 진행 중인 공구인데 다른 곳이 더 싼 경우("아쉽딜")에 붙는 안내.
 *
 * 판정기가 "이 공구는 다른 곳보다 비싸다"고 말해 놓고 살 곳을 안 알려주면, 고객은 그 사실만
 * 알고 빈손으로 나간다. 실제로 209,200원짜리 공구가 쿠팡에서 99,000원인 건이 있었다.
 * 아쉽딜에서만 띄우는 이유는, 꿀딜에 대체 구매처를 붙이면 "여기가 제일 싸다"고 판정해 놓고
 * 다른 데로 보내는 모양이 되기 때문이다(D-027).
 *
 * 공구 버튼은 그대로 둔다. 공구가 더 비싸다고 해서 고를 수 없게 만들 이유는 없다 — 구성이
 * 다를 수도 있고, 그 판단은 고객이 한다.
 *
 * 가격은 실시간 조회가 아니다. 그래서 확인 시점을 함께 적고, 확인한 가격이 없으면 숫자를
 * 아예 쓰지 않고 "가격 확인하기"로만 보낸다 — 종료 안내와 같은 규칙이다.
 */
export default function BetterPriceNotice({ post, purchaseLinks }: { post: Post; purchaseLinks: PurchaseLink[] }) {
  if (purchaseLinks.length === 0) return null

  const cheapest = purchaseLinks
    .filter(l => l.price && l.price > 0)
    .sort((a, b) => (a.price || 0) - (b.price || 0))[0]
  const saved = cheapest?.price && post.price ? post.price - cheapest.price : null

  return (
    <div className="ended-wrap">
      <section className="ended-box">
        <h2 className="ended-title">더 싸게 파는 곳이 있어요</h2>

        {cheapest?.price && saved && saved > 0 && (
          <div className="ended-price">
            <span className="ended-price-label">{PLATFORM_LABEL[cheapest.platform]}</span>
            <strong className="ended-price-value">{cheapest.price.toLocaleString()}원</strong>
            <span className="ended-price-date">공구가보다 {saved.toLocaleString()}원 싸요</span>
          </div>
        )}

        <p className="ended-lead">
          공동구매는 계속 진행 중이에요. 구성이 다를 수 있으니 확인하고 고르세요.
        </p>

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
          ※ 실시간 가격이 아니에요. 판매처 가격은 바뀔 수 있습니다
          {purchaseLinks.some(l => l.checked_at)
            && ` (가격 확인: ${purchaseLinks.find(l => l.checked_at)!.checked_at!.slice(0, 10)})`}
          .
        </p>
        <p className="ended-disclosure">
          {[...new Set(purchaseLinks.map(l => PLATFORM_DISCLOSURE[l.platform]))].join(' ')}
        </p>
      </section>
    </div>
  )
}
