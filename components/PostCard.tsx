'use client'
import { useState } from 'react'
import type { Post } from '@/lib/types'
import { daysLeft, getPeriodState, badgeFromState, periodTextFromState, isExpired, isNewPost } from '@/lib/period'
import PriceCompareModal from './PriceCompareModal'

const CAT_LABEL: Record<string, string> = {
  fashion: '👗 패션', beauty: '💄 뷰티', food: '🍱 식품',
  life: '🏠 생활용품', kids: '🧸 유아동', health: '💊 건강',
  pet: '🐾 반려동물', digital: '📱 디지털',
}

function dealJudgment(post: Post): { verdict: string; detail: string; cls: string } | null {
  if (!post.price || post.status === 'upcoming') return null
  // 관리자가 직접 입력한 판단 문구가 있으면 자동 계산보다 우선한다 — 자동 계산이 데이터
  // 부족으로 놓친 부분을 관리자가 아는 정보로 보완하는 용도 (자동 계산을 덮어써서 과장하는
  // 용도로 쓰이면 지금까지 지켜온 "틀린 정보는 안 보여준다" 원칙이 깨지니 주의해서 써야 함)
  if (post.custom_verdict) {
    return { verdict: post.custom_verdict, detail: post.custom_verdict_detail || '', cls: post.custom_verdict_cls || 'neutral' }
  }
  // 네이버 자동 매칭가가 있으면 우선 사용하고, 없으면 직접 입력된 정가라도 기준으로 삼는다
  // (자동 매칭은 니치 상품이면 실패하는 경우가 많아, 절반 가까운 공구가 아예 판단을 못 받고 있었음)
  const mp = post.market_price || post.origPrice
  if (!mp) return null
  const p  = post.price
  const label = post.market_price ? '네이버 최저가' : '정가'

  // 가격이 기준가 이상이면 할인 근거가 없는 것 — 괜히 좋다고 했다가 나중에 신뢰만 잃는다
  if (p >= mp) {
    return { verdict: '가격은 직접 비교해보세요', detail: '온라인 최저가와 비슷하거나 더 비쌀 수 있어요 — 구성품·배송비도 함께 확인해보세요', cls: 'check' }
  }

  const diff = mp - p
  const rate = Math.round((diff / mp) * 100)
  // 가격이 좋고 마감도 임박했을 때만 "지금 사야 할 이유"를 덧붙인다 (둘 다 사실일 때만 — 과장 없이)
  const dLeft = daysLeft(post.deadline)
  const urgent = !(post.is_evergreen_deal || post.is_always_on) && dLeft >= 0 && dLeft <= 2
  const urgentSuffix = urgent ? ' · ⏰ 마감임박' : ''

  if (p <= mp * 0.7)
    return { verdict: '완전 득템이에요', detail: `${label}보다 ${diff.toLocaleString()}원(${rate}%) 저렴${urgentSuffix}`, cls: 'great' }
  if (p <= mp * 0.9)
    return { verdict: '살만해요', detail: `${label}보다 ${diff.toLocaleString()}원 저렴${urgentSuffix}`, cls: 'good' }
  return { verdict: '가격 보통', detail: `온라인 최저가와 큰 차이 없어요${urgentSuffix}`, cls: 'neutral' }
}

interface PostCardProps {
  post: Post
  isBookmarked: boolean
  onToggleBookmark: (id: number) => void
  onJoin?: (id: number) => void
  siblings?: Post[]
  isFollowingAccount?: boolean
  isFollowingCategory?: boolean
  onToggleFollowAccount?: (account: string) => void
  onToggleFollowCategory?: (cat: string) => void
}

export default function PostCard({
  post, isBookmarked, onToggleBookmark, onJoin, siblings = [],
  isFollowingAccount, isFollowingCategory, onToggleFollowAccount, onToggleFollowCategory,
}: PostCardProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const [showCompare, setShowCompare] = useState(false)
  const compareCount = siblings.length
  const isUpcoming = post.status === 'upcoming'
  const periodState = getPeriodState(post)
  const badge = badgeFromState(periodState)
  const dt = periodTextFromState(periodState)
  const closed = isExpired(post)
  const isNew = !isUpcoming && isNewPost(post.scraped_at)
  // 관리자가 직접 입력했거나(source=manual), 자동 추출 신뢰도가 높을 때만 "확인됨"으로 표시한다 —
  // 애매한 걸 확인됐다고 하면 나중에 신뢰만 잃으므로, 확실할 때만 긍정 신호를 준다
  const extractionConfidence = (post.extraction_debug as Record<string, unknown> | null)?.extraction_confidence as string | undefined
  const isVerified = post.source === 'manual' || extractionConfidence === 'high'
  const judgment = dealJudgment(post)
  const discount =
    post.origPrice && post.origPrice > post.price
      ? Math.round((1 - post.price / post.origPrice) * 100)
      : 0

  const profileUrl = post.account
    ? `https://instagram.com/${post.account.replace('@', '')}`
    : '#'

  return (
    <div className="card">
      <div className="card-img-wrap">
        {post.img && !imgFailed ? (
          <img
            src={post.img}
            alt={post.title}
            onError={() => setImgFailed(true)}
            loading="lazy"
          />
        ) : (
          <div className="img-placeholder">{post.avatar || '🛍️'}</div>
        )}
        {badge && (
          <div className={`badge-deadline ${badge.cls}`}>
            {badge.icon} {badge.txt}
          </div>
        )}
        {isNew && <div className="badge-new">NEW</div>}
        <button
          className={`btn-bookmark ${isBookmarked ? 'active' : ''}`}
          onClick={() => onToggleBookmark(post.id)}
        >
          {isBookmarked ? '❤️' : '🤍'}
        </button>
      </div>

      <div className="card-body">
        <div className="card-top">
          <div className="avatar">{post.avatar || '🛍️'}</div>
          <span className="account-name">
            <a href={profileUrl} target="_blank" rel="noreferrer">
              {post.account}
            </a>
          </span>
          {onToggleFollowAccount && (
            <button
              onClick={() => onToggleFollowAccount(post.account)}
              title={isFollowingAccount ? '인플루언서 팔로우 취소' : '이 인플루언서 팔로우'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '0 2px', color: isFollowingAccount ? '#f59e0b' : '#cbd5e1', lineHeight: 1 }}
            >
              {isFollowingAccount ? '⭐' : '☆'}
            </button>
          )}
          <span className="cat-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            {CAT_LABEL[post.cat] || post.cat}
            {onToggleFollowCategory && (
              <button
                onClick={() => onToggleFollowCategory(post.cat)}
                title={isFollowingCategory ? '카테고리 팔로우 취소' : '이 카테고리 팔로우'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '0 0 0 2px', color: isFollowingCategory ? '#f59e0b' : '#94a3b8', lineHeight: 1 }}
              >
                {isFollowingCategory ? '⭐' : '☆'}
              </button>
            )}
          </span>
        </div>

        {post.brand && (
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', letterSpacing: '0.04em', marginBottom: 2 }}>
            {post.brand.toUpperCase()}
          </div>
        )}
        <div className="card-title">{post.title}</div>

        <div className="price-row">
          <span className="price-sale">{post.price.toLocaleString()}원</span>
          {discount > 0 && <span className="discount-rate">-{discount}%</span>}
          {post.origPrice && post.origPrice > post.price && (
            post.market_url
              ? <a href={post.market_url} target="_blank" rel="noopener noreferrer" className="price-orig" style={{ textDecoration: 'none' }}>
                  네이버쇼핑 {post.origPrice.toLocaleString()}원 →
                </a>
              : <span className="price-orig">정가 {post.origPrice.toLocaleString()}원</span>
          )}
        </div>

        {judgment && (
          <div className={`deal-judgment deal-judgment-${judgment.cls}`}>
            <span className="judgment-verdict">{judgment.verdict}</span>
            <span className="judgment-detail">{judgment.detail}</span>
          </div>
        )}

        {isVerified && (
          <div style={{ fontSize: 11, color: '#16a34a', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 3 }}>
            ✓ 가격·마감일 확인된 정보예요
          </div>
        )}

        {compareCount > 1 && (
          <button
            onClick={() => setShowCompare(true)}
            style={{
              width: '100%', marginBottom: 8,
              background: '#fef9c3', border: '1.5px solid #fbbf24',
              borderRadius: 8, padding: '6px 0',
              fontSize: 12, fontWeight: 700, color: '#92400e',
              cursor: 'pointer',
            }}
          >
            💰 {compareCount}개 가격 비교
          </button>
        )}

        <div className="card-footer">
          <div>
            <div className={`deadline-text ${dt.cls}`}>{dt.txt}</div>
            {(post.participants || 0) > 0 && (
              <div className="participants">
                ❤️ {(post.participants || 0).toLocaleString()} 좋아요
              </div>
            )}
          </div>
          <button
            className={`btn-join ${closed || isUpcoming || !(post.purchase_url || post.url) ? 'closed' : ''}`}
            onClick={() => {
              const link = post.purchase_url || post.url
              if (!closed && !isUpcoming && link) { onJoin?.(post.id); window.open(link, '_blank') }
            }}
            disabled={closed || isUpcoming || !(post.purchase_url || post.url)}
            style={isUpcoming ? { background: '#ede9fe', color: '#7c3aed', borderColor: '#c4b5fd' } : {}}
          >
            {closed ? '마감됨' : isUpcoming ? '오픈 예정 🗓️' : !(post.purchase_url || post.url) ? '링크 없음' : '공구 보기 →'}
          </button>
        </div>
      </div>

      {showCompare && (
        <PriceCompareModal
          posts={siblings}
          onClose={() => setShowCompare(false)}
          onJoin={onJoin}
        />
      )}
    </div>
  )
}
