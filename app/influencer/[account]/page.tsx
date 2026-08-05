'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface InfluencerItem {
  id: number
  title: string
  brand: string | null
  price: number
  img: string
  link: string
}
interface InfluencerInfo {
  account: string
  name: string
  source_url: string | null
}

export default function InfluencerPage({ params }: { params: { account: string } }) {
  const account = decodeURIComponent(params.account)
  const [influencer, setInfluencer] = useState<InfluencerInfo | null>(null)
  const [items, setItems] = useState<InfluencerItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/posts/by-influencer?account=${encodeURIComponent(account)}`)
      .then(r => r.json())
      .then(d => { setInfluencer(d.influencer); setItems(d.items ?? []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [account])

  const profileUrl = `https://instagram.com/${account.replace('@', '')}`

  return (
    <>
      <header>
        <div className="header-inner">
          <Link href="/" className="back-btn"><ArrowLeft size={16} /></Link>
          <div className="logo">
            <span className="logo-text">🛍️ {influencer?.name || account.replace('@', '')}의 추천템</span>
          </div>
        </div>
      </header>

      <div style={{ padding: '16px 16px 4px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 8px' }}>
          공구 여부와 상관없이 이 인플루언서가 올린 상품들이에요 — 가격 비교/할인 판단은 따로 하지 않아요
        </p>
        <a href={profileUrl} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 13, color: '#6366f1', fontWeight: 600, textDecoration: 'none' }}>
          인스타그램 {account} 보기 →
        </a>
      </div>

      <div className="feed" style={{ paddingBottom: 100, paddingTop: 12 }}>
        {loading ? (
          <div className="empty"><p>불러오는 중...</p></div>
        ) : items.length === 0 ? (
          <div className="empty"><p>표시할 수 있는 추천 상품이 없어요</p></div>
        ) : (
          items.map(item => (
            <a
              key={item.id}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="card"
              style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
            >
              <div className="card-img-wrap">
                <img className="card-img-bg" src={item.img} alt="" aria-hidden="true" />
                <img className="card-img-fg" src={item.img} alt={item.title} loading="lazy" />
              </div>
              <div className="card-body">
                {item.brand && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', letterSpacing: '0.04em', marginBottom: 2 }}>
                    {item.brand.toUpperCase()}
                  </div>
                )}
                <div className="card-title">{item.title}</div>
                <div className="price-block">
                  <span className="price-sale-big">{item.price.toLocaleString()}원</span>
                </div>
              </div>
            </a>
          ))
        )}
      </div>
    </>
  )
}
