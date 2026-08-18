'use client'
import { useState, useEffect, useRef } from 'react'
import type { Post, Category, PurchaseLink, DealOption } from '@/lib/types'
import { normalizePurchaseLinks } from '@/lib/purchaseLinks'

const CATEGORIES = [
  { value: 'kids',   label: '유아동' },
  { value: 'life',   label: '생활' },
  { value: 'food',   label: '식품' },
  { value: 'health', label: '건강' },
  { value: 'beauty', label: '뷰티' },
]
const CAT_EMOJI: Record<string, string> = {
  kids:'', life:'', food:'', health:'', beauty:'',
}

function todayStr() { return new Date().toISOString().split('T')[0] }
function defaultDate(days = 7) {
  const d = new Date(); d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

// 관리자가 입력 화면과 나란히 비교할 수 있도록 새 탭 대신 화면 오른쪽에 작은 팝업 창으로 띄움 —
// 같은 창 이름을 재사용해 버튼을 다시 눌러도 창이 계속 늘어나지 않고 검색어만 갱신됨
function openNaverSearchPopup(query: string) {
  const width  = 480
  const height = Math.min(900, window.screen.availHeight - 80)
  const left   = window.screen.availWidth - width - 20
  const top    = 40
  const url = `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(query)}`
  const popup = window.open(url, 'naver_price_search_popup', `width=${width},height=${height},left=${left},top=${top}`)
  popup?.focus()
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
  groupPriceHistory?: Record<string, { id: number; price: number; origPrice: number | null; date: string }[]>
}

export default function AddPostModal({ onClose, onSubmit, editPost, existingGroups = [], groupPriceHistory = {} }: Props) {
  const isEdit = !!editPost
  const fileRef = useRef<HTMLInputElement>(null)

  const [url,        setUrl]        = useState('')
  const [urlError,   setUrlError]   = useState('')
  const [purchaseUrl, setPurchaseUrl] = useState('')
  const [fetching,   setFetching]   = useState(false)
  const [autoFilled, setAutoFilled] = useState<string[]>([])

  const [title,     setTitle]     = useState('')
  const [brand,     setBrand]     = useState('')
  const [account,   setAccount]   = useState('')
  const [cat,       setCat]       = useState<Category>('life')
  const [startDate, setStartDate] = useState(todayStr())
  const [endDate,   setEndDate]   = useState(defaultDate(7))
  const [price,         setPrice]         = useState('')
  const [origPrice,     setOrigPrice]     = useState('')
  const [isExclusiveDeal, setIsExclusiveDeal] = useState(false)
  const [marketPriceNote, setMarketPriceNote] = useState('')
  const [groupKey,      setGroupKey]      = useState('')
  const [newGroupMode,  setNewGroupMode]  = useState(false)
  const [newGroupInput, setNewGroupInput] = useState('')

  const [marketUrl, setMarketUrl] = useState('')

  const [customVerdict,       setCustomVerdict]       = useState('')
  const [customVerdictDetail, setCustomVerdictDetail] = useState('')
  const [customVerdictCls,    setCustomVerdictCls]    = useState<'great' | 'good' | 'neutral' | 'check'>('good')

  // 대체 구매 링크는 여러 판매처를 가질 수 있어서 배열로 관리한다.
  // 예전 단일 필드(partners_*)로 저장된 값도 normalizePurchaseLinks가 함께 읽어준다.
  const [purchaseLinks, setPurchaseLinks] = useState<PurchaseLink[]>([])
  const [marketPrice, setMarketPrice] = useState('')
  const [options, setOptions] = useState<DealOption[]>([])

  const [imgFile,    setImgFile]    = useState<File | null>(null)
  const [imgPreview, setImgPreview] = useState('')   // blob URL or existing img URL
  const [imgSaved,   setImgSaved]   = useState('')   // uploaded path from server

  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState('')

  // 수정 모드 초기화
  useEffect(() => {
    if (!editPost) return
    setUrl(editPost.url || '')
    setPurchaseUrl(editPost.purchase_url || '')
    setTitle(editPost.title || '')
    setAccount(editPost.account || '')
    setCat(editPost.cat || 'life')
    // 원본에서 확인 안 된 날짜는 오늘/+7일로 임의 대체하지 않고 비워둔다 — 확인된 것처럼 보이는 걸 방지
    setStartDate(editPost.start_date || '')
    setEndDate(editPost.deadline || '')
    setPrice(editPost.price ? String(editPost.price) : '')
    // origPrice는 관리자가 직접 입력한 값만 — market_price를 채워넣으면 그냥 저장 버튼만
    // 눌러도 그 시점의 market_price가 origPrice로 영구 고정돼버려서(재검증돼도 origPrice는 안 바뀜),
    // 자동 수집된 값은 아래 "자동 매칭" 안내로만 보여주고 이 입력칸엔 절대 자동으로 채우지 않는다
    setOrigPrice(editPost.origPrice ? String(editPost.origPrice) : '')
    setMarketPriceNote(editPost.market_price_note || '')
    setMarketUrl(editPost.market_url || '')
    setIsExclusiveDeal(editPost.is_exclusive_deal ?? false)
    setCustomVerdict(editPost.custom_verdict || '')
    setCustomVerdictDetail(editPost.custom_verdict_detail || '')
    setCustomVerdictCls(editPost.custom_verdict_cls || 'good')
    setPurchaseLinks(normalizePurchaseLinks(editPost))
    setMarketPrice(editPost.market_price ? String(editPost.market_price) : '')
    setOptions(editPost.options ?? [])
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
      // 가격/마감일을 채워 넣어도 예전에 자동 분류 때 붙은 "가격 미입력"/"마감일 미확인"
      // 검수 사유가 그대로 남아있던 문제 — 지금 값 기준으로 더는 해당 안 되는 사유는 지운다
      const hasPrice = !!(price && parseInt(price) > 0)
      const hasDeadline = !!endDate || !!(editPost?.is_evergreen_deal || editPost?.is_always_on || editPost?.sale_until_sold_out)
      const review_reason = (editPost?.review_reason || []).filter(r =>
        !(r === '가격 미입력' && hasPrice) && !(r === '마감일 미확인' && hasDeadline)
      )
      // 플랫폼/가격/링크가 다 채워져야 파트너스 정보로 인정 — 하나라도 비면 고객 노출도 강제로 끈다
      // URL 없는 줄은 버리고, 확인 시각을 채워 넣는다 (가격 표기 옆에 언제 확인했는지 쓰기 위함)
      const cleanedLinks: PurchaseLink[] = purchaseLinks
        .filter(l => l.url.trim())
        .map(l => ({
          ...l,
          url: l.url.trim(),
          note: (l.note || '').trim() || null,
          checked_at: l.checked_at || new Date().toISOString(),
        }))
      await onSubmit({
        shortcode:    editPost?.shortcode ?? null,
        title:        title.trim(),
        brand:        brand.trim() || null,
        account:      account.trim().startsWith('@') ? account.trim() : '@' + account.trim(),
        cat,
        price:        price ? parseInt(price) : 0,
        origPrice:    origPrice ? parseInt(origPrice) : null,
        market_price_note: marketPriceNote.trim() || null,
        market_price:      marketPrice ? parseInt(marketPrice) : null,
        is_exclusive_deal: isExclusiveDeal,
        start_date:   startDate || '',
        deadline:     endDate,
        img:          uploadedImg || '',
        url:          url.trim(),
        purchase_url: purchaseUrl.trim() || null,
        participants: editPost?.participants ?? 0,
        avatar:       CAT_EMOJI[cat] || '🛍️',
        caption:      editPost?.caption || '',
        group_key:    (newGroupMode ? newGroupInput : groupKey).trim() || null,
        market_url:   marketUrl.trim() || null,
        published:    editPost?.published ?? !isUpcomingPost,
        status:       editPost?.status ?? (isUpcomingPost ? 'upcoming' : 'ready'),
        review_reason,
        custom_verdict:        customVerdict.trim() || null,
        custom_verdict_detail: customVerdict.trim() ? (customVerdictDetail.trim() || null) : null,
        custom_verdict_cls:    customVerdict.trim() ? customVerdictCls : null,
        // 구성·공구가가 채워진 세트만 저장한다 (빈 줄이 판정에 섞이면 안 된다)
        options: options.filter(o => o.price > 0),
        purchase_links: cleanedLinks,
        // 예전 단일 필드는 비워 둔다 — 위 배열이 이미 그 값을 흡수했고, 남겨두면
        // 관리자가 지운 링크가 normalizePurchaseLinks를 통해 되살아난다
        partners_platform:     null,
        partners_price:        null,
        partners_url:          null,
        partners_option_note:  null,
        partners_checked_at:   null,
        partners_visible:      false,
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

        {/* 구매 링크 — "공구 보기" 버튼이 실제로 이동하는 곳. 인포크로 수집된 공구는 인스타 게시글
            URL이 프로필 링크로만 남아있어서(개별 게시글 링크가 없음), 실제 구매처는 여기서만 확인·수정 가능 */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {purchaseUrl ? (
            <a href={purchaseUrl} target="_blank" rel="noopener noreferrer"
              style={{ color: '#16a34a', fontWeight: 700, textDecoration: 'none' }}>
              구매 링크
              <span style={{ fontSize: 11, background: '#dcfce7', padding: '1px 6px', borderRadius: 10, marginLeft: 4 }}>열기 →</span>
            </a>
          ) : (
            <span>구매 링크</span>
          )}
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>
            (선택 — &quot;공구 보기&quot; 버튼이 실제로 이동하는 링크. 비워두면 위 인스타 URL로 대신 이동해요)
          </span>
        </label>
        <input
          type="url"
          value={purchaseUrl}
          onChange={e => setPurchaseUrl(e.target.value)}
          placeholder="https://smartstore.naver.com/... 또는 쿠팡/자사몰 등"
        />

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
            <label style={{ margin: '0 0 6px', display: 'block' }}>네이버쇼핑 가격 (원, 선택)</label>
            <div style={{ marginBottom: 6 }}>
              <button
                type="button"
                onClick={() => openNaverSearchPopup(title)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: '#f1f5f9', color: '#475569', border: '1.5px solid #e2e8f0',
                  borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                🔍 네이버쇼핑에서 검색 (팝업)
              </button>
            </div>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 6px' }}>
              네이버 쇼핑 검색 API가 더 이상 지원되지 않아 자동 검색은 종료됐어요 — 위 버튼으로 화면 옆에 작은 창을 띄워서 이 입력 화면과 나란히 비교하며 가격/링크를 아래에 입력해주세요
            </p>
            <input type="number" value={origPrice} onChange={e => { setOrigPrice(e.target.value); if (!e.target.value) setMarketUrl('') }} placeholder="60000" />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontWeight: 400, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={isExclusiveDeal}
                onChange={e => setIsExclusiveDeal(e.target.checked)}
                style={{ width: 'auto' }}
              />
              다른 곳에서는 안 팔아요 (공구 전용 상품)
            </label>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>
              {origPrice
                ? '위에 비교가가 입력돼 있는 동안은 체크해도 화면엔 반영 안 돼요 — 비교가를 지우면 적용됩니다'
                : '고객 화면에 "네이버 최저가 정보가 없어요" 대신 "여기서만 만나볼 수 있어요"로 표시돼요 — 실제로 다른 채널에서 안 파는 게 확실할 때만 체크해주세요'}
            </p>
            {/* 자동 매칭값은 엉뚱한 상품을 잡는 경우가 있는데(예: 59,000원 드라이기에
                19,800원이 매칭됨) 지금까지 고칠 방법이 없어서 판정이 계속 틀렸다.
                여기서 바로 고치거나 지울 수 있게 한다. */}
            {isEdit && editPost?.market_price != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 0', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: '#64748b' }}>자동 매칭된 네이버 최저가</span>
                <input
                  type="number"
                  value={marketPrice}
                  onChange={e => setMarketPrice(e.target.value)}
                  placeholder="비우면 사용 안 함"
                  style={{ width: 120, padding: '5px 8px', borderRadius: 6, border: '1.5px solid #e2e8f0', fontSize: 12, outline: 'none' }}
                />
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  상품이 다르면 지워주세요 — 판정이 이 값에 끌려갑니다
                </span>
              </div>
            )}
            {marketUrl && origPrice && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 11, color: '#16a34a' }}>✅ 네이버쇼핑 링크 연결됨</span>
                <a href={marketUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#6366f1' }}>미리보기 →</a>
                <button type="button" onClick={() => { setMarketUrl(''); }} style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>링크 제거</button>
              </div>
            )}
            {origPrice && (
              <div style={{ marginTop: 8 }}>
                <input type="text" value={marketPriceNote} onChange={e => setMarketPriceNote(e.target.value)}
                  placeholder="가격 비교 참고사항 (선택 — 예: 네이버가는 칫솔살균기 단품 기준, 이 공구는 칫솔 포함)" />
                <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>
                  구성이 달라 단순 비교가 부정확할 때만 채워주세요 — 자동 계산은 그대로 두고 이 문구를 판단 문구 뒤에 덧붙여요
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 구매 판단 문구 직접 입력 */}
        <label>
          구매 판단 문구 직접 입력
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>
            (선택 — 비워두면 자동 판단 사용, 채우면 이 문구가 카드에 그대로 노출돼요)
          </span>
        </label>
        <div className="modal-row">
          <div>
            <input type="text" value={customVerdict} onChange={e => setCustomVerdict(e.target.value)} placeholder="예: 살만해요" />
          </div>
          <div>
            <select value={customVerdictCls} onChange={e => setCustomVerdictCls(e.target.value as typeof customVerdictCls)}>
              <option value="great">완전 득템 (핑크)</option>
              <option value="good">살만해요 (초록)</option>
              <option value="neutral">가격 보통 (노랑)</option>
              <option value="check">직접 비교 필요 (주황)</option>
            </select>
          </div>
        </div>
        {customVerdict.trim() && (
          <input type="text" value={customVerdictDetail} onChange={e => setCustomVerdictDetail(e.target.value)}
            placeholder="설명 문구 (예: 실제 매장가보다 1만원 저렴해요)" style={{ marginTop: 6 }} />
        )}
        {customVerdict.trim() && (
          <p style={{ fontSize: 11, color: '#f97316', margin: '4px 0 0' }}>
            ⚠️ 이 문구는 자동 계산을 완전히 덮어써요 — 실제 가격 근거 없이 좋게만 쓰면 나중에 신뢰를 잃을 수 있으니, 자동 판단이 놓친 진짜 정보를 보완할 때만 사용해주세요.
          </p>
        )}

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
        {!newGroupMode && groupKey && groupPriceHistory[groupKey]?.some(h => h.id !== editPost?.id) && (
          <div style={{ marginTop: 6, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px' }}>
            <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 4px', fontWeight: 600 }}>📈 이 그룹 지난 공구가</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {groupPriceHistory[groupKey]
                .filter(h => h.id !== editPost?.id)
                .slice(0, 6)
                .map(h => (
                  <span key={h.id} style={{ fontSize: 12, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '2px 8px', color: '#334155' }}>
                    {h.date ? `${h.date.slice(5).replace('-', '.')} · ` : ''}{h.price.toLocaleString()}원
                    {h.origPrice && h.origPrice > h.price && <span style={{ color: '#94a3b8' }}> (정가 {h.origPrice.toLocaleString()})</span>}
                  </span>
                ))}
            </div>
          </div>
        )}

        {/* 세트 옵션 — "공구 글 1개 = 상품 1개"가 아니라 "공구 1개 + 세트 여러 개"다.
            세트가 7~8개인 공구에 판매가 하나·비교가 하나만 두면 어느 구성 기준인지 알 수
            없고 판정도 그 하나로만 나온다. 비교가는 세트마다 있어야 한다.
            옵션을 하나라도 넣으면 위의 판매가·비교가 대신 이 값들로 판정한다. */}
        <label>
          공구 옵션
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>
            (세트가 여러 개일 때만 — 넣으면 위 판매가·비교가 대신 이 값으로 판정해요)
          </span>
        </label>

        {options.map((o, i) => {
          const update = (patch: Partial<DealOption>) =>
            setOptions(prev => prev.map((x, idx) => idx === i ? { ...x, ...patch } : x))
          const saved = o.comparePrice && o.price ? o.comparePrice - o.price : 0
          const rate = o.comparePrice && o.price ? Math.round((1 - o.price / o.comparePrice) * 100) : 0
          return (
            <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>세트 {i + 1}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {saved > 0 && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#15803d' }}>
                      {saved.toLocaleString()}원 절약 · {rate}%↓
                    </span>
                  )}
                  <button type="button" onClick={() => setOptions(prev => prev.filter((_, idx) => idx !== i))}
                    style={{ padding: '3px 9px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                    삭제
                  </button>
                </div>
              </div>
              <input type="text" value={o.name} onChange={e => update({ name: e.target.value })}
                placeholder="구성 (예: 위시 2개 + 칫솔 6개 + 치약 3개)" />
              <div className="modal-row" style={{ marginTop: 6 }}>
                <div>
                  <input type="number" value={o.price || ''} onChange={e => update({ price: parseInt(e.target.value) || 0 })}
                    placeholder="공구가" />
                </div>
                <div>
                  <input type="number" value={o.comparePrice ?? ''} onChange={e => update({ comparePrice: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="개별 구매가 (비교가)" />
                </div>
              </div>
              <input type="text" value={o.gift ?? ''} onChange={e => update({ gift: e.target.value })}
                placeholder="사은품 (선택 — 가격 비교에는 안 들어가요)" style={{ marginTop: 6 }} />
            </div>
          )
        })}

        <button type="button"
          onClick={() => setOptions(prev => [...prev, { name: '', price: 0, comparePrice: null, gift: null }])}
          style={{ padding: '7px 12px', background: '#eef2ff', color: '#4338ca', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
          + 세트 추가
        </button>

        {options.length > 0 && (
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '6px 0 0' }}>
            고객 화면에는 &quot;{Math.min(...options.filter(o => o.price > 0).map(o => o.price)).toLocaleString()}원부터 · 총 {options.length}개 구성&quot;으로 보이고,
            상세에서 세트별 표로 펼쳐집니다.
          </p>
        )}

        {/* 대체 구매 링크 — 공구가 끝난 뒤 "지금 바로 사고 싶은" 사용자를 보낼 곳.
            여러 판매처를 가질 수 있어서 줄 단위로 추가·삭제한다. */}
        <label>
          대체 구매 링크
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>
            (선택 — 공구 종료 후 이 링크로 안내합니다)
          </span>
        </label>

        {purchaseLinks.length === 0 && (
          <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 6px' }}>
            등록된 링크가 없어요. 공구가 끝나면 상세 페이지에 안내할 구매처가 없습니다.
          </p>
        )}

        {purchaseLinks.map((link, i) => {
          const update = (patch: Partial<PurchaseLink>) =>
            setPurchaseLinks(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l))
          const complete = !!link.url.trim()
          return (
            <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, marginBottom: 8 }}>
              <div className="modal-row">
                <div>
                  <select value={link.platform} onChange={e => update({ platform: e.target.value as PurchaseLink['platform'] })}>
                    <option value="naver">네이버</option>
                    <option value="coupang">쿠팡</option>
                    <option value="other">기타 판매처</option>
                  </select>
                </div>
                <div>
                  <input
                    type="number"
                    value={link.price ?? ''}
                    onChange={e => update({ price: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="가격 (선택)"
                  />
                </div>
              </div>
              <input
                type="url"
                value={link.url}
                onChange={e => update({ url: e.target.value })}
                placeholder="https://..."
                style={{ marginTop: 6 }}
              />
              <input
                type="text"
                value={link.note ?? ''}
                onChange={e => update({ note: e.target.value })}
                placeholder="옵션/구성 참고사항 (선택 — 예: 2개입 기준)"
                style={{ marginTop: 6 }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={link.visible !== false}
                    onChange={e => update({ visible: e.target.checked })}
                    disabled={!complete}
                    style={{ width: 'auto' }}
                  />
                  고객 화면에 노출
                </label>
                <button
                  type="button"
                  onClick={() => setPurchaseLinks(prev => prev.filter((_, idx) => idx !== i))}
                  style={{ padding: '4px 10px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  삭제
                </button>
              </div>
              {!complete && (
                <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>
                  링크를 입력해야 노출할 수 있어요
                </p>
              )}
            </div>
          )
        })}

        <button
          type="button"
          onClick={() => setPurchaseLinks(prev => [...prev, { platform: 'coupang', url: '', price: null, note: null, visible: true }])}
          style={{ padding: '7px 12px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
          + 구매 링크 추가
        </button>

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
