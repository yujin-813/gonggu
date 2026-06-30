'use client'
import { useState } from 'react'
import type { Post } from '@/lib/types'
import PriceCompareModal from './PriceCompareModal'

const CAT_LABEL: Record<string, string> = {
  fashion: '👗 패션', beauty: '💄 뷰티', food: '🍱 식품',
  life: '🏠 생활용품', kids: '🧸 유아동', health: '💊 건강',
  pet: '🐾 반려동물', digital: '📱 디지털',
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
  const badge = badgeInfo(post.deadline)
  const dt = !post.deadline && post.is_always_on
    ? { cls: '', txt: '📅 상시딜' }
    : periodText(post.start_date, post.deadline)
  const closed = daysLeft(post.deadline) < 0
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
            className={`btn-join ${closed || !post.url ? 'closed' : ''}`}
            onClick={() => { if (!closed && post.url) { onJoin?.(post.id); window.open(post.url, '_blank') } }}
            disabled={closed || !post.url}
          >
            {closed ? '마감됨' : !post.url ? '링크 없음' : '공구 보기 →'}
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
