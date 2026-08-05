'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface InfluencerSummary {
  account: string
  name: string
  count: number
  thumbnail: string
}

export default function InfluencersPage() {
  const [influencers, setInfluencers] = useState<InfluencerSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/influencers')
      .then(r => r.json())
      .then(d => setInfluencers(d.influencers ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <header>
        <div className="header-inner">
          <Link href="/" className="back-btn"><ArrowLeft size={16} /></Link>
          <div className="logo">
            <span className="logo-text">🛍️ 인플루언서 목록</span>
          </div>
        </div>
      </header>

      <div style={{ padding: '16px 16px 4px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
          인플루언서를 골라 그 사람이 올린 상품(공구 아닌 추천템 포함)을 볼 수 있어요
        </p>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 100 }}>
        {loading ? (
          <div className="empty"><p>불러오는 중...</p></div>
        ) : influencers.length === 0 ? (
          <div className="empty"><p>표시할 수 있는 인플루언서가 없어요</p></div>
        ) : (
          influencers.map(inf => (
            <Link
              key={inf.account}
              href={`/influencer/${encodeURIComponent(inf.account.replace('@', ''))}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
                padding: 10, textDecoration: 'none', color: 'inherit',
              }}
            >
              <img
                src={inf.thumbnail}
                alt=""
                style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', flexShrink: 0, background: '#f1f5f9' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {inf.name}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{inf.account}</div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6366f1', background: '#ede9fe', borderRadius: 10, padding: '4px 10px', flexShrink: 0 }}>
                {inf.count}개
              </div>
            </Link>
          ))
        )}
      </div>
    </>
  )
}
