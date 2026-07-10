'use client'
import { useState } from 'react'
import type { Post } from '@/lib/types'
import PriceCompareModal from './PriceCompareModal'

const CAT_LABEL: Record<string, string> = {
  fashion: '👗 패션', beauty: '💄 뷰티', food: '🍱 식품',
  life: '🏠 생활용품', kids: '🧸 유아동', health: '💊 건강',
  pet: '🐾 반려동물', digital: '📱 디지털',
}

function dealJudgment(post: Post): { verdict: string; detail: string; cls: string } | null {
  if (!post.market_price || !post.price || post.status === 'upcoming') return null
  const mp = post.market_price
  const p  = post.price
  const diff = mp - p
  if (p <= mp * 0.9)
    return { verdict: '살만해요', detail: `네이버 최저가보다 ${diff.toLocaleString()}원 저렴`, cls: 'good' }
  if (p < mp)
    return { verdict: '가격 보통', detail: '온라인 최저가와 큰 차이 없어요', cls: 'neutral' }
  return { verdict: '비교 필요', detail: '구성품·배송비를 함께 확인해보세요', cls: 'check' }
}

function daysLeft(deadline?: string): number {
  if (!deadline) return 999
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(deadline)
  d.setHours(0, 0, 0, 0)
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function badgeInfo(deadline?: string) {
  const d = daysLeft(deadline)
  if (d < 0) return { cls: 'closed', icon: '🔒', txt: '마감' }
  if (d === 0) return { cls: 'urgent', icon: '⏰', txt: '오늘 마감!' }
  if (d === 1) return { cls: 'urgent', icon: '⏰', txt: 'D-1' }
  if (d <= 3) return { cls: 'soon', icon: '⏰', txt: `D-${d}` }
  return { cls: 'ok', icon: '⏰', txt: `D-${d}` }
}

function fmt(dateStr?: string) {
  if (!dateStr) return ''
  // YYYY-MM-DD → M.D
  const [, m, d] = dateStr.split('-')
  return `${parseInt(m)}.${parseInt(d)}`
}

function periodText(startDate?: string, deadline?: string) {
  const d = daysLeft(deadline)
  if (d < 0) return { cls: 'urgent', txt: '마감됨' }
  if (d === 0) return { cls: 'urgent', txt: '⚡ 오늘 마감!' }
  if (d === 1) return { cls: 'urgent', txt: '⚡ 내일 마감!' }
  if (startDate && deadline) return { cls: '', txt: `📅 ${fmt(startDate)} ~ ${fmt(deadline)}` }
  if (deadline) return { cls: '', txt: `📅 ~ ${fmt(deadline)} 마감` }
  return { cls: '', txt: '' }
}

interface PostCardProps {
  post: Post
  isBookmarked: boolean
  onToggleBookmark: (id: number) => void
  onJoin?: (id: number) => void
  siblings?: Post[]
}

export default function PostCard({ post, isBookmarked, onToggleBookmark, onJoin, siblings = [] }: PostCardProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const [showCompare, setShowCompare] = useState(false)
  const compareCount = siblings.length
  const isUpcoming = post.status === 'upcoming'
  const daysToOpen = isUpcoming && post.start_date ? daysLeft(post.start_date) : null
  const badge = isUpcoming
    ? { cls: 'soon', icon: '🗓️', txt: daysToOpen !== null && daysToOpen > 0 ? `D-${daysToOpen} 오픈` : '오늘 오픈!' }
    : badgeInfo(post.deadline)
  const dt = isUpcoming
    ? { cls: '', txt: `📅 ${fmt(post.start_date)} 오픈 예정` }
    : !post.deadline && (post.is_evergreen_deal || post.is_always_on)
    ? { cls: '', txt: '📅 상시딜' }
    : periodText(post.start_date, post.deadline)
  const closed = !isUpcoming && daysLeft(post.deadline) < 0
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
        <div className={`badge-deadline ${badge.cls}`}>
          {badge.icon} {badge.txt}
        </div>
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
          <span className="cat-tag">{CAT_LABEL[post.cat] || post.cat}</span>
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
