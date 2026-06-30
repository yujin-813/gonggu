'use client'
import type { Post } from '@/lib/types'

const RANK_ICON = ['🥇', '🥈', '🥉']

function fmt(dateStr?: string) {
  if (!dateStr) return ''
  const [, m, d] = dateStr.split('-')
  return `${parseInt(m)}.${parseInt(d)}`
}

interface Props {
  posts: Post[]
  onClose: () => void
  onJoin?: (id: number) => void
}

export default function PriceCompareModal({ posts, onClose, onJoin }: Props) {
  const sorted = [...posts].sort((a, b) => a.price - b.price)
  const cheapest = sorted[0]?.price

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#fff', borderRadius: '20px 20px 0 0',
        width: '100%', maxWidth: 480, padding: '24px 20px 32px',
        maxHeight: '80vh', overflowY: 'auto',
      }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, color: '#0f172a' }}>💰 가격 비교</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{sorted[0]?.title}</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: '#475569' }}
          >
            ✕
          </button>
        </div>

        {/* 비교 목록 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sorted.map((p, i) => {
            const isCheapest = p.price === cheapest
            const deadline = p.deadline ? `~ ${fmt(p.deadline)}` : ''
            return (
              <div
                key={p.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', borderRadius: 12,
                  background: isCheapest ? '#fef9c3' : '#f8fafc',
                  border: `1.5px solid ${isCheapest ? '#fbbf24' : '#e2e8f0'}`,
                }}
              >
                <span style={{ fontSize: 22, flexShrink: 0 }}>{RANK_ICON[i] ?? `${i + 1}위`}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                    {p.account}
                    {isCheapest && (
                      <span style={{ marginLeft: 6, fontSize: 11, background: '#fbbf24', color: '#78350f', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>최저가</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 17, fontWeight: 800, color: '#e11d48' }}>{p.price.toLocaleString()}원</span>
                    {deadline && <span style={{ fontSize: 11, color: '#94a3b8' }}>{deadline}</span>}
                  </div>
                </div>
                <button
                  onClick={() => { onJoin?.(p.id); if (p.url) window.open(p.url, '_blank') }}
                  disabled={!p.url}
                  style={{
                    background: p.url ? '#6366f1' : '#e2e8f0',
                    color: p.url ? '#fff' : '#94a3b8',
                    border: 'none', borderRadius: 8, padding: '7px 12px',
                    fontSize: 12, fontWeight: 600, cursor: p.url ? 'pointer' : 'default',
                    flexShrink: 0, whiteSpace: 'nowrap',
                  }}
                >
                  공구 보기 →
                </button>
              </div>
            )
          })}
        </div>

        {sorted.length > 1 && (
          <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 14 }}>
            최저가와 최고가 차이: {(sorted[sorted.length - 1].price - cheapest).toLocaleString()}원
          </p>
        )}
      </div>
    </div>
  )
}
