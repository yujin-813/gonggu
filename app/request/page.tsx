'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { Category } from '@/lib/types'
import { CATEGORY_LABEL } from '@/lib/categoryIcons'

const CATS: Category[] = ['kids', 'life', 'food', 'health', 'beauty']

function isInstagramUrl(url: string) {
  if (/instagram\.com\/(p|reel)\/[^/?#]+/.test(url)) return true
  return /^https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]+\/?(\?.*)?$/i.test(url.trim())
}

export default function RequestPage() {
  const [url, setUrl] = useState('')
  const [fetching, setFetching] = useState(false)
  const [title, setTitle] = useState('')
  const [account, setAccount] = useState('')
  const [cat, setCat] = useState<Category>('life')
  const [price, setPrice] = useState('')
  const [purchaseUrl, setPurchaseUrl] = useState('')
  const [startDate, setStartDate] = useState('')
  const [deadline, setDeadline] = useState('')
  const [memo, setMemo] = useState('')
  const [website, setWebsite] = useState('')  // 허니팟 — 사람 눈엔 안 보임
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function fetchMeta(rawUrl: string) {
    if (!rawUrl.trim() || !isInstagramUrl(rawUrl)) return
    setFetching(true)
    try {
      const res = await fetch(`/api/og?url=${encodeURIComponent(rawUrl)}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.account && !account) setAccount(data.account)
      if (data.title && !title) setTitle(data.title.slice(0, 80))
    } catch {}
    finally { setFetching(false) }
  }

  async function handleSubmit() {
    setError('')
    if (!isInstagramUrl(url)) { setError('올바른 인스타그램 URL을 입력해주세요'); return }
    if (!title.trim() || !account.trim()) { setError('상품명과 인스타 계정을 입력해주세요'); return }
    if (!purchaseUrl.trim()) { setError('구매 링크를 입력해주세요'); return }
    if (!price || parseInt(price) <= 0) { setError('판매가를 입력해주세요'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/posts/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          account: account.trim(),
          cat,
          price: parseInt(price),
          purchase_url: purchaseUrl.trim(),
          url: url.trim(),
          start_date: startDate,
          deadline,
          memo: memo.trim(),
          website,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || '제출에 실패했어요. 잠시 후 다시 시도해주세요')
        return
      }
      setDone(true)
    } catch {
      setError('제출에 실패했어요. 잠시 후 다시 시도해주세요')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <>
        <header>
          <div className="header-inner">
            <Link href="/" className="back-btn"><ArrowLeft size={16} /></Link>
            <div className="logo"><span className="logo-text">꿀공구</span></div>
          </div>
        </header>
        <div style={{ padding: '80px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>등록 요청이 접수됐어요</p>
          <p style={{ fontSize: 13, color: '#64748b' }}>담당자가 확인 후 승인하면 사이트에 올라가요</p>
          <Link href="/" style={{ display: 'inline-block', marginTop: 20, fontSize: 13, color: '#6366f1', fontWeight: 600, textDecoration: 'none' }}>
            홈으로 돌아가기 →
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      <header>
        <div className="header-inner">
          <Link href="/" className="back-btn"><ArrowLeft size={16} /></Link>
          <div className="logo"><span className="logo-text">공구 등록 요청</span></div>
        </div>
      </header>

      <div style={{ padding: '16px 16px 4px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
          내가 진행 중인 공구를 꿀공구에 올리고 싶다면 아래 정보를 남겨주세요 — 검토 후 등록돼요
        </p>
      </div>

      <div className="modal" style={{ maxWidth: 480, margin: '16px auto', borderRadius: 16, maxHeight: 'none' }}>
        <label>Instagram 게시글/프로필 URL *</label>
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onBlur={() => fetchMeta(url)}
          placeholder="https://www.instagram.com/p/ABC123..."
          style={{ width: '100%', marginBottom: 12 }}
        />
        {fetching && <p style={{ fontSize: 12, color: '#6366f1', margin: '-8px 0 12px' }}>정보 가져오는 중...</p>}

        <label>인스타 계정 *</label>
        <input type="text" value={account} onChange={e => setAccount(e.target.value)} placeholder="@계정명" style={{ width: '100%', marginBottom: 12 }} />

        <label>상품명 *</label>
        <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 리넨 반팔 원피스" style={{ width: '100%', marginBottom: 12 }} />

        <label>카테고리</label>
        <div className="modal-row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
          {CATS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={`cat-btn ${cat === c ? 'active' : ''}`}
              style={{ flex: '1 1 auto' }}
            >
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>

        <label>판매가 (원) *</label>
        <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="45000" style={{ width: '100%', marginBottom: 12 }} />

        <label>구매 링크 * <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>(스마트스토어, 자사몰 등 실제 구매 페이지)</span></label>
        <input type="url" value={purchaseUrl} onChange={e => setPurchaseUrl(e.target.value)} placeholder="https://smartstore.naver.com/..." style={{ width: '100%', marginBottom: 12 }} />

        <label>공구 기간 <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>(선택)</span></label>
        <div className="modal-row" style={{ marginBottom: 12 }}>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
        </div>

        <label>참고사항 <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>(선택)</span></label>
        <input type="text" value={memo} onChange={e => setMemo(e.target.value)} placeholder="전달하고 싶은 말이 있다면 남겨주세요" style={{ width: '100%', marginBottom: 12 }} />

        {/* 허니팟 — 실사용자에겐 보이지 않고, 자동으로 폼을 채우는 봇만 여기에 값을 채운다 */}
        <input
          type="text"
          value={website}
          onChange={e => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
        />

        {error && <p style={{ color: '#ef4444', fontSize: 13, margin: '0 0 8px', fontWeight: 600 }}>❌ {error}</p>}
        <button className="btn-submit" onClick={handleSubmit} disabled={loading} style={{ width: '100%' }}>
          {loading ? '제출 중...' : '등록 요청하기'}
        </button>
      </div>
    </>
  )
}
