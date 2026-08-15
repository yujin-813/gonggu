'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import type { Collection } from '@/lib/types'
import { track } from '@/lib/track'

// "지금 뜨는 컬렉션"을 가로 스크롤 대신 자동으로 넘어가는 롤링 배너로 보여준다.
// 가로 스크롤은 옆에 더 있다는 걸 모르면 첫 장만 보고 지나치는데, 자동으로 넘어가면
// 스크롤하지 않아도 전체를 훑게 된다.
//
// 접근성상 자동 재생은 멈출 수 있어야 하므로 (1) 마우스를 올리거나 (2) 포커스가 들어오면
// 멈추고, prefers-reduced-motion을 켠 사용자에게는 아예 자동 전환을 하지 않는다.

const INTERVAL_MS = 4000

interface Props {
  collections: Collection[]
}

export default function CollectionRoller({ collections }: Props) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const touchStartX = useRef<number | null>(null)

  const count = collections.length

  useEffect(() => {
    if (count <= 1 || paused) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setIndex(i => (i + 1) % count), INTERVAL_MS)
    return () => clearInterval(t)
  }, [count, paused])

  // 컬렉션이 줄어들어 현재 인덱스가 범위를 벗어나면 처음으로 되돌린다
  useEffect(() => {
    if (index >= count) setIndex(0)
  }, [count, index])

  if (count === 0) return null

  return (
    <section
      className="roller-wrap"
      aria-roledescription="carousel"
      aria-label="지금 뜨는 컬렉션"
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
      <p className="roller-title">지금 뜨는 컬렉션</p>

      <div className="roller-viewport">
        <div className="roller-track" style={{ transform: `translateX(-${index * 100}%)` }}>
          {collections.map((c, i) => (
            <Link
              key={c.id}
              href={`/collection/${c.id}`}
              className="roller-slide"
              style={{ background: `linear-gradient(135deg, ${c.color}, ${c.color}cc)` }}
              onClick={() => track('collection_click')}
              // 화면 밖 슬라이드는 탭 순서에서 빼 키보드 이동이 엉키지 않게 한다
              tabIndex={i === index ? 0 : -1}
              aria-hidden={i !== index}
            >
              <span className="roller-emoji">{c.emoji}</span>
              <span className="roller-body">
                <span className="roller-name">{c.title}</span>
                {c.description && <span className="roller-desc">{c.description}</span>}
                <span className="roller-count">{c.productIds.length}개 상품 보러가기 →</span>
              </span>
            </Link>
          ))}
        </div>
      </div>

      {count > 1 && (
        <div className="roller-dots">
          {collections.map((c, i) => (
            <button
              key={c.id}
              className={`roller-dot ${i === index ? 'on' : ''}`}
              onClick={() => setIndex(i)}
              aria-label={`${i + 1}번째 컬렉션: ${c.title}`}
              aria-current={i === index}
            />
          ))}
        </div>
      )}
    </section>
  )
}
