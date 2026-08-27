'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { Post } from '@/lib/types'
import { daysLeft, getPeriodState, badgeFromState, periodTextFromState, isExpired, isNewPost, type BadgeIcon, type PeriodIcon } from '@/lib/period'
import { CATEGORY_LABEL, categoryIcon } from '@/lib/categoryIcons'
import {
  Heart, Wallet, CheckCircle2, Calendar, CalendarClock, CalendarPlus,
  Package, Flame, Lock, Timer, Zap, ExternalLink, Share2, ChevronDown, ChevronUp,
} from 'lucide-react'
import PriceCompareModal from './PriceCompareModal'
import { shareContent } from '@/lib/share'
import { track } from '@/lib/track'
import { visiblePurchaseLinks, PLATFORM_LABEL, disclosureText } from '@/lib/purchaseLinks'
import DealVerdictBox from './DealVerdictBox'
import GradeIcon from './GradeIcon'
import { getDealVerdict, shareLabel } from '@/lib/dealGrade'

const SITE_URL = 'https://gonggu.asknuggetdata.com'

const BADGE_ICON: Record<BadgeIcon, typeof Calendar> = {
  'calendar-clock': CalendarClock, package: Package, flame: Flame, lock: Lock, timer: Timer,
}
const PERIOD_ICON: Record<PeriodIcon, typeof Calendar> = { calendar: Calendar, zap: Zap }
interface PostCardProps {
  post: Post
  isBookmarked: boolean
  onToggleBookmark: (id: number) => void
  onJoin?: (id: number) => void
  onShare?: (id: number, result: 'kakao' | 'native' | 'clipboard') => void
  siblings?: Post[]
  pastPrices?: { id: number; price: number; origPrice: number | null; date: string }[]
  /**
   * 마감 상세 페이지에서만 켠다. 당시 가격·판정 근거는 위쪽 EndedDealNotice가 이미
   * "당시 공구가 · N% 저렴했던 꿀딜" 한 줄로 요약해 보여준다 — 여기서 가격·판정 카드를
   * 또 그대로 그리면 같은 정보가 두 번 나온다. 판정 상세(옵션별 표 등)는 접어 두고
   * 필요한 사람만 펼쳐 보게 한다.
   */
  endedCompact?: boolean
}

export default function PostCard({
  post, isBookmarked, onToggleBookmark, onJoin, onShare, siblings = [], pastPrices = [],
  endedCompact = false,
}: PostCardProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const [showCompare, setShowCompare] = useState(false)
  const [showVerdictDetail, setShowVerdictDetail] = useState(false)
  const compareCount = siblings.length
  const periodState = getPeriodState(post)
  // 저장된 status가 아니라 날짜로 계산한 상태를 본다 — 오픈일이 지났는데 status만
  // upcoming으로 남은 글이 '오픈 예정'으로 잘못 표시되던 문제
  const isUpcoming = periodState.kind === 'upcoming'
  const badge = badgeFromState(periodState)
  const dt = periodTextFromState(periodState)
  const closed = isExpired(post)
  const isNew = !isUpcoming && isNewPost(post.scraped_at)
  // 관리자가 직접 입력했거나(source=manual), 자동 추출 신뢰도가 높을 때만 "확인됨"으로 표시한다 —
  // 애매한 걸 확인됐다고 하면 나중에 신뢰만 잃으므로, 확실할 때만 긍정 신호를 준다
  const extractionConfidence = (post.extraction_debug as Record<string, unknown> | null)?.extraction_confidence as string | undefined
  const isVerified = post.source === 'manual' || extractionConfidence === 'high'

  const profileUrl = post.account
    ? `https://instagram.com/${post.account.replace('@', '')}`
    : '#'

  // 마감된 공구는 상세 페이지의 종료 안내(EndedDealNotice)가 대체 구매처를 "당시 공구가"와
  // 구분해 더 정확하게 보여주므로, 카드에서는 중복 노출하지 않는다
  // 판정 결과는 배지·공유 문구 양쪽에서 쓴다 — 공유되는 건 "상품"이 아니라 "가격 판정"이라,
  // 받는 사람이 링크를 누르기 전에 이미 싼지 알 수 있어야 열어볼 이유가 생긴다
  const verdict = getDealVerdict(post)

  // 할인율은 반드시 판정(getDealVerdict)에서 가져온다.
  //
  // 예전에는 카드가 origPrice로 따로 계산했는데, 판정 쪽에만 있는 안전장치(믿기 어려운
  // 자동매칭 배제, 여러 상품 공구 제외, 옵션 비교가 우선)를 전부 건너뛰는 셈이라 값이
  // 갈렸다. 공개 247건 중 33건이 어긋났고, 그중에는 실제로는 더 비싼 공구를 "20% 저렴"으로
  // 표시하던 것도 있었다. 가격을 검증해 주겠다는 서비스에서 이건 치명적이라, 화면에 나가는
  // 숫자는 한 곳에서만 나오게 한다.
  const savedChip: string | null = (() => {
    if (verdict.rateRange) {
      const lo = Math.round(verdict.rateRange.min * 100)
      const hi = Math.round(verdict.rateRange.max * 100)
      if (hi <= 0) return null
      return lo === hi ? `약 ${hi}% 저렴` : `구성별 ${Math.max(lo, 0)}~${hi}% 저렴`
    }
    if (verdict.discountRate === null || verdict.discountRate <= 0) return null
    const rate = Math.round(verdict.discountRate * 100)
    if (rate <= 0) return null
    const saved = verdict.referencePrice ? verdict.referencePrice - post.price : 0
    return saved > 0
      ? `${verdict.referenceLabel}보다 ${saved.toLocaleString()}원(${rate}%) 저렴`
      : `${verdict.referenceLabel}보다 ${rate}% 저렴`
  })()
  const altLinks = closed ? [] : visiblePurchaseLinks(post)
  const purchaseLink = post.purchase_url || post.url
  const canOpenPurchase = !closed && !isUpcoming && !!purchaseLink
  const openPurchaseLink = () => {
    if (!canOpenPurchase) return
    onJoin?.(post.id)
    window.open(purchaseLink, '_blank')
  }

  async function handleShare(e: React.MouseEvent) {
    e.stopPropagation()
    const priceLine = post.price ? `공구가 ${post.price.toLocaleString()}원` : '가격 공개 전'
    const compareLine = verdict.referencePrice
      ? ` · ${verdict.referenceLabel} ${verdict.referencePrice.toLocaleString()}원`
      : ''
    const gradeLine = `[${verdict.display.label}] `
    const result = await shareContent({
      title: `${gradeLine}${post.title}`,
      description: `${priceLine}${compareLine}`,
      // 상품 사진 대신 판정 결과를 그린 이미지를 보낸다 — 카톡 미리보기에서 바로 읽힌다
      imageUrl: `${SITE_URL}/api/og/deal/${post.id}`,
      url: `${SITE_URL}/post/${post.id}`,
      buttonLabel: '가격 확인하러 가기',
    })
    if (result !== 'failed') onShare?.(post.id, result)
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
        ) : !post.price && periodState.kind === 'upcoming' ? (
          // 아직 콘텐츠가 안 채워진 예고 카드 — 카테고리 아이콘만 덜렁 있으면 다 똑같아
          // 보여서 "고장났나?" 싶다. 인플루언서 이름을 같이 보여줘 카드마다 구분되고,
          // "아직 공개 전이라 비어 있다"는 게 그 자체로 읽히게 한다.
          <div className="img-placeholder img-placeholder-upcoming">
            <CalendarClock size={32} strokeWidth={1.5} />
            <span className="img-placeholder-account">{post.account}</span>
          </div>
        ) : (
          <div className="img-placeholder"><CatIcon size={40} strokeWidth={1.5} /></div>
        )}
        {/* 시각적 우선순위: ① 판정 ② 마감 ③ 상품명·가격.
            "여기는 가격을 판정해주는 곳"이라는 신호가 스크롤할 때 반복해서 눈에 들어와야
            하므로, 가장 잘 보이는 좌상단은 마감이 아니라 판정 배지가 차지한다. */}
        {/* 판정 대기는 목록에서 빼둔다. 다른 배지는 "사도 된다·다른 데 봐라"처럼 읽는
            즉시 쓸모가 있는데, 판정 대기만 우리 사정을 적어둔 말이라 읽어도 아무 판단을
            못 하게 한다. "대기"라는 말은 곧 나온다는 약속처럼 읽혀서 다시 와도 그대로면
            신뢰만 깎인다. 목록에서는 조용히 비우고, 이유는 상세에서 설명한다.
            덤으로 4장 중 1장이 달고 있던 배지가 사라져 꿀딜이 더 도드라진다. */}
        {verdict.display.key !== 'pending' && (
          <div className={`badge-verdict grade-solid-${verdict.display.key}`}>
            <GradeIcon state={verdict.display.key} size={14} />
            {verdict.display.label}
          </div>
        )}
        {badge && BadgeIconEl && (
          <div className={`badge-deadline ${badge.cls}`}>
            <BadgeIconEl size={11} strokeWidth={2.5} /> {badge.txt}
          </div>
        )}
        {isNew && <div className="badge-new">NEW</div>}
        <button
          className="btn-share"
          onClick={handleShare}
          title={shareLabel(verdict.grade?.key ?? null)}
        >
          <Share2 size={15} />
        </button>
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
          <Link
            href={`/influencer/${encodeURIComponent(post.account.replace('@', ''))}`}
            onClick={e => e.stopPropagation()}
            title="이 인플루언서의 다른 추천 상품 보기"
            style={{ fontSize: 11, color: '#94a3b8', textDecoration: 'none', flexShrink: 0 }}
          >
            더보기
          </Link>
          <span className="cat-tag">
            {CATEGORY_LABEL[post.cat] || post.cat}
          </span>
        </div>

        {/* 브랜드명은 상품을 찾는 단서지 강조 대상이 아니다. 보라색을 쓰면 목록에
            제5의 색이 늘어나 판정 배지와 시선을 나눠 갖는다 — 회색 눈금으로 물린다. */}
        {post.brand && (
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-3)', letterSpacing: '0.06em', marginBottom: 3 }}>
            {post.brand.toUpperCase()}
          </div>
        )}
        <div className="card-title">{post.title}</div>

        {!endedCompact && (
          <>
        {/* 가장 중요한 정보: 얼마인지 · 얼마나 싼지 — 카드에서 가장 크게 */}
        {/* 세트가 여러 개면 가격 하나만 보여주면 어느 구성인지 알 수 없다 — "N원부터"로 알린다 */}
        {/* 오픈 예정 공구는 가격이 아직 없다(인포크 예고 블록이라 상품 페이지가 없다).
            없는 가격을 0원으로 쓰지 않고 블록을 통째로 비운다 — 예전에는 여기서 null을
            toLocaleString 해서 /today·/monthly·/category가 통째로 500이 났다 */}
        {(verdict.fromPrice || post.price) ? (
          <div className="price-block">
            <span className="price-sale-big">
              {verdict.fromPrice ? `${verdict.fromPrice.toLocaleString()}원부터` : `${post.price.toLocaleString()}원`}
            </span>
            {savedChip && <span className="discount-chip">{savedChip}</span>}
          </div>
        ) : (
          <div className="price-block">
            <span className="price-sale-big" style={{ fontSize: 15, color: 'var(--gray-4)' }}>가격 미정</span>
          </div>
        )}
        {verdict.options.length > 1 && (
          <div className="price-from-note">
            총 {verdict.options.length}개 구성
            {verdict.rateRange && ` · 최대 ${Math.round(verdict.rateRange.max * 100)}% 저렴`}
          </div>
        )}
        {/* 취소선 가격도 판정이 실제로 기준으로 삼은 값만 쓴다 — origPrice가 신뢰도 검사에서
            빠진 값이면 화면에만 남아 할인율과 어긋난다 */}
        {!verdict.options.length && verdict.referencePrice && post.price && verdict.referencePrice > post.price && (
          post.market_url
            ? <a href={post.market_url} target="_blank" rel="noopener noreferrer" className="price-orig" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: post.market_price ? 2 : 8 }}>
                {verdict.referenceLabel} {verdict.referencePrice.toLocaleString()}원 →
              </a>
            : <span className="price-orig" style={{ display: 'inline-block', marginBottom: 8 }}>{verdict.referenceLabel} {verdict.referencePrice.toLocaleString()}원</span>
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
          </>
        )}

        {/* 두 번째로 중요한 정보: 기간이 언제까지인지 — 독립된 줄로 항상 노출 */}
        {dt.txt && (
          <div className={`period-row ${dt.cls}`}>
            <PeriodIconEl size={13} strokeWidth={2.25} />
            <span>{dt.txt}</span>
          </div>
        )}

        {/* 꿀공구 판정 — "이 공구 진짜 싼가"에 답하는 블록. 등급 계산은 lib/dealGrade.ts
            한 곳에서만 하므로 카드·상세·공유 이미지가 항상 같은 등급을 보여준다.
            마감 페이지는 이 카드 위에서 이미 "당시 공구가 · N% 저렴했던 꿀딜"로 요약해
            보여줬다 — 여기서는 접어 두고, 옵션별 표 등 근거가 궁금한 사람만 펼쳐 본다. */}
        {endedCompact ? (
          <>
            <button type="button" onClick={() => setShowVerdictDetail(v => !v)} className="verdict-detail-toggle">
              가격 비교 자세히 보기 {showVerdictDetail ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showVerdictDetail && <DealVerdictBox post={post} />}
          </>
        ) : (
          <DealVerdictBox post={post} />
        )}

        {/* 대체 구매 링크 — 공구 가격 판단(dealJudgment)과는 완전히 별개인 참고 정보.
            여러 판매처를 가질 수 있어 배열로 읽는다. 공정위 지침상 경제적 대가 관계는
            반드시 고지해야 하므로 플랫폼별 지정 문구를 함께 노출한다. */}
        {altLinks.length > 0 && (() => {
          const disclosure = disclosureText(altLinks)
          return (
          <div style={{ marginBottom: 8 }}>
            {altLinks.map((link, i) => (
              <a
                key={`${link.platform}-${i}`}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer sponsored"
                onClick={e => { e.stopPropagation(); track('click', { postId: post.id, clickType: link.platform }) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 11, color: '#0369a1', background: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  borderRadius: i === 0 ? '8px 8px 0 0' : (!disclosure && i === altLinks.length - 1) ? '0 0 8px 8px' : 0,
                  borderTop: i === 0 ? undefined : 'none',
                  padding: '5px 8px', textDecoration: 'none',
                }}
              >
                <ExternalLink size={11} />
                {PLATFORM_LABEL[link.platform]}에서
                {link.price ? ` ${link.price.toLocaleString()}원에 구매 가능` : ' 가격 확인'}
                {link.note && <span style={{ color: '#64748b' }}>· {link.note}</span>}
              </a>
            ))}
            {disclosure && (
              <div style={{
                fontSize: 10, color: '#64748b', background: '#f8fafc',
                border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px',
                padding: '4px 8px',
              }}>
                {disclosure}
              </div>
            )}
          </div>
          )
        })()}

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

      {/* CTA — 카드 맨 아래, 옆 여백 없이 가로 전체를 다 쓰는 버튼.
          오픈 예정은 눌러도 살 곳이 없어 예전엔 비활성 버튼이었다 — 눌리는데 아무 반응이
          없어서 "고장났나" 싶었다. 상세 페이지(UpcomingNotice)와 같은 동작으로 바꿔서
          누르면 실제로 캘린더에 담기도록 한다. */}
      {endedCompact ? null : isUpcoming && post.start_date ? (
        <a
          href={`/api/calendar/${post.id}`}
          className="card-cta"
          style={{ background: '#ede9fe', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}
          onClick={e => { e.stopPropagation(); track('click', { postId: post.id, clickType: 'other' }) }}
        >
          <CalendarPlus size={16} /> 캘린더에 담기
        </a>
      ) : (
        <button
          className={`card-cta ${canOpenPurchase ? '' : 'closed'}`}
          onClick={openPurchaseLink}
          disabled={!canOpenPurchase}
        >
          {closed
            ? '마감됨'
            : isUpcoming
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><CalendarClock size={16} /> 오픈 예정</span>
            : !(post.purchase_url || post.url)
            ? '링크 없음'
            : '공구 보기 →'}
        </button>
      )}

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
