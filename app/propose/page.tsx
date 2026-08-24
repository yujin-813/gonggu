'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { InquiryKind } from '@/lib/inquiries'

const KIND_LABEL: Record<InquiryKind, string> = {
  influencer: '인플루언서',
  brand: '브랜드',
  company: '업체',
}

// /request(공구 등록 요청)와 다른 창구다. 그쪽은 "이 공구 하나를 올려주세요"라 구매
// 링크·가격이 필수인데, 여기는 "우리랑 같이 해볼래요?" 제휴 제안이라 아직 판매 페이지가
// 없어도 된다.
export default function ProposePage() {
  const [kind, setKind] = useState<InquiryKind>('influencer')
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [link, setLink] = useState('')
  const [product, setProduct] = useState('')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('')  // 허니팟
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit() {
    setError('')
    if (!name.trim() || !contact.trim()) { setError('이름과 연락처를 입력해주세요'); return }
    if (!message.trim()) { setError('제안 내용을 입력해주세요'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind, name: name.trim(), contact: contact.trim(),
          link: link.trim(), product: product.trim(), message: message.trim(), website,
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
          <p style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>제안이 전달됐어요</p>
          <p style={{ fontSize: 13, color: '#64748b' }}>남겨주신 연락처로 확인 후 답변드릴게요</p>
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
          <div className="logo"><span className="logo-text">공구 제안 · 입점 문의</span></div>
        </div>
      </header>

      <div style={{ padding: '16px 16px 4px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
          공구를 소개하고 싶거나 제휴를 제안하고 싶다면 아래에 남겨주세요
        </p>
      </div>

      <div className="modal" style={{ maxWidth: 480, margin: '16px auto', borderRadius: 16, maxHeight: 'none' }}>
        <label>구분 *</label>
        <div className="modal-row" style={{ marginBottom: 12 }}>
          {(Object.keys(KIND_LABEL) as InquiryKind[]).map(k => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`cat-btn ${kind === k ? 'active' : ''}`}
              style={{ flex: 1 }}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <label>이름 *</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="이름 또는 브랜드명" style={{ width: '100%', marginBottom: 12 }} />

        <label>연락처 *</label>
        <input type="text" value={contact} onChange={e => setContact(e.target.value)} placeholder="이메일 또는 전화번호" style={{ width: '100%', marginBottom: 12 }} />

        <label>인스타그램 또는 사이트 <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>(선택)</span></label>
        <input type="text" value={link} onChange={e => setLink(e.target.value)} placeholder="https://instagram.com/..." style={{ width: '100%', marginBottom: 12 }} />

        <label>공구 상품 <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>(선택)</span></label>
        <input type="text" value={product} onChange={e => setProduct(e.target.value)} placeholder="어떤 상품인가요?" style={{ width: '100%', marginBottom: 12 }} />

        <label>제안 내용 *</label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="어떤 제안인지 자유롭게 적어주세요"
          rows={5}
          style={{ width: '100%', marginBottom: 12, resize: 'vertical', font: 'inherit' }}
        />

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
          {loading ? '제출 중...' : '제안 보내기'}
        </button>
      </div>
    </>
  )
}
