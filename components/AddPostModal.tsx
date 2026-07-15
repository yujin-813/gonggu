'use client'
import { useState, useEffect, useRef } from 'react'
import type { Post, Category } from '@/lib/types'

const CATEGORIES = [
  { value: 'fashion', label: '👗 패션' },
  { value: 'beauty',  label: '💄 뷰티' },
  { value: 'food',    label: '🍱 식품' },
  { value: 'life',    label: '🏠 생활용품' },
  { value: 'kids',    label: '🧸 유아동' },
  { value: 'health',  label: '💊 건강' },
  { value: 'pet',     label: '🐾 반려동물' },
  { value: 'digital', label: '📱 디지털' },
]
const CAT_EMOJI: Record<string, string> = {
  fashion:'👗', beauty:'💄', food:'🍱', life:'🏠',
  kids:'🧸', health:'💊', pet:'🐾', digital:'📱',
}

function todayStr() { return new Date().toISOString().split('T')[0] }
function defaultDate(days = 7) {
  const d = new Date(); d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function isInstagramUrl(url: string) {
  // 게시글/릴스 URL 또는 프로필 URL(인포크 수집 공구는 게시글 링크가 없어 프로필 URL만 저장됨) 모두 허용
  if (/instagram\.com\/(p|reel)\/[^/?#]+/.test(url)) return true
  return /^https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]+\/?(\?.*)?$/i.test(url.trim())
}

type PostInput = Omit<Post, 'id' | 'scraped_at' | 'source'>

interface Props {
  onClose:        () => void
  onSubmit:       (post: PostInput) => Promise<void>
  editPost?:      Post
  existingGroups?: string[]
}

export default function AddPostModal({ onClose, onSubmit, editPost, existingGroups = [] }: Props) {
  const isEdit = !!editPost
  const fileRef = useRef<HTMLInputElement>(null)

  const [url,        setUrl]        = useState('')
  const [urlError,   setUrlError]   = useState('')
  const [fetching,   setFetching]   = useState(false)
  const [autoFilled, setAutoFilled] = useState<string[]>([])

  const [title,     setTitle]     = useState('')
  const [brand,     setBrand]     = useState('')
  const [account,   setAccount]   = useState('')
  const [cat,       setCat]       = useState<Category>('fashion')
  const [startDate, setStartDate] = useState(todayStr())
  const [endDate,   setEndDate]   = useState(defaultDate(7))
  const [price,         setPrice]         = useState('')
  const [origPrice,     setOrigPrice]     = useState('')
  const [groupKey,      setGroupKey]      = useState('')
  const [newGroupMode,  setNewGroupMode]  = useState(false)
  const [newGroupInput, setNewGroupInput] = useState('')

  const [marketUrl,       setMarketUrl]       = useState('')
  const [marketSearching, setMarketSearching] = useState(false)
  const [marketResults,   setMarketResults]   = useState<{ title: string; lprice: number; mallName: string; link: string }[]>([])

  const [imgFile,    setImgFile]    = useState<File | null>(null)
  const [imgPreview, setImgPreview] = useState('')   // blob URL or existing img URL
  const [imgSaved,   setImgSaved]   = useState('')   // uploaded path from server

  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState('')

  // 수정 모드 초기화
  useEffect(() => {
    if (!editPost) return
    setUrl(editPost.url || '')
    setTitle(editPost.title || '')
    setAccount(editPost.account || '')
    setCat(editPost.cat || 'fashion')
    // 원본에서 확인 안 된 날짜는 오늘/+7일로 임의 대체하지 않고 비워둔다 — 확인된 것처럼 보이는 걸 방지
    setStartDate(editPost.start_date || '')
    setEndDate(editPost.deadline || '')
    setPrice(editPost.price ? String(editPost.price) : '')
    // origPrice는 관리자가 직접 입력한 값만 — market_price를 채워넣으면 그냥 저장 버튼만
    // 눌러도 그 시점의 market_price가 origPrice로 영구 고정돼버려서(재검증돼도 origPrice는 안 바뀜),
    // 자동 수집된 값은 아래 "자동 매칭" 안내로만 보여주고 이 입력칸엔 절대 자동으로 채우지 않는다
    setOrigPrice(editPost.origPrice ? String(editPost.origPrice) : '')
    setMarketUrl(editPost.market_url || '')
    const gk = editPost.group_key || ''
    setGroupKey(gk)
    setNewGroupMode(false)
    setNewGroupInput('')
    setBrand(editPost.brand || '')
    if (editPost.img && !editPost.img.startsWith('data:')) {
      setImgPreview(editPost.img)
      setImgSaved(editPost.img)
    }
  }, [editPost])

  // URL 입력 → 자동완성
  async function fetchMeta(rawUrl: string) {
    if (!rawUrl.trim() || !isInstagramUrl(rawUrl)) return
    setFetching(true)
    setAutoFilled([])
    try {
      const res  = await fetch(`/api/og?url=${encodeURIComponent(rawUrl)}`)
      if (!res.ok) return
      const data = await res.json()

      const filled: string[] = []
      if (data.account && !account) { setAccount(data.account); filled.push('account') }
      if (data.title   && !title)   { setTitle(data.title.slice(0, 80)); filled.push('title') }
      // 썸네일 → 이미지 업로드 영역에 프리뷰로만 표시 (저장은 직접 업로드)
      if (data.thumbnail && !imgPreview) {
        setImgPreview(data.thumbnail)
        // imgFile은 null 유지 → 제출 시 업로드 스킵, imgSaved도 비워둠
      }
      if (filled.length) setAutoFilled(filled)
    } catch {}
    finally { setFetching(false) }
  }

  function handleUrlChange(v: string) {
    setUrl(v)
    setUrlError('')
    setAutoFilled([])
  }

  function handleUrlBlur() {
    if (!url.trim()) { setUrlError(''); return }
    if (!isInstagramUrl(url)) {
      setUrlError('인스타그램 게시글 URL을 입력해주세요. (예: https://www.instagram.com/p/ABC123/)')
      return
    }
    setUrlError('')
    fetchMeta(url)
  }

  // URL 붙여넣기 즉시 실행
  function handleUrlPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text')
    if (isInstagramUrl(pasted)) {
      setTimeout(() => fetchMeta(pasted), 50)
    }
  }

  // 이미지 선택
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImgFile(file)
    setImgPreview(URL.createObjectURL(file))
    setImgSaved('')
  }

  // 이미지 업로드 (제출 시)
  async function uploadImage(): Promise<string> {
    if (!imgFile) return imgSaved
    const fd = new FormData()
    fd.append('file', imgFile)
    const r = await fetch('/api/upload', { method: 'POST', body: fd })
    if (!r.ok) throw new Error('이미지 업로드 실패')
    const d = await r.json()
    return d.url as string
  }

  const isUpcomingPost = startDate > todayStr()

  async function handleSubmit() {
    setFormError('')
    if (!url.trim() || !isInstagramUrl(url)) {
      setUrlError('올바른 인스타그램 게시글 URL을 입력해주세요')
      return
    }
    if (!title.trim() || !account.trim()) {
      setFormError('상품명과 계정명을 입력해주세요')
      return
    }
    // 공구 기간(시작일/마감일)은 원본에서 확인이 안 되는 경우가 많아 필수로 두지 않는다 —
    // 확인되면 채우고, 안 되면 비운 채로 저장해 "마감일 미확인" 상태로 남긴다
    if (!isUpcomingPost && !price) {
      setFormError('판매가를 입력해주세요')
      return
    }

    setLoading(true)
    try {
      const uploadedImg = await uploadImage()
      await onSubmit({
        shortcode:    editPost?.shortcode ?? null,
        title:        title.trim(),
        brand:        brand.trim() || null,
        account:      account.trim().startsWith('@') ? account.trim() : '@' + account.trim(),
        cat,
        price:        price ? parseInt(price) : 0,
        origPrice:    origPrice ? parseInt(origPrice) : null,
        start_date:   startDate || '',
        deadline:     endDate,
        img:          uploadedImg || '',
        url:          url.trim(),
        participants: editPost?.participants ?? 0,
        avatar:       CAT_EMOJI[cat] || '🛍️',
        caption:      editPost?.caption || '',
        group_key:    (newGroupMode ? newGroupInput : groupKey).trim() || null,
        market_url:   marketUrl.trim() || null,
        published:    editPost?.published ?? !isUpcomingPost,
        status:       editPost?.status ?? (isUpcomingPost ? 'upcoming' : 'ready'),
      })
    } catch (err) {
      console.error(err)
      setFormError('저장에 실패했습니다. 잠시 후 다시 시도해주세요')
    } finally {
      setLoading(false)
    }
  }

  const isHighlight = (field: string) => autoFilled.includes(field)

  return (
    <div className="modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>
          {isEdit ? '✏️ 공구 수정' : '🛍️ 공구 등록'}
          <button className="btn-close-modal" onClick={onClose}>✕</button>
        </h2>

        {/* URL — 핵심 입력 */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isEdit && url && isInstagramUrl(url) ? (
            <a href={url} target="_blank" rel="noopener noreferrer"
              style={{ color: '#6366f1', fontWeight: 700, textDecoration: 'none' }}>
              Instagram 게시글 URL *
              <span style={{ fontSize: 11, background: '#ede9fe', padding: '1px 6px', borderRadius: 10, marginLeft: 4 }}>열기 →</span>
            </a>
          ) : (
            <span>Instagram 게시글 URL *</span>
          )}
        </label>
        <div style={{ position: 'relative' }}>
          <input
            type="url"
            value={url}
            onChange={e => handleUrlChange(e.target.value)}
            onBlur={handleUrlBlur}
            onPaste={handleUrlPaste}
            placeholder="https://www.instagram.com/p/ABC123..."
            style={urlError ? { borderColor: '#ef4444' } : {}}
          />
          {fetching && (
            <span style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              fontSize: 12, color: '#6366f1', background: '#fff', padding: '0 4px',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span> 정보 가져오는 중...
            </span>
          )}
        </div>
        {urlError && <p style={{ color: '#ef4444', fontSize: 12, margin: '4px 0 0' }}>{urlError}</p>}
        {autoFilled.length > 0 && !fetching && (
          <p style={{ color: '#16a34a', fontSize: 12, margin: '4px 0 0' }}>
            ✅ {autoFilled.map(f => f === 'account' ? '계정명' : '상품명').join(', ')} 자동 입력됨 — 확인 후 수정하세요
          </p>
        )}

        {/* 계정명 */}
        <label>계정명 *</label>
        <input
          type="text"
          value={account}
          onChange={e => setAccount(e.target.value)}
          placeholder="@계정명"
          style={isHighlight('account') ? { borderColor: '#6366f1', background: '#f5f3ff' } : {}}
        />

        {/* 상품명 */}
        <label>상품명 *</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="예: 리넨 반팔 원피스"
          style={isHighlight('title') ? { borderColor: '#6366f1', background: '#f5f3ff' } : {}}
        />

        {/* 브랜드 */}
        <label>브랜드명 <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>(선택)</span></label>
        <input
          type="text"
          value={brand}
          onChange={e => setBrand(e.target.value)}
          placeholder="예: 무신사, 아디다스, 올리브영..."
        />

        {/* 카테고리 */}
        <label>카테고리</label>
        <select value={cat} onChange={e => setCat(e.target.value as Category)}>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>

        {/* 공구 기간 — 원본에서 확인 안 되는 경우가 많아 필수 아님. 확인되는 만큼만 입력 */}
        <label>공구 기간 <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>(선택 — 확인되는 대로 입력)</span></label>
        <div className="modal-row">
          <div>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#94a3b8', flexShrink: 0, padding: '0 4px' }}>~</div>
          <div>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
        {isEdit && !(editPost?.is_evergreen_deal || editPost?.is_always_on) && (!editPost?.start_date || !editPost?.deadline) && (
          <p style={{ color: '#f97316', fontSize: 12, margin: '4px 0 0' }}>
            ⚠️ 원본에서 {!editPost?.start_date && !editPost?.deadline ? '시작일과 마감일을' : !editPost?.start_date ? '시작일을' : '마감일을'} 확인하지 못했습니다 — 확인되면 입력하고, 모르면 비워둔 채 저장해도 됩니다 (목록에 &quot;미확인&quot;으로 표시됩니다)
          </p>
        )}

        {/* 가격 */}
        <div className="modal-row">
          <div>
            <label>판매가 (원) *</label>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="45000" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ margin: 0 }}>네이버쇼핑 가격 (원, 선택)</label>
              <button
                type="button"
                onClick={async () => {
                  if (!title.trim()) return
                  setMarketSearching(true)
                  setMarketResults([])
                  try {
                    const r = await fetch(`/api/market-price?q=${encodeURIComponent(title.trim())}`)
                    const d = await r.json()
                    setMarketResults(d.items ?? [])
                  } catch {}
                  finally { setMarketSearching(false) }
                }}
                disabled={marketSearching || !title.trim()}
                style={{
                  background: 'none', border: 'none', fontSize: 12,
                  color: title.trim() ? '#6366f1' : '#94a3b8',
                  cursor: title.trim() ? 'pointer' : 'default', padding: 0,
                }}
              >
                {marketSearching ? '검색 중...' : '🔍 네이버쇼핑 검색'}
              </button>
            </div>
            <input type="number" value={origPrice} onChange={e => { setOrigPrice(e.target.value); if (!e.target.value) setMarketUrl('') }} placeholder="60000" />
            {isEdit && editPost?.market_price && !origPrice && (
              <p style={{ fontSize: 11, color: '#6366f1', margin: '4px 0 0' }}>
                🔍 자동 매칭된 네이버 최저가: {editPost.market_price.toLocaleString()}원 (이 값은 자동 재검증되며, 직접 입력하면 그 값이 우선 사용돼요)
              </p>
            )}
            {marketUrl && origPrice && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 11, color: '#16a34a' }}>✅ 네이버쇼핑 링크 연결됨</span>
                <a href={marketUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#6366f1' }}>미리보기 →</a>
                <button type="button" onClick={() => { setMarketUrl(''); }} style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>링크 제거</button>
              </div>
            )}
            {marketResults.length > 0 && (
              <div style={{ marginTop: 6, border: '1.5px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                {marketResults.map((item, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setOrigPrice(String(item.lprice)); setMarketUrl(item.link); setMarketResults([]) }}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      width: '100%', padding: '8px 12px', background: i % 2 === 0 ? '#f8fafc' : '#fff',
                      border: 'none', borderBottom: i < marketResults.length - 1 ? '1px solid #f1f5f9' : 'none',
                      cursor: 'pointer', textAlign: 'left', gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 12, color: '#0f172a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#e11d48', flexShrink: 0 }}>{item.lprice.toLocaleString()}원</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setMarketResults([])}
                  style={{ width: '100%', padding: '6px', background: '#f1f5f9', border: 'none', fontSize: 11, color: '#94a3b8', cursor: 'pointer' }}
                >
                  닫기
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 가격 비교 그룹 */}
        <label>
          비교 그룹
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>(선택 — 같은 상품 가격비교용)</span>
        </label>
        {!newGroupMode ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <select
              value={groupKey}
              onChange={e => setGroupKey(e.target.value)}
              style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 14, background: '#fff', color: groupKey ? '#0f172a' : '#94a3b8' }}
            >
              <option value="">그룹 없음</option>
              {existingGroups.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => { setNewGroupMode(true); setGroupKey('') }}
              style={{ background: '#f1f5f9', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '0 12px', fontSize: 12, color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              ＋ 새 그룹
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={newGroupInput}
              onChange={e => setNewGroupInput(e.target.value)}
              placeholder="새 그룹 이름 입력 (예: 리넨원피스2025)"
              autoFocus
              style={{ flex: 1 }}
            />
            <button
              type="button"
              onClick={() => { setNewGroupMode(false); setNewGroupInput('') }}
              style={{ background: '#f1f5f9', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '0 12px', fontSize: 12, color: '#475569', cursor: 'pointer' }}
            >
              취소
            </button>
          </div>
        )}

        {/* 이미지 업로드 */}
        <label>상품 이미지</label>
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            border: '2px dashed #e2e8f0', borderRadius: 12, padding: imgPreview ? 8 : '24px 16px',
            cursor: 'pointer', textAlign: 'center', background: '#f8fafc',
            transition: 'border-color 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#6366f1')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
        >
          {imgPreview ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src={imgPreview} alt="미리보기" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>
                  {imgFile ? imgFile.name : !imgSaved ? '인스타 썸네일 (참고용)' : '기존 이미지'}
                </div>
                <div style={{ fontSize: 12, color: '#6366f1' }}>클릭하여 직접 이미지 업로드</div>
                {!imgFile && !imgSaved && (
                  <div style={{ fontSize: 11, color: '#f97316', marginTop: 2 }}>
                    ⚠️ 썸네일은 저장 안됨 — 이미지를 직접 업로드해주세요
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
              <div style={{ fontSize: 13, color: '#64748b' }}>클릭하여 이미지 업로드</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>JPG, PNG, WEBP 지원</div>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

        {isUpcomingPost && !isEdit && (
          <div style={{ background: '#ede9fe', borderRadius: 8, padding: '10px 14px', marginBottom: 8, fontSize: 13, color: '#7c3aed' }}>
            🗓️ 시작일이 미래입니다 — <strong>오픈 예정</strong>으로 등록되어 소비자 화면에 D-day 표시됩니다. 가격/마감일은 선택사항입니다.
          </div>
        )}
        {formError && <p style={{ color: '#ef4444', fontSize: 13, margin: '0 0 8px', fontWeight: 600 }}>❌ {formError}</p>}
        <button className="btn-submit" onClick={handleSubmit} disabled={loading}>
          {loading ? (imgFile ? '이미지 업로드 중...' : '처리 중...') : isEdit ? '수정 완료 ✓' : isUpcomingPost ? '오픈 예정 등록 🗓️' : '공구 올리기 🛍️'}
        </button>
      </div>
    </div>
  )
}
