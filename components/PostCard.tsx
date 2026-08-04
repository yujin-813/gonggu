'use client'
import { useState } from 'react'
import type { Post } from '@/lib/types'
import { daysLeft, getPeriodState, badgeFromState, periodTextFromState, isExpired, isNewPost, type BadgeIcon, type PeriodIcon } from '@/lib/period'
import { CATEGORY_LABEL, categoryIcon } from '@/lib/categoryIcons'
import {
  Heart, Star, Wallet, CheckCircle2, Calendar, CalendarClock,
  Package, Flame, Lock, Timer, Zap, ExternalLink,
} from 'lucide-react'
import PriceCompareModal from './PriceCompareModal'

const BADGE_ICON: Record<BadgeIcon, typeof Calendar> = {
  'calendar-clock': CalendarClock, package: Package, flame: Flame, lock: Lock, timer: Timer,
}
const PERIOD_ICON: Record<PeriodIcon, typeof Calendar> = { calendar: Calendar, zap: Zap }
const PARTNERS_LABEL: Record<'naver' | 'coupang', string> = { naver: '네이버', coupang: '쿠팡' }
// 공정거래위원회 지침상 추천인(당사)이 경제적 대가를 받는 관계는 반드시 고지해야 함 —
// 쿠팡 파트너스는 운영정책에 명시된 지정 문구를 그대로 사용
const PARTNERS_DISCLOSURE: Record<'naver' | 'coupang', string> = {
  coupang: '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.',
  naver: '이 포스팅은 네이버 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.',
}

function dealJudgment(post: Post): { verdict: string; detail: string; cls: string } | null {
  if (!post.price || post.status === 'upcoming') return null
  // 관리자가 직접 입력한 판단 문구가 있으면 자동 계산보다 우선한다 — 자동 계산이 데이터
  // 부족으로 놓친 부분을 관리자가 아는 정보로 보완하는 용도 (자동 계산을 덮어써서 과장하는
  // 용도로 쓰이면 지금까지 지켜온 "틀린 정보는 안 보여준다" 원칙이 깨지니 주의해서 써야 함)
  if (post.custom_verdict) {
    return { verdict: post.custom_verdict, detail: post.custom_verdict_detail || '', cls: post.custom_verdict_cls || 'neutral' }
  }
  // 관리자가 직접 입력/검색해 확인한 정가(origPrice)가 있으면 그걸 우선 기준으로 삼는다 —
  // 자동 매칭(market_price)은 니치 상품이거나 옵션이 다르면 엉뚱한 상품과 매칭돼 있을 수 있어서,
  // 사람이 직접 확인한 값보다 신뢰도가 낮다. AddPostModal에도 "직접 입력하면 그 값이 우선
  // 사용돼요"라고 안내하고 있으니 계산도 그 안내와 일치해야 한다.
  const mp = post.origPrice || post.market_price
  // 비교 기준가가 아예 없는 경우 — "여기서만 판매"처럼 확인 안 된 걸 단정하지 않고,
  // 검색에 안 걸렸다는 사실만 담백하게 알려준다
  if (!mp) {
    return { verdict: '네이버 최저가 정보가 없어요', detail: '이 상품은 네이버 쇼핑에서 검색되지 않았어요', cls: 'neutral' }
  }
  const p  = post.price
  // origPrice를 직접 타이핑만 하고 네이버 링크(market_url)를 안 남겼으면 "정가", 그 외엔 네이버 기준
  const label = post.origPrice && !post.market_url ? '정가' : '네이버 최저가'
  // 자동 매칭된 가격이 이 공구와 구성이 달라 단순 비교가 부정확할 수 있을 때 관리자가 남긴
  // 참고 문구 — 자동 계산 결과를 지우지 않고 뒤에 그대로 덧붙인다
  const noteSuffix = post.market_price_note ? ` · ${post.market_price_note}` : ''

  // 가격이 기준가 이상이면 할인 근거가 없는 것 — 괜히 좋다고 했다가 나중에 신뢰만 잃는다
  if (p >= mp) {
    return { verdict: '가격은 직접 비교해보세요', detail: `온라인 최저가와 비슷하거나 더 비쌀 수 있어요 — 구성품·배송비도 함께 확인해보세요${noteSuffix}`, cls: 'check' }
  }

  const diff = mp - p
  const rate = Math.round((diff / mp) * 100)
  // 가격이 좋고 마감도 임박했을 때만 "지금 사야 할 이유"를 덧붙인다 (둘 다 사실일 때만 — 과장 없이)
  const dLeft = daysLeft(post.deadline)
  const urgent = !(post.is_evergreen_deal || post.is_always_on) && dLeft >= 0 && dLeft <= 2
  const urgentSuffix = urgent ? ' · 마감임박' : ''

  if (p <= mp * 0.7)
    return { verdict: '완전 득템이에요', detail: `${label}보다 ${diff.toLocaleString()}원(${rate}%) 저렴${urgentSuffix}${noteSuffix}`, cls: 'great' }
  if (p <= mp * 0.9)
    return { verdict: '살만해요', detail: `${label}보다 ${diff.toLocaleString()}원 저렴${urgentSuffix}${noteSuffix}`, cls: 'good' }
  return { verdict: '가격 보통', detail: `온라인 최저가와 큰 차이 없어요${urgentSuffix}${noteSuffix}`, cls: 'neutral' }
}

interface PostCardProps {
  post: Post
  isBookmarked: boolean
  onToggleBookmark: (id: number) => void
  onJoin?: (id: number) => void
  siblings?: Post[]
  pastPrices?: { id: number; price: number; origPrice: number | null; date: string }[]
  isFollowingAccount?: boolean
  onToggleFollowAccount?: (account: string) => void
}

export default function PostCard({
  post, isBookmarked, onToggleBookmark, onJoin, siblings = [], pastPrices = [],
  isFollowingAccount, onToggleFollowAccount,
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
  // 절약 금액은 원화로(체감이 잘 옴), 퍼센트도 괄호로 같이 보여준다 — "네이버보다 8,300원(15%) 저렴"
  const savedAmount =
    post.origPrice && post.origPrice > post.price
      ? post.origPrice - post.price
      : 0
  const savedRate = savedAmount > 0 && post.origPrice ? Math.round((savedAmount / post.origPrice) * 100) : 0
  const savedLabel = post.market_url ? '네이버' : '정가'

  const profileUrl = post.account
    ? `https://instagram.com/${post.account.replace('@', '')}`
    : '#'

  const purchaseLink = post.purchase_url || post.url
  const canOpenPurchase = !closed && !isUpcoming && !!purchaseLink
  const openPurchaseLink = () => {
    if (!canOpenPurchase) return
    onJoin?.(post.id)
    window.open(purchaseLink, '_blank')
  }

  const CatIcon = categoryIcon(post.cat)
  const BadgeIconEl = badge ? BADGE_ICON[badge.icon] : null
  const PeriodIconEl = PERIOD_ICON[dt.icon]

  return (
    <div className="card">
      <div
        className={`card-img-wrap ${canOpenPurchase ? 'clickable' : ''}`}
        onClick={openPurchaseLink}
      >
        {post.img && !imgFailed ? (
          <>
            {/* 뒷배경: 꽉 채워 흐리게 — 앞의 원본 이미지가 잘리지 않게 여백을 자연스럽게 채워줌 */}
            <img className="card-img-bg" src={post.img} alt="" aria-hidden="true" />
            <img
              className="card-img-fg"
              src={post.img}
              alt={post.title}
              onError={() => setImgFailed(true)}
              loading="lazy"
            />
          </>
        ) : (
          <div className="img-placeholder"><CatIcon size={40} strokeWidth={1.5} /></div>
        )}
        {badge && BadgeIconEl && (
          <div className={`badge-deadline ${badge.cls}`}>
            <BadgeIconEl size={13} strokeWidth={2.25} /> {badge.txt}
          </div>
        )}
        {isNew && <div className="badge-new">NEW</div>}
        <button
          className={`btn-bookmark ${isBookmarked ? 'active' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleBookmark(post.id) }}
        >
          <Heart size={16} fill={isBookmarked ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="card-body">
        <div className="card-top">
          <div className="avatar"><CatIcon size={15} strokeWidth={2} /></div>
          <span className="account-name">
            <a href={profileUrl} target="_blank" rel="noreferrer">
              {post.account}
            </a>
          </span>
          {onToggleFollowAccount && (
            <button
              onClick={() => onToggleFollowAccount(post.account)}
              title={isFollowingAccount ? '인플루언서 팔로우 취소' : '이 인플루언서 팔로우'}
              className="btn-follow-star"
              style={{ color: isFollowingAccount ? '#f59e0b' : '#cbd5e1' }}
            >
              <Star size={14} fill={isFollowingAccount ? 'currentColor' : 'none'} />
            </button>
          )}
          <span className="cat-tag">
            {CATEGORY_LABEL[post.cat] || post.cat}
          </span>
        </div>

        {post.brand && (
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', letterSpacing: '0.04em', marginBottom: 2 }}>
            {post.brand.toUpperCase()}
          </div>
        )}
        <div className="card-title">{post.title}</div>

        {/* 가장 중요한 정보: 얼마인지 · 얼마나 싼지 — 카드에서 가장 크게 */}
        <div className="price-block">
          <span className="price-sale-big">{post.price.toLocaleString()}원</span>
          {savedAmount > 0 && (
            <span className="discount-chip">{savedLabel}보다 {savedAmount.toLocaleString()}원({savedRate}%) 저렴</span>
          )}
        </div>
        {post.origPrice && post.origPrice > post.price && (
          post.market_url
            ? <a href={post.market_url} target="_blank" rel="noopener noreferrer" className="price-orig" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: post.market_price ? 2 : 8 }}>
                네이버쇼핑 {post.origPrice.toLocaleString()}원 →
              </a>
            : <span className="price-orig" style={{ display: 'inline-block', marginBottom: 8 }}>정가 {post.origPrice.toLocaleString()}원</span>
        )}
        {post.market_price && (
          <div style={{ fontSize: 10, color: 'var(--gray-3)', marginBottom: 8 }}>네이버 최저가 기준 비교</div>
        )}
        {/* 같은 상품(비교그룹)의 지난 공구가 — 지금 공구가 판단(dealJudgment)과는 별개로,
            "예전엔 얼마였지" 참고만 담백하게. 가장 최근 것 하나만 보여줌 */}
        {pastPrices.length > 0 && (
          <div style={{ fontSize: 10, color: 'var(--gray-3)', marginBottom: 8 }}>
            📈 지난 공구가 {pastPrices[0].date && `${pastPrices[0].date.slice(5).replace('-', '.')} · `}{pastPrices[0].price.toLocaleString()}원
          </div>
        )}

        {/* 두 번째로 중요한 정보: 기간이 언제까지인지 — 독립된 줄로 항상 노출 */}
        {dt.txt && (
          <div className={`period-row ${dt.cls}`}>
            <PeriodIconEl size={13} strokeWidth={2.25} />
            <span>{dt.txt}</span>
          </div>
        )}

        {judgment && (
          <div className={`deal-judgment deal-judgment-${judgment.cls}`}>
            <span className="judgment-verdict">{judgment.verdict}</span>
            <span className="judgment-detail">{judgment.detail}</span>
          </div>
        )}

        {/* 파트너스(제휴) 대체 구매 링크 — dealJudgment(공구 가격 판단)와는 별개로, 참고용 대체
            구매처만 담백하게 안내한다. 관리자가 platform/price/url을 모두 채우고 노출을 켰을 때만 표시.
            쿠팡 파트너스는 공정위 지침에 따라 경제적 대가 관계를 고지하는 문구를 반드시 함께 노출해야 함
            (쿠팡 파트너스 운영정책에 명시된 지정 문구) — 네이버도 같은 취지로 동일 원칙 적용 */}
        {post.partners_visible && post.partners_platform && post.partners_price && post.partners_url && (
          <div style={{ marginBottom: 8 }}>
            <a
              href={post.partners_url}
              target="_blank"
              rel="noopener noreferrer sponsored"
              onClick={e => e.stopPropagation()}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11, color: '#0369a1', background: '#f0f9ff',
                border: '1px solid #bae6fd', borderRadius: '8px 8px 0 0',
                padding: '5px 8px', textDecoration: 'none',
              }}
            >
              <ExternalLink size={11} />
              {PARTNERS_LABEL[post.partners_platform]}에서도 {post.partners_price.toLocaleString()}원에 구매 가능
              {post.partners_option_note && <span style={{ color: '#64748b' }}>· {post.partners_option_note}</span>}
            </a>
            <div style={{
              fontSize: 10, color: '#64748b', background: '#f8fafc',
              border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px',
              padding: '4px 8px',
            }}>
              {PARTNERS_DISCLOSURE[post.partners_platform]}
            </div>
          </div>
        )}

        {isVerified && (
          <div style={{ fontSize: 11, color: '#16a34a', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <CheckCircle2 size={13} /> 가격·마감일 확인된 정보예요
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
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}
          >
            <Wallet size={13} /> {compareCount}개 가격 비교
          </button>
        )}

        {(post.participants || 0) > 0 && (
          <div className="participants">
            <Heart size={12} fill="currentColor" /> {(post.participants || 0).toLocaleString()} 좋아요
          </div>
        )}
      </div>

      {/* CTA — 카드 맨 아래, 옆 여백 없이 가로 전체를 다 쓰는 버튼 */}
      <button
        className={`card-cta ${canOpenPurchase ? '' : 'closed'}`}
        onClick={openPurchaseLink}
        disabled={!canOpenPurchase}
        style={isUpcoming ? { background: '#ede9fe', color: '#7c3aed' } : {}}
      >
        {closed
          ? '마감됨'
          : isUpcoming
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><CalendarClock size={16} /> 오픈 예정</span>
          : !(post.purchase_url || post.url)
          ? '링크 없음'
          : '공구 보기 →'}
      </button>

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
