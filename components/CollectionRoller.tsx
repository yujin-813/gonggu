'use client'
import { useState, useEffect, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import type { Collection, Post } from '@/lib/types'
import { track } from '@/lib/track'
import { ShoppingBag } from 'lucide-react'

// 관리자가 소개를 비워둬도 홈이 허전하지 않게 — 관리자에서 언제든 바꿀 수 있다
const DEFAULT_COLLECTION_DESC = '꿀공구가 추천하는 꿀템'

// "지금 뜨는 컬렉션"에 담긴 상품들을 한 장씩 자동으로 넘겨 보여준다.
// 컬렉션에 3개를 담으면 상품 카드 3장이, 5개면 5장이 순서대로 돈다.
//
// 가로 스크롤로 두면 옆에 더 있다는 걸 모르는 사용자는 첫 장만 보고 지나치는데,
// 자동으로 넘어가면 스크롤하지 않아도 담긴 상품을 전부 훑게 된다.
//
// 접근성상 자동 재생은 멈출 수 있어야 하므로 (1) 마우스를 올리거나 (2) 포커스가 들어오면
// 멈추고, prefers-reduced-motion을 켠 사용자에게는 아예 자동 전환을 하지 않는다.

const INTERVAL_MS = 5000

interface Props {
  collection: Collection
  posts: Post[]
  /** 카드 렌더는 홈과 똑같은 PostCard를 쓰기 위해 바깥에서 넘겨받는다 */
  renderCard: (post: Post) => ReactNode
}

export default function CollectionRoller({ collection, posts, renderCard }: Props) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const touchStartX = useRef<number | null>(null)

  const count = posts.length

  useEffect(() => {
    if (count <= 1 || paused) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setIndex(i => (i + 1) % count), INTERVAL_MS)
    return () => clearInterval(t)
  }, [count, paused])

  // 상품이 빠져 현재 인덱스가 범위를 벗어나면 처음으로 되돌린다
  useEffect(() => {
    if (index >= count) setIndex(0)
  }, [count, index])

  if (count === 0) return null

  return (
    <section
      className="roller"
      aria-roledescription="carousel"
      aria-label={`${collection.title} 상품`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={e => { touchStartX.current = e.touches[0].clientX }}
      onTouchEnd={e => {
        const start = touchStartX.current
        touchStartX.current = null
        if (start === null) return
        const dx = e.changedTouches[0].clientX - start
        if (Math.abs(dx) < 40) return
        setIndex(i => (dx < 0 ? (i + 1) % count : (i - 1 + count) % count))
      }}
    >
      <div className="roller-head">
        <h2 className="roller-title">
          <span className="roller-badge" style={{ background: collection.color }}><ShoppingBag size={15} strokeWidth={2.5} /></span>
          {collection.title}
          <span className="roller-count">{count}</span>
        </h2>
        <Link
          href={`/collection/${collection.id}`}
          className="roller-more"
          onClick={() => track('collection_click')}
        >
          더보기 →
        </Link>
      </div>

      <p className="roller-desc">{collection.description || DEFAULT_COLLECTION_DESC}</p>

      <div className="roller-viewport">
        <div className="roller-track" style={{ transform: `translateX(-${index * 100}%)` }}>
          {posts.map((p, i) => (
            <div
              key={p.id}
              className="roller-slide"
              // 화면 밖 카드는 스크린리더에서 빼 키보드·낭독 순서가 엉키지 않게 한다
              aria-hidden={i !== index}
            >
              {renderCard(p)}
            </div>
          ))}
        </div>
      </div>

      {count > 1 && (
        <div className="roller-dots">
          {posts.map((p, i) => (
            <button
              key={p.id}
              className={`roller-dot ${i === index ? 'on' : ''}`}
              onClick={() => setIndex(i)}
              aria-label={`${i + 1}번째 상품: ${p.title}`}
              aria-current={i === index}
            />
          ))}
        </div>
      )}
    </section>
  )
}
