'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/track'

interface CollectionBanner { id: string; title: string; description: string; emoji: string; color: string }

/** 활성 컬렉션이 여럿이면 옆으로 넘기는 배너 + 점 페이지네이션, 하나뿐이면 점 없이 그대로. */
export default function CollectionBannerCarousel({ banners }: { banners: CollectionBanner[] }) {
  const [active, setActive] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  if (banners.length === 0) return null

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    setActive(Math.round(el.scrollLeft / el.clientWidth))
  }

  return (
    <div className="collection-banner-carousel">
      <div className="collection-banner-scroll" ref={scrollRef} onScroll={handleScroll}>
        {banners.map(b => (
          <Link key={b.id} href={`/collection/${b.id}`} className="collection-banner"
            style={{ background: `linear-gradient(135deg, ${b.color}, ${b.color}CC)` }}
            onClick={() => track('click', { clickType: 'other' })}>
            <span className="collection-banner-emoji">{b.emoji}</span>
            <span className="collection-banner-text">
              <span className="collection-banner-title">{b.title}</span>
              {b.description && <span className="collection-banner-desc">{b.description}</span>}
            </span>
            <span className="collection-banner-cta">보러가기 →</span>
          </Link>
        ))}
      </div>
      {banners.length > 1 && (
        <div className="collection-banner-dots">
          {banners.map((b, i) => (
            <span key={b.id} className={`collection-banner-dot ${i === active ? 'active' : ''}`} />
          ))}
        </div>
      )}
    </div>
  )
}
