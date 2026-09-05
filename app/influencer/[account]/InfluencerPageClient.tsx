'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Search, Star } from 'lucide-react'
import Toast from '@/components/Toast'

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

interface Props {
  params: { account: string }
  // 상세 페이지(app/influencer/[account]/page.tsx)가 서버에서 이미 계산해 props로
  // 내려준다 — 예전엔 여기서 /api/posts/by-influencer를 클라이언트 fetch로 불러서
  // 서버 HTML엔 상품이 하나도 안 찍혔다(검색엔진이 못 읽음, 80개 페이지 전부 해당).
  initialInfluencer: InfluencerInfo | null
  initialItems: InfluencerItem[]
}

export default function InfluencerPage({ params, initialInfluencer, initialItems }: Props) {
  const account = decodeURIComponent(params.account)
  const [influencer] = useState<InfluencerInfo | null>(initialInfluencer)
  const [items] = useState<InfluencerItem[]>(initialItems)
  const [sortOrder, setSortOrder] = useState<SortOrder>('latest')
  const [query, setQuery] = useState('')
  const [following, setFollowing] = useState(false)
  const [toast, setToast] = useState({ message: '', visible: false })

  // 홈의 "팔로우한 인플루언서만 보기"가 읽는 것과 같은 저장소를 쓴다 — 팔로우는
  // 여기(인플루언서 페이지)에서만 하고, 홈은 그 결과를 필터링해서 보여주기만 한다
  useEffect(() => {
    const saved: string[] = JSON.parse(localStorage.getItem('gonggu_followed_accounts') || '[]')
    setFollowing(saved.includes(account))
  }, [account])

  function toggleFollow() {
    const saved: string[] = JSON.parse(localStorage.getItem('gonggu_followed_accounts') || '[]')
    const set = new Set(saved)
    if (set.has(account)) {
      set.delete(account)
      setToast({ message: '팔로우를 취소했어요', visible: true })
    } else {
      set.add(account)
      setToast({ message: '인플루언서를 팔로우했어요!', visible: true })
    }
    localStorage.setItem('gonggu_followed_accounts', JSON.stringify([...set]))
    setFollowing(set.has(account))
  }

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
          <a href={profileUrl} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 13, color: '#6366f1', fontWeight: 600, textDecoration: 'none' }}>
            인스타그램 {account} 보기 →
          </a>
          <button
            onClick={toggleFollow}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 13, fontWeight: 700,
              padding: '6px 12px', borderRadius: 999,
              border: `1.5px solid ${following ? '#f59e0b' : '#e2e8f0'}`,
              background: following ? '#fffbeb' : '#fff',
              color: following ? '#b45309' : '#64748b',
              cursor: 'pointer',
            }}
          >
            <Star size={14} fill={following ? 'currentColor' : 'none'} />
            {following ? '팔로잉' : '팔로우'}
          </button>
        </div>
      </div>

      <Toast message={toast.message} visible={toast.visible} onHide={() => setToast(t => ({ ...t, visible: false }))} />

      {items.length > 0 && (
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

      {items.length > 0 && (
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
        {items.length === 0 ? (
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
                  <span className="price-sale-big">{item.price ? `${item.price.toLocaleString()}원` : "가격 미정"}</span>
                </div>
              </div>
            </a>
          ))
        )}
      </div>
    </>
  )
}
