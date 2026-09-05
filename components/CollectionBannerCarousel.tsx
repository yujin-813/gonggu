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
            style={{ '--banner-color': b.color } as React.CSSProperties}
            onClick={() => track('click', { clickType: 'other' })}>
            {/* 제휴 문의 배너(어두운 바탕 + 얼룩 도형)와 다른 컨셉으로 — 밝은 바탕에
                "꿀"을 연상시키는 육각(벌집) 도형을 겹친다(사장님 요청: 아이콘 빼고
                다른 컨셉으로). 아이콘/이모지는 안 쓴다. */}
            <div className="collection-banner-shapes" aria-hidden="true">
              <span className="collection-banner-hex collection-banner-hex-1" />
              <span className="collection-banner-hex collection-banner-hex-2" />
              <span className="collection-banner-hex collection-banner-hex-3" />
            </div>
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
