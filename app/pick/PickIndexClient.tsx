'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { CuratedSubject } from '@/lib/types'
import { track } from '@/lib/track'

const KIND_LABEL: Record<string, string> = { brand: '브랜드', influencer: '인플루언서', seller: '셀러' }

interface Item {
  subject: CuratedSubject
  activeCount: number
  upcomingCount: number
  endedCount: number
  thumbnail: string | null
}

export default function PickIndexClient({ items }: { items: Item[] }) {
  useEffect(() => { track('view') }, [])

  return (
    <>
      <header>
        <div className="header-inner">
          <Link href="/" className="back-btn" aria-label="홈으로"><ArrowLeft size={16} /></Link>
          <div className="logo">
            <span className="logo-text">🏷️ 공구 모음</span>
          </div>
        </div>
      </header>

      <div className="influencer-intro">
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
          자주 찾는 브랜드·인플루언서·셀러를 골라 그곳의 공구를 한 번에 볼 수 있어요
        </p>
      </div>

      <div className="influencer-list">
        {items.length === 0 ? (
          <div className="empty"><p>아직 등록된 공구 모음이 없어요</p></div>
        ) : (
          items.map(({ subject, activeCount, upcomingCount, endedCount, thumbnail }) => (
            <Link
              key={subject.slug}
              href={`/pick/${encodeURIComponent(subject.slug)}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
                padding: 10, textDecoration: 'none', color: 'inherit',
              }}
            >
              {thumbnail ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={thumbnail}
                  alt=""
                  style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', flexShrink: 0, background: '#f1f5f9' }}
                />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: 10, flexShrink: 0, background: '#f1f5f9' }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {subject.label}
                  </div>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', flexShrink: 0,
                    fontSize: 11, color: '#64748b', background: '#f1f5f9', borderRadius: 8, padding: '2px 7px',
                  }}>
                    {KIND_LABEL[subject.kind] || subject.kind}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  진행 중 {activeCount}건{upcomingCount > 0 && ` · 오픈 예정 ${upcomingCount}건`}{endedCount > 0 && ` · 최근 종료 ${endedCount}건`}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </>
  )
}
