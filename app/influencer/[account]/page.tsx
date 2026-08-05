'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Search } from 'lucide-react'

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

type SortOrder = 'latest' | 'price_low' | 'price_high'

export default function InfluencerPage({ params }: { params: { account: string } }) {
  const account = decodeURIComponent(params.account)
  const [influencer, setInfluencer] = useState<InfluencerInfo | null>(null)
  const [items, setItems] = useState<InfluencerItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sortOrder, setSortOrder] = useState<SortOrder>('latest')
  const [query, setQuery] = useState('')

  useEffect(() => {
    fetch(`/api/posts/by-influencer?account=${encodeURIComponent(account)}`)
      .then(r => r.json())
      .then(d => { setInfluencer(d.influencer); setItems(d.items ?? []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [account])

  const filtered = query.trim()
    ? items.filter(item => {
        const q = query.trim().toLowerCase()
        return item.title.toLowerCase().includes(q) || (item.brand || '').toLowerCase().includes(q)
      })
    : items

  // API가 이미 최신순으로 내려주므로 'latest'는 원래 순서 그대로 두고, 가격만 따로 정렬
  const sorted = sortOrder === 'price_low' ? [...filtered].sort((a, b) => a.price - b.price)
    : sortOrder === 'price_high' ? [...filtered].sort((a, b) => b.price - a.price)
    : filtered

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

      {!loading && items.length > 0 && (
        <div className="hero-search-wrap">
          <div className="hero-search">
            <Search size={18} />
            <input
              type="search"
              placeholder="이 인플루언서의 상품 검색"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="topbar">
          <span className="count-text">총 <strong>{sorted.length}</strong>개</span>
          <select
            className="sort-select"
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value as SortOrder)}
          >
            <option value="latest">최신순</option>
            <option value="price_low">낮은 가격순</option>
            <option value="price_high">높은 가격순</option>
          </select>
        </div>
      )}

      <div className="feed" style={{ paddingBottom: 100, paddingTop: 12 }}>
        {loading ? (
          <div className="empty"><p>불러오는 중...</p></div>
        ) : items.length === 0 ? (
          <div className="empty"><p>표시할 수 있는 추천 상품이 없어요</p></div>
        ) : sorted.length === 0 ? (
          <div className="empty"><p>검색 결과가 없어요</p></div>
        ) : (
          sorted.map(item => (
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
