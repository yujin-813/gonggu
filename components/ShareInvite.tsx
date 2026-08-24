'use client'
import { useState } from 'react'
import { Share2 } from 'lucide-react'
import type { Post } from '@/lib/types'
import { getDealVerdict, shareLabel, rateText } from '@/lib/dealGrade'
import { shareContent } from '@/lib/share'
import { track } from '@/lib/track'
import { SITE_URL } from '@/lib/siteUrl'

/**
 * 상세 페이지 아래에 붙는 공유 권유.
 *
 * 31일 동안 공유가 **0회**였다. 버튼이 없어서가 아니라, 이미지 위 우상단에 라벨 없는 36px
 * 아이콘 하나였기 때문으로 보인다. 게다가 판정에 맞춘 좋은 문구(shareLabel — "친구랑 같이
 * 사자고 하기")를 만들어 놓고 title 속성(툴팁)으로만 쓰고 있었다. 모바일에는 툴팁이 없다.
 *
 * 그래서 문구를 눈에 보이게 꺼내고, 무엇이 전송되는지 적는다. 우리는 판정을 그린 800×400
 * 공유 카드를 이미 만들어 두었는데(/api/og/deal/[id]) 사용자는 그게 있는 줄 몰랐다.
 *
 * 찜이 아니라 공유를 먼저 손대는 이유 — 공유는 재방문 없이도 효용이 있고(친구에게 보냄)
 * 우리에겐 신규 유입이 된다. 찜은 다시 와야 의미가 있는데 재방문이 7%다.
 */
export default function ShareInvite({ post }: { post: Post }) {
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const verdict = getDealVerdict(post)
  const label = shareLabel(verdict.grade?.key ?? null)

  const summary = verdict.discountRate !== null && verdict.discountRate > 0
    ? `${verdict.display.label} · ${rateText(verdict.discountRate)}`
    : verdict.display.label

  async function onShare() {
    setBusy(true)
    const result = await shareContent({
      title: `${post.title} — ${summary}`,
      description: !post.price
        ? '가격 공개 전'
        : verdict.referencePrice
        ? `공구가 ${post.price.toLocaleString()}원 · ${verdict.referenceLabel} ${verdict.referencePrice.toLocaleString()}원`
        : `공구가 ${post.price.toLocaleString()}원`,
      imageUrl: `${SITE_URL}/api/og/deal/${post.id}`,
      url: `${SITE_URL}/post/${post.id}`,
      buttonLabel: '공구 보러 가기',
    })
    setBusy(false)
    if (result !== 'failed') track('share', { postId: post.id })
    if (result === 'clipboard') { setCopied(true); setTimeout(() => setCopied(false), 2000) }
  }

  return (
    <div className="share-invite">
      <button className="share-invite-btn" onClick={onShare} disabled={busy}>
        <Share2 size={16} strokeWidth={2.5} />
        <span>{copied ? '링크가 복사되었어요' : label}</span>
      </button>
      <p className="share-invite-note">
        {summary} 판정이 그려진 카드가 함께 전송돼요
      </p>
    </div>
  )
}
