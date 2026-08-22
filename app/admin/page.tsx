'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import type { Post, ScraperStatus, InfluencerSource, Collection } from '@/lib/types'
import { daysLeft, periodLabel, isExpired, isCustomerVisible, isPagePublic, fmtDate } from '@/lib/period'
import { hasPurchaseLink, normalizePurchaseLinks } from '@/lib/purchaseLinks'
import { getDealVerdict, isMultiOption } from '@/lib/dealGrade'
import { partnerSearchQuery } from '@/lib/searchQuery'
import { getCompareState, COMPARE_STATE_LABEL, CLEAR_COMPARE_NONE, type CompareState } from '@/lib/compareState'
import { findCompareCandidates, type CompareCandidate } from '@/lib/compareCandidates'
import { COMPARE_NONE_REASON_LABEL, type CompareNoneReason } from '@/lib/types'
import { GradeBadge } from '@/components/DealVerdictBox'
import { CheckCircle2, CircleDot, TriangleAlert, FileEdit, Search, Flame, ImageOff, Eye, EyeOff, Package, Copy, type LucideIcon } from 'lucide-react'
import AddPostModal from '@/components/AddPostModal'

interface DayStat { date: string; visitors: number; events: Record<string, number>; newVisitors: number; returningVisitors: number }
interface TopPost { id: number; title: string; img: string | null; price: number; count: number }

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [pw, setPw]       = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      })
      if (r.ok) {
        onLogin()
      } else {
        setError('비밀번호가 틀렸습니다')
        setPw('')
      }
    } catch {
      setError('서버 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#f8fafc',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Noto Sans KR', sans-serif",
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '40px 36px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)', width: '100%', maxWidth: 340,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/logo-symbol.png" alt="" width={44} height={44} style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 700, fontSize: 20, color: '#1e293b' }}>꿀공구 관리자</div>
          <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>비밀번호를 입력하세요</div>
        </div>
        <form onSubmit={submit}>
          <input
            type="password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            placeholder="비밀번호"
            autoFocus
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0',
              fontSize: 15, outline: 'none', boxSizing: 'border-box',
              borderColor: error ? '#ef4444' : '#e2e8f0',
            }}
          />
          {error && <p style={{ color: '#ef4444', fontSize: 13, margin: '6px 0 0' }}>{error}</p>}
          <button
            type="submit"
            disabled={loading || !pw}
            style={{
              marginTop: 14, width: '100%', padding: '12px', borderRadius: 10,
              background: loading || !pw ? '#94a3b8' : '#6366f1',
              color: '#fff', border: 'none', fontWeight: 700, fontSize: 15,
              cursor: loading || !pw ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '확인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}

const CAT_LABEL: Record<string, string> = {
  kids: '유아동', life: '생활', food: '식품',
  health: '건강', beauty: '뷰티',
}


/**
 * 비교가가 새 공구에 계속 안 붙고 있는지 본다.
 *
 * 네이버가 쇼핑 검색 API를 없앤 걸 3주 동안 아무도 몰랐다. 그 사이 수집된 656건이 전부
 * 판정 없이 쌓였다. 조용히 망가지는 게 가장 나쁜 고장이라, 새로 들어온 공구에 비교가가
 * 계속 안 붙으면 화면에 띄운다.
 *
 * 관리자 목록이 이미 전체 게시물을 들고 있으므로 새 API를 만들지 않고 여기서 센다.
 */
function comparePriceStall(posts: Post[]): { days: number; since: string; collected: number } | null {
  const withPrice = posts.filter(p => p.market_price && p.scraped_at)
  if (!withPrice.length) return null
  const last = withPrice.reduce((m, p) => (p.scraped_at! > m ? p.scraped_at! : m), '').slice(0, 10)
  if (!last) return null
  // 그 이후로 새로 들어온 공구가 몇 건인데 하나도 안 붙었는지
  const collected = posts.filter(p => (p.scraped_at || '').slice(0, 10) > last).length
  const days = Math.floor((Date.now() - new Date(last + 'T00:00:00+09:00').getTime()) / 86400000)
  // 하루 이틀 비는 건 정상(수집이 없는 날도 있다). 사흘 넘게 + 새 공구가 쌓였을 때만 알린다
  if (days < 3 || collected < 10) return null
  return { days, since: last, collected }
}

export default function AdminPage() {
  const [authed, setAuthed]           = useState<boolean | null>(null)  // null = 확인 중
  const [posts, setPosts]             = useState<Post[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingPost, setEditingPost]   = useState<Post | null>(null)
  const [loading, setLoading]         = useState(true)
  const [filter, setFilter]           = useState<'all' | 'candidate' | 'needs_review' | 'ready' | 'published' | 'expired' | 'excluded' | 'upcoming' | 'featured'>('all')
  const [searchQ, setSearchQ]         = useState('')
  const [analytics, setAnalytics]     = useState<DayStat[]>([])
  const [topPosts, setTopPosts]       = useState<TopPost[]>([])
  const [topSharedPosts, setTopSharedPosts] = useState<TopPost[]>([])
  const [sources, setSources] = useState<{ source: string; label: string; count: number }[]>([])
  const [influencerSources, setInfluencerSources] = useState<InfluencerSource[]>([])
  const [newSourceUrl, setNewSourceUrl] = useState('')
  const [newSourceName, setNewSourceName] = useState('')
  const [inpockStatus, setInpockStatus] = useState<ScraperStatus | null>(null)
  const [inpockBusy, setInpockBusy]   = useState(false)
  const [instPostUrl, setInstPostUrl] = useState('')
  const [instPostBusy, setInstPostBusy] = useState(false)
  const [instPostMsg, setInstPostMsg] = useState('')
  const [adminTab, setAdminTab] = useState<'posts' | 'influencers' | 'collections' | 'verdict' | 'settings'>('posts')
  const [collections, setCollections] = useState<Collection[]>([])
  const [editingInfluencer, setEditingInfluencer] = useState<string | null>(null)
  const [editInfluencerDraft, setEditInfluencerDraft] = useState<Partial<InfluencerSource>>({})
  const [influencerBusy, setInfluencerBusy] = useState<string | null>(null)

  // 세션 확인 (httpOnly 쿠키는 JS로 읽을 수 없으므로 서버에 확인)
  useEffect(() => {
    // 관리자 페이지를 연 브라우저는 로그인 전이라도 통계에서 뺀다 — 여기까지 들어온 사람은
    // 고객이 아니고, 로그인에 실패하거나 그냥 둘러보다 나가도 고객 화면 방문이 잡히면 안 된다
    localStorage.setItem('gonggu_no_track', '1')
    fetch('/api/auth')
      .then(r => r.json())
      .then(d => setAuthed(!!d.authed))
      .catch(() => setAuthed(false))
  }, [])

  const fetchPosts = useCallback(async () => {
    // admin=1 은 필터 없이 전체 게시물을 대상으로 하므로 per_page를 넉넉하게 잡아야
    // 오래된(스크랩 시각이 이른) 게시물이 목록에서 조용히 잘려나가지 않는다
    const r = await fetch('/api/posts?admin=1&per_page=10000')
    const d = await r.json()
    setPosts(d.posts || [])
    setLoading(false)
  }, [])

  const fetchAnalytics = useCallback(async () => {
    const r = await fetch('/api/analytics')
    if (r.ok) {
      const d = await r.json()
      setAnalytics(d.summary || [])
      setTopPosts(d.topPosts || [])
      setTopSharedPosts(d.topSharedPosts || [])
      setSources(d.sources || [])
    }
  }, [])

  const fetchInfluencerSources = useCallback(async () => {
    const r = await fetch('/api/inpock-sources')
    if (r.ok) { const d = await r.json(); setInfluencerSources(d.sources || []) }
  }, [])

  const fetchInpockStatus = useCallback(async () => {
    const r = await fetch('/api/inpock')
    if (r.ok) setInpockStatus(await r.json())
  }, [])

  const fetchCollections = useCallback(async () => {
    const r = await fetch('/api/collections?admin=1')
    if (r.ok) { const d = await r.json(); setCollections(d.collections || []) }
  }, [])

  async function createCollection(data: Partial<Collection>) {
    const r = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (r.ok) { await fetchCollections(); return true }
    const d = await r.json().catch(() => ({}))
    alert(d.error || '컬렉션 생성 실패')
    return false
  }

  async function updateCollection(id: string, patch: Partial<Collection>) {
    const r = await fetch(`/api/collections/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (r.ok) { await fetchCollections(); return true }
    const d = await r.json().catch(() => ({}))
    alert(d.error || '컬렉션 수정 실패')
    return false
  }

  async function deleteCollection(id: string, title: string) {
    if (!confirm(`'${title}' 컬렉션을 삭제할까요?`)) return
    await fetch(`/api/collections/${id}`, { method: 'DELETE' })
    await fetchCollections()
  }

  async function addInfluencerSource() {
    const url = newSourceUrl.trim()
    if (!url) return
    const r = await fetch('/api/inpock-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, influencer_name: newSourceName.trim() }),
    })
    if (r.ok) { setNewSourceUrl(''); setNewSourceName(''); await fetchInfluencerSources() }
    else { const d = await r.json().catch(() => ({})); alert(d.error || '추가 실패') }
  }

  async function removeInfluencerSource(id: string, name: string) {
    if (!confirm(`'${name}' 인플루언서를 삭제할까요?`)) return
    await fetch(`/api/inpock-sources?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    await fetchInfluencerSources()
  }

  async function startInpock() {
    setInpockBusy(true)
    await fetch('/api/inpock', { method: 'POST' })
    await fetchInpockStatus()
    setTimeout(async () => { await fetchPosts(); await fetchInpockStatus(); setInpockBusy(false) }, 8000)
  }

  async function collectInfluencer(id: string) {
    setInfluencerBusy(id)
    await fetch(`/api/inpock?id=${encodeURIComponent(id)}`, { method: 'POST' })
    setTimeout(async () => {
      await fetchPosts()
      await fetchInfluencerSources()
      setInfluencerBusy(null)
    }, 8000)
  }

  async function saveInfluencerEdit(id: string) {
    await fetch(`/api/inpock-sources?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editInfluencerDraft),
    })
    setEditingInfluencer(null)
    setEditInfluencerDraft({})
    await fetchInfluencerSources()
  }


  async function addInstPost() {
    const url = instPostUrl.trim()
    if (!url) return
    setInstPostBusy(true)
    setInstPostMsg('')
    try {
      const r = await fetch('/api/instagram-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const d = await r.json()
      if (r.ok) {
        const lastLine = (d.output as string || '').split('\n').filter(Boolean).pop()?.trim()
        setInstPostMsg(`${lastLine || '수집 완료 — 검수 대기에 추가됨'}`)
        setInstPostUrl('')
        await fetchPosts()
      } else {
        setInstPostMsg(`❌ ${d.error || '수집 실패'}`)
      }
    } catch {
      setInstPostMsg('❌ 서버 오류')
    } finally {
      setInstPostBusy(false)
    }
  }



  useEffect(() => {
    fetchPosts()
    fetchAnalytics()
    fetchInfluencerSources()
    fetchInpockStatus()
    fetchCollections()
    const iv = setInterval(() => { fetchInpockStatus() }, 5000)
    return () => clearInterval(iv)
  }, [fetchPosts, fetchAnalytics, fetchInfluencerSources, fetchInpockStatus, fetchCollections])

  async function togglePublished(p: Post) {
    const isPublished = p.status === 'published' || (!p.status && p.published !== false)
    // upcoming 공구는 published 필드만 토글 (status는 건드리지 않음)
    const nextPublished = p.status === 'upcoming' ? p.published === false ? true : false : !isPublished
    const nextStatus: Post['status'] = p.status === 'upcoming' ? 'upcoming' : isPublished ? 'ready' : 'published'
    setPosts(prev => prev.map(x => x.id === p.id ? { ...x, published: nextPublished, status: nextStatus } : x))
    await fetch(`/api/posts/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published: nextPublished, status: nextStatus }),
    })
  }

  // 홈 "이번 주 우리가 고른 공구"에 넣고 뺀다. 날짜 규칙과 무관하게 운영자가 직접 고르는
  // 유일한 영역이라, 목록에서 바로 켜고 끌 수 있어야 한다.
  async function toggleFeatured(p: Post) {
    const next = !p.is_featured
    // 켤 때는 기존 추천들 뒤에 붙인다 — 순서를 따로 안 정해도 켠 차례대로 노출된다
    const maxOrder = posts.reduce((m, x) => (x.is_featured && typeof x.featured_order === 'number' ? Math.max(m, x.featured_order) : m), 0)
    const nextOrder = next ? maxOrder + 1 : null
    setPosts(prev => prev.map(x => x.id === p.id ? { ...x, is_featured: next, featured_order: nextOrder } : x))
    await fetch(`/api/posts/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_featured: next, featured_order: nextOrder }),
    })
  }

  async function setFeaturedOrder(p: Post, order: number) {
    setPosts(prev => prev.map(x => x.id === p.id ? { ...x, featured_order: order } : x))
    await fetch(`/api/posts/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ featured_order: order }),
    })
  }

  // 제목만으로는 "6종 선물상자"(한 세트)와 "6종 골라담기"(여러 상품)를 구분 못 한다.
  // 자동 판단을 관리자가 뒤집을 수 있게 명시값을 저장한다.
  async function toggleMultiOption(p: Post) {
    const next = !isMultiOption(p)
    setPosts(prev => prev.map(x => x.id === p.id ? { ...x, is_multi_option: next } : x))
    await fetch(`/api/posts/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_multi_option: next }),
    })
  }

  async function toggleEvergreenDeal(p: Post) {
    const next = !(p.is_evergreen_deal || p.is_always_on)
    const onlyDeadlineMissing =
      p.status === 'needs_review' &&
      (p.review_reason || []).length > 0 &&
      (p.review_reason || []).every(r => r === '마감일 미확인')
    const nextStatus = next && onlyDeadlineMissing ? 'ready' : p.status
    const nextReviewReason = next && onlyDeadlineMissing ? [] : (p.review_reason || [])
    setPosts(prev =>
      prev.map(x =>
        x.id === p.id ? { ...x, is_evergreen_deal: next, is_always_on: next, status: nextStatus, review_reason: nextReviewReason } : x
      )
    )
    await fetch(`/api/posts/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_evergreen_deal: next, is_always_on: next, status: nextStatus, review_reason: nextReviewReason }),
    })
  }

  async function toggleSoldOutOnly(p: Post) {
    const next = !p.sale_until_sold_out
    const onlyDeadlineMissing =
      p.status === 'needs_review' &&
      (p.review_reason || []).length > 0 &&
      (p.review_reason || []).every(r => r === '마감일 미확인')
    const nextStatus = next && onlyDeadlineMissing ? 'ready' : p.status
    const nextReviewReason = next && onlyDeadlineMissing ? [] : (p.review_reason || [])
    setPosts(prev =>
      prev.map(x =>
        x.id === p.id ? { ...x, sale_until_sold_out: next, status: nextStatus, review_reason: nextReviewReason } : x
      )
    )
    await fetch(`/api/posts/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sale_until_sold_out: next, status: nextStatus, review_reason: nextReviewReason }),
    })
  }

  async function quickReview(p: Post, action: 'approve' | 'always_on' | 'exclude', reason?: string) {
    const patch =
      action === 'approve'   ? { status: 'ready' as const, published: false } :
      action === 'always_on' ? { status: 'ready' as const, published: false, is_evergreen_deal: true, is_always_on: true } :
                               { status: 'excluded' as const, published: false, review_reason: reason ? [reason] : [] }
    setPosts(prev => prev.map(x => x.id === p.id ? { ...x, ...patch } : x))
    await fetch(`/api/posts/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
  }

  async function deletePost(id: number) {
    if (!confirm('삭제하시겠습니까?')) return
    await fetch(`/api/posts/${id}`, { method: 'DELETE' })
    setPosts(prev => prev.filter(p => p.id !== id))
  }

  async function addPost(data: Omit<Post, 'id' | 'scraped_at' | 'source'>) {
    const r = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (r.ok) {
      setShowAddModal(false)
      await fetchPosts()
    }
  }

  async function updatePost(data: Omit<Post, 'id' | 'scraped_at' | 'source'>) {
    if (!editingPost) return
    const r = await fetch(`/api/posts/${editingPost.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (r.ok) {
      setEditingPost(null)
      await fetchPosts()
    }
  }

  const effectiveStatus = (p: Post): Post['status'] => {
    if (p.status) return p.status
    // 기존 데이터 호환: status 필드 없는 경우
    if (p.source === 'inpock') return 'candidate'
    return p.published !== false ? 'published' : 'ready'
  }

  // "공개됨"엔 마감 지난 것까지 섞여 있으면 수정할 대상을 찾기 어려우니, 마감 지난 공개
  // 게시물은 "공개됨"과 분리된 별도 "마감됨" 탭으로 뺀다
  const isPublishedLive = (p: Post) => effectiveStatus(p) === 'published' && !isExpired(p)
  const isPublishedExpired = (p: Post) => effectiveStatus(p) === 'published' && isExpired(p)

  const visible = posts.filter(p => {
    const st = effectiveStatus(p)
    const matchFilter =
      filter === 'all'       ? true :
      filter === 'published' ? isPublishedLive(p) :
      filter === 'expired'   ? isPublishedExpired(p) :
      filter === 'featured'  ? !!p.is_featured :
      st === filter
    const q = searchQ.toLowerCase()
    const matchQ = !q || p.title.toLowerCase().includes(q) || p.account.toLowerCase().includes(q)
    return matchFilter && matchQ
  })

  const countBy = (s: Post['status']) => posts.filter(p => effectiveStatus(p) === s).length
  const candidateCount   = countBy('candidate')
  const needsReviewCount = countBy('needs_review')
  const readyCount       = countBy('ready')
  const publishedCount   = posts.filter(isPublishedLive).length
  const expiredCount     = posts.filter(isPublishedExpired).length
  const excludedCount    = countBy('excluded')
  const upcomingCount    = countBy('upcoming')
  const featuredCount    = posts.filter(p => p.is_featured).length

  // 인증 확인 중 (hydration 전)
  if (authed === null) return null
  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'Noto Sans KR', sans-serif" }}>
      {/* 헤더 */}
      <header className="admin-header">
        <div className="admin-header-title">꿀공구 관리자</div>
        <div className="admin-header-right">
          <a href="/" target="_blank" rel="noopener noreferrer" style={{ color: '#a5b4fc', fontSize: 13, textDecoration: 'none' }}>
            고객 페이지 보기 →
          </a>
          <button
            onClick={async () => { await fetch('/api/auth', { method: 'DELETE' }); setAuthed(false) }}
            style={{ background: 'transparent', border: '1px solid #475569', color: '#94a3b8', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}
          >
            로그아웃
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
          >
            ＋ 공구 등록
          </button>
        </div>
      </header>

      <div className="admin-body">

        {/* 통계 카드 */}
        <div className="admin-stats">
          <StatCard label="공개됨"    value={publishedCount}   Icon={CheckCircle2}  color="#22c55e" />
          <StatCard label="공개 가능" value={readyCount}        Icon={CircleDot}     color="#6366f1" />
          <StatCard label="검수 필요" value={needsReviewCount}  Icon={TriangleAlert} color="#f97316" />
          <StatCard label="공구 후보" value={candidateCount}    Icon={FileEdit}      color="#eab308" />
        </div>

        {/* 자동 비교가가 멎으면 알린다 — 조용히 망가지는 걸 막는 유일한 장치 */}
        {(() => {
          const stall = comparePriceStall(posts)
          if (!stall) return null
          return (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20,
              padding: '12px 14px', background: '#FEF2F2', border: '1px solid #FECACA',
              borderRadius: 10,
            }}>
              <TriangleAlert size={18} strokeWidth={2.5} style={{ color: '#DC2626', flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13, lineHeight: 1.6, color: '#7F1D1D' }}>
                <strong>비교가가 {stall.days}일째 안 붙고 있어요.</strong>
                <br />
                마지막으로 붙은 날이 {stall.since}이고, 그 뒤로 들어온 {stall.collected}건에 비교가가 하나도 없어요.
                이 상태로는 새 공구가 계속 판정 없이 쌓입니다.
                {/* 직접 입력한 값도 함께 세므로 "자동 수집"이라 단정하지 않는다 */}
              </div>
            </div>
          )
        })()}

        {/* 방문자 분석 */}
        <AnalyticsSection data={analytics} topPosts={topPosts} topSharedPosts={topSharedPosts} sources={sources} />

        {/* 탭 메뉴 */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #e2e8f0', paddingBottom: 0 }}>
          {([
            { key: 'posts',       label: '공구 관리' },
            { key: 'influencers', label: '인플루언서 관리' },
            { key: 'collections', label: '컬렉션 관리' },
            { key: 'verdict',     label: '채우기' },
            { key: 'settings',    label: '통계 설정' },
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={() => setAdminTab(key)}
              style={{
                padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: 14, color: adminTab === key ? '#6366f1' : '#64748b',
                borderBottom: adminTab === key ? '2px solid #6366f1' : '2px solid transparent',
                marginBottom: -2,
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* 공구 관리 탭 */}
        {adminTab === 'posts' && (
          <>
            {/* 전체 수집 */}
            <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 24, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e293b' }}>🔗 전체 수집</h3>
                <button onClick={startInpock}
                  disabled={inpockBusy || !!inpockStatus?.running || influencerSources.length === 0}
                  style={{
                    background: inpockBusy || inpockStatus?.running || influencerSources.length === 0 ? '#94a3b8' : '#0ea5e9',
                    color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px',
                    cursor: inpockBusy ? 'wait' : influencerSources.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13,
                  }}>
                  {inpockBusy || inpockStatus?.running ? '수집 중...' : '🔄 전체 인플루언서 수집'}
                </button>
              </div>
              {inpockStatus && (
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  {inpockStatus.running ? (
                    <span style={{ color: '#0ea5e9', fontWeight: 600 }}>⏳ 수집 중...</span>
                  ) : inpockStatus.last_run ? (
                    <>마지막: {new Date(inpockStatus.last_run).toLocaleString('ko-KR')}
                      {' · '}신규 <strong>{inpockStatus.last_count}</strong>개
                      {!!inpockStatus.skipped_count && <> · 제외 {inpockStatus.skipped_count}개</>}
                      {inpockStatus.error && <span style={{ color: '#ef4444', marginLeft: 8 }}>❌ {inpockStatus.error}</span>}
                    </>
                  ) : '아직 수집한 적 없음'}
                </div>
              )}
            </div>

            {/* 필터 + 검색 */}
            <div className="admin-filter">
              <div className="admin-filter-chips">
                {([
                  // 탭이 열한 개까지 늘어나 정작 매일 쓰는 게 묻혔다. 두 가지로 줄인다.
                  //  - 판정 대기·종료 링크없음은 '채우기' 탭이 같은 일을 더 잘 한다 → 뺐다
                  //  - 나머지는 개수가 0이면 숨긴다. 안 쓰는 상태가 자리만 차지하지 않고,
                  //    쓰기 시작하면 자동으로 다시 나타난다
                  { key: 'all',          label: '전체',                       color: '#6366f1', count: -1 },
                  { key: 'needs_review', label: `검수 필요 ${needsReviewCount}`, color: '#f97316', count: -1 },
                  { key: 'ready',        label: `공개 가능 ${readyCount}`,       color: '#22c55e', count: readyCount },
                  { key: 'published',    label: `공개됨 ${publishedCount}`,      color: '#0ea5e9', count: publishedCount },
                  { key: 'upcoming',     label: `오픈예정 ${upcomingCount}`,      color: '#7c3aed', count: upcomingCount },
                  { key: 'expired',      label: `마감됨 ${expiredCount}`,        color: '#94a3b8', count: expiredCount },
                  { key: 'featured',     label: `추천 ${featuredCount}`,         color: '#f59e0b', count: featuredCount },
                  { key: 'candidate',    label: `공구 후보 ${candidateCount}`,   color: '#eab308', count: candidateCount },
                  { key: 'excluded',     label: `제외 ${excludedCount}`,         color: '#94a3b8', count: excludedCount },
                ] as const)
                  .filter(t => t.count !== 0 || filter === t.key)
                  .map(({ key, label, color }) => (
                  <button key={key} onClick={() => setFilter(key)} className="admin-chip"
                    style={{
                      background: filter === key ? color : '#e2e8f0',
                      color: filter === key ? '#fff' : '#475569',
                    }}>
                    {label}
                  </button>
                ))}
              </div>
              <input type="text" value={searchQ} onChange={e => setSearchQ(e.target.value)}
                placeholder="제목 / 계정 검색..." className="admin-filter-search" />
              <span style={{ fontSize: 13, color: '#94a3b8', marginLeft: 'auto' }}>{visible.length}개</span>
            </div>

            {/* 공구 목록 */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>불러오는 중...</div>
            ) : visible.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                <div>등록된 공구가 없습니다</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {visible.map(p => <AdminPostRow key={p.id} post={p} onToggle={togglePublished} onDelete={deletePost} onEdit={setEditingPost} onToggleAlwaysOn={toggleEvergreenDeal} onToggleSoldOutOnly={toggleSoldOutOnly} onQuickReview={quickReview} onToggleFeatured={toggleFeatured} onSetFeaturedOrder={setFeaturedOrder} onToggleMultiOption={toggleMultiOption} periodLabel={periodLabel(p)} />)}
              </div>
            )}
          </>
        )}

        {/* 인플루언서 관리 탭 */}
        {adminTab === 'influencers' && (
          <InfluencerManager
            sources={influencerSources}
            inpockStatus={inpockStatus}
            inpockBusy={inpockBusy}
            influencerBusy={influencerBusy}
            editingInfluencer={editingInfluencer}
            editInfluencerDraft={editInfluencerDraft}
            newSourceUrl={newSourceUrl}
            newSourceName={newSourceName}
            onNewUrlChange={setNewSourceUrl}
            onNewNameChange={setNewSourceName}
            onAdd={addInfluencerSource}
            onRemove={removeInfluencerSource}
            onCollectAll={startInpock}
            onCollectOne={collectInfluencer}
            onEditStart={(src) => { setEditingInfluencer(src.id); setEditInfluencerDraft({ influencer_name: src.influencer_name, instagram_handle: src.instagram_handle, category: src.category, collection_status: src.collection_status, memo: src.memo }) }}
            onEditChange={(patch) => setEditInfluencerDraft(prev => ({ ...prev, ...patch }))}
            onEditSave={saveInfluencerEdit}
            onEditCancel={() => { setEditingInfluencer(null); setEditInfluencerDraft({}) }}
            influencerStats={(src) => {
              const sp = posts.filter(p =>
                p.influencer_id === src.id ||
                p.source_url === src.url ||
                (p.influencer_handle && p.influencer_handle === src.handle)
              )
              return {
                total:        sp.length,
                candidate:    sp.filter(p => effectiveStatus(p) === 'candidate').length,
                needs_review: sp.filter(p => effectiveStatus(p) === 'needs_review').length,
                ready:        sp.filter(p => effectiveStatus(p) === 'ready').length,
                published:    sp.filter(p => effectiveStatus(p) === 'published').length,
                excluded:     sp.filter(p => effectiveStatus(p) === 'excluded').length,
              }
            }}
          />
        )}

        {/* 통계 설정 탭 — 관리자 방문이 고객 통계에 섞이지 않게 관리 */}
        {adminTab === 'verdict' && <VerdictFiller posts={posts} onSaved={fetchPosts} />}

        {adminTab === 'settings' && <AdminIpManager />}

        {/* 컬렉션 관리 탭 */}
        {adminTab === 'collections' && (
          <CollectionManager
            collections={collections}
            posts={posts}
            onCreate={createCollection}
            onUpdate={updateCollection}
            onDelete={deleteCollection}
          />
        )}
      </div>

      {(() => {
        const existingGroups = [...new Set(posts.map(p => p.group_key).filter(Boolean) as string[])]
        // 같은 group_key로 묶인 지난 공구들의 가격을 모아둠 — 새 공구 등록/수정 시
        // "이 상품 지난번엔 얼마였지?" 바로 참고할 수 있게. 날짜 최신순으로 정렬
        const groupPriceHistory: Record<string, { id: number; price: number; origPrice: number | null; date: string }[]> = {}
        for (const p of posts) {
          if (!p.group_key || !p.price) continue
          const date = p.start_date || (p.scraped_at || '').slice(0, 10) || ''
          ;(groupPriceHistory[p.group_key] ??= []).push({ id: p.id, price: p.price, origPrice: p.origPrice ?? null, date })
        }
        for (const g in groupPriceHistory) {
          groupPriceHistory[g].sort((a, b) => b.date.localeCompare(a.date))
        }
        return (
          <>
            {showAddModal && <AddPostModal onClose={() => setShowAddModal(false)} onSubmit={addPost} existingGroups={existingGroups} groupPriceHistory={groupPriceHistory} />}
            {editingPost  && <AddPostModal onClose={() => setEditingPost(null)} onSubmit={updatePost} editPost={editingPost ?? undefined} existingGroups={existingGroups} groupPriceHistory={groupPriceHistory} />}
          </>
        )
      })()}
    </div>
  )
}

function StatCard({ label, value, Icon, color }: { label: string; value: number; Icon: LucideIcon; color: string }) {
  return (
    <div className="admin-stat-card">
      <span className="admin-stat-icon" style={{ background: `${color}1a`, color }}>
        <Icon size={18} strokeWidth={2.5} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="admin-stat-num" style={{ color }}>{value}</div>
        <div className="admin-stat-label">{label}</div>
      </div>
    </div>
  )
}

function AnalyticsSection({ data, topPosts, topSharedPosts, sources }: { data: DayStat[]; topPosts: TopPost[]; topSharedPosts: TopPost[]; sources: { source: string; label: string; count: number }[] }) {
  const last7 = data.slice(-7)
  const today = last7[last7.length - 1]
  const total7 = last7.reduce((s, d) => s + d.visitors, 0)
  const total7join = last7.reduce((s, d) => s + (d.events.join || 0), 0)
  const total7bm = last7.reduce((s, d) => s + (d.events.bookmark || 0), 0)
  const total7returning = last7.reduce((s, d) => s + (d.returningVisitors || 0), 0)
  const maxVisitors = Math.max(...last7.map(d => d.visitors), 1)

  function fmtDate(dateStr: string) {
    const [, m, d] = dateStr.split('-')
    return `${parseInt(m)}/${parseInt(d)}`
  }

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 24, border: '1px solid #e2e8f0' }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>방문자 분석</h3>

      {/* 요약 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: 20 }}>
        {[
          { label: '오늘 방문자', value: today?.visitors ?? 0, color: '#6366f1' },
          { label: '7일 방문자', value: total7, color: '#0ea5e9' },
          { label: '7일 재방문자', value: total7returning, color: '#8b5cf6' },
          { label: '7일 공구보기', value: total7join, color: '#22c55e' },
          { label: '7일 찜', value: total7bm, color: '#f43f5e' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* 7일 바 차트 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
        {last7.map((d) => (
          <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
              {d.visitors > 0 ? d.visitors : ''}
            </div>
            <div
              style={{
                width: '100%',
                background: d.date === today?.date ? '#6366f1' : '#c7d2fe',
                borderRadius: '4px 4px 0 0',
                height: `${Math.max((d.visitors / maxVisitors) * 52, d.visitors > 0 ? 4 : 0)}px`,
                minHeight: d.visitors > 0 ? 4 : 0,
                transition: 'height 0.3s',
              }}
            />
            <div style={{ fontSize: 9, color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtDate(d.date)}</div>
          </div>
        ))}
      </div>

      {/* 오늘 이벤트 상세 */}
      {today && Object.keys(today.events).length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[
            { key: 'view', label: '페이지뷰', icon: '👁' },
            { key: 'join', label: '공구보기', icon: '🛒' },
            { key: 'bookmark', label: '찜', icon: '❤️' },
            { key: 'category', label: '카테고리', icon: '' },
            { key: 'search', label: '검색', icon: '' },
            { key: 'share', label: '공유', icon: '📤' },
          ].filter(e => today.events[e.key]).map(e => (
            <div key={e.key} style={{ background: '#f1f5f9', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#475569' }}>
              {e.icon} {e.label} <strong>{today.events[e.key]}</strong>회
            </div>
          ))}
        </div>
      )}

      {/* 어디서 들어왔는지 — 최근 14일.
          인스타·카톡 인앱 브라우저는 리퍼러를 안 보내므로, 공유 링크에 utm_source가 붙어
          있어야 정확히 갈린다. 안 붙은 방문은 "앱 내 브라우저(경로 미상)"으로 모인다. */}
      {sources.length > 0 && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>유입 경로 (최근 14일)</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(() => {
              const total = sources.reduce((sum, s) => sum + s.count, 0) || 1
              return sources.map((s, i) => (
                <div key={s.source} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', background: i === 0 ? '#f0fdf4' : '#f8fafc', borderRadius: 8 }}>
                  <span style={{ fontSize: 12, color: '#0f172a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                  <span style={{ position: 'relative', width: 90, height: 6, background: '#e2e8f0', borderRadius: 3, flexShrink: 0 }}>
                    <span style={{ position: 'absolute', inset: 0, width: `${Math.round((s.count / total) * 100)}%`, background: '#16a34a', borderRadius: 3 }} />
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', flexShrink: 0, minWidth: 62, textAlign: 'right' }}>
                    {s.count}명 · {Math.round((s.count / total) * 100)}%
                  </span>
                </div>
              ))
            })()}
          </div>
        </div>
      )}

      {/* 가장 많이 본 상품 — "공구 보기" 클릭 누적 기준 (전체 기간) */}
      {topPosts.length > 0 && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>가장 많이 본 상품 TOP 5</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {topPosts.slice(0, 5).map((p, i) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', background: i === 0 ? '#fff7ed' : '#f8fafc', borderRadius: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', width: 16, flexShrink: 0 }}>{i + 1}</span>
                {p.img && <img src={p.img} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />}
                <span style={{ fontSize: 12, color: '#0f172a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#f97316', flexShrink: 0 }}>{p.count}회 클릭</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 가장 많이 공유된 상품 — 공유 버튼 클릭 누적 기준 (전체 기간) */}
      {topSharedPosts.length > 0 && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>📤 가장 많이 공유된 상품 TOP 5</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {topSharedPosts.slice(0, 5).map((p, i) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', background: i === 0 ? '#eff6ff' : '#f8fafc', borderRadius: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', width: 16, flexShrink: 0 }}>{i + 1}</span>
                {p.img && <img src={p.img} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />}
                <span style={{ fontSize: 12, color: '#0f172a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0ea5e9', flexShrink: 0 }}>{p.count}회 공유</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// 검수 대기 중 오래전에 수집된 게 섞여 있으면 눈에 안 띄어서 계속 밀리기 쉬우니,
// 수집일을 "M.D · N일 전"으로 보여줘 오래된 것부터 처리하도록 유도한다
function scrapedAgo(scrapedAt?: string): string | null {
  if (!scrapedAt) return null
  const d = new Date(scrapedAt)
  if (Number.isNaN(d.getTime())) return null
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  const dateLabel = `${d.getMonth() + 1}.${d.getDate()}`
  if (days <= 0) return `${dateLabel} · 오늘 수집`
  return `${dateLabel} · ${days}일 전 수집`
}

function AdminPostRow({ post: p, onToggle, onDelete, onEdit, onToggleAlwaysOn, onToggleSoldOutOnly, onQuickReview, onToggleFeatured, onSetFeaturedOrder, onToggleMultiOption, periodLabel }: {
  post: Post
  onToggle: (p: Post) => void
  onDelete: (id: number) => void
  onEdit:   (p: Post) => void
  onToggleAlwaysOn: (p: Post) => void
  onToggleSoldOutOnly: (p: Post) => void
  onQuickReview: (p: Post, action: 'approve' | 'always_on' | 'exclude', reason?: string) => void
  onToggleFeatured: (p: Post) => void
  onSetFeaturedOrder: (p: Post, order: number) => void
  onToggleMultiOption: (p: Post) => void
  periodLabel: string
}) {
  // upcoming 공구는 status가 'upcoming' 그대로 유지된 채 published 필드만으로 공개 여부를 결정한다
  // (togglePublished와 동일한 기준을 써야 버튼 표시가 실제 공개 상태와 어긋나지 않는다)
  const published = p.status === 'upcoming'
    ? p.published !== false
    : p.status === 'published' || (!p.status && p.published !== false)
  const expired   = isExpired(p)
  // 관리자엔 "공개됨"으로 보여도 마감일이 지나면 고객 화면(/api/posts) 필터에서 자동 제외됨 — 상시딜/소진시는 예외
  const hiddenFromCustomers = published && expired
  // 제외 사유를 고르게 해서 나중에 "이거 왜 뺐었지?" 할 때 바로 알 수 있게 함
  const [showExcludeReasons, setShowExcludeReasons] = useState(false)
  function exclude(reason: string) {
    onQuickReview(p, 'exclude', reason)
    setShowExcludeReasons(false)
  }
  // 상시딜/소진시/제외/삭제는 매번 다 보일 필요 없는 부가 액션이라 접어둔다 —
  // 항상 보이는 건 링크/수정/공개토글 정도로만 줄여서 한 줄에 스캔하기 쉽게 함
  const [showMore, setShowMore] = useState(false)
  const [copied, setCopied] = useState(false)

  return (
    <div style={{
      background: published ? '#f0fdf4' : '#fffbeb',
      border: `2px solid ${published ? '#86efac' : '#fcd34d'}`,
      borderLeft: `5px solid ${published ? '#22c55e' : '#f59e0b'}`,
      borderRadius: 12,
      padding: '12px 16px',
    }}>
      <div className="admin-row">
        {/* 썸네일 */}
        <div style={{ width: 52, height: 52, borderRadius: 8, overflow: 'hidden', background: '#f1f5f9', flexShrink: 0 }}>
          {p.img
            ? <img src={p.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#cbd5e1' }}><ImageOff size={20} strokeWidth={1.75} /></div>
          }
        </div>

        {/* 정보 */}
        <div className="admin-row-info" style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{p.title}</span>
            <span style={{ fontSize: 11, background: '#f1f5f9', color: '#64748b', padding: '2px 6px', borderRadius: 10, flexShrink: 0 }}>{CAT_LABEL[p.cat] || p.cat}</span>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>{p.account}</span>
            {(() => {
              const ago = scrapedAgo(p.scraped_at)
              if (!ago) return null
              const days = p.scraped_at ? Math.floor((Date.now() - new Date(p.scraped_at).getTime()) / 86400000) : 0
              const stale = days > 7
              return (
                <span title="이 공구가 수집된 날짜" style={{
                  fontSize: 11, padding: '2px 6px', borderRadius: 10, fontWeight: 600, cursor: 'help',
                  background: stale ? '#fee2e2' : '#f1f5f9', color: stale ? '#dc2626' : '#94a3b8',
                }}>
                  {ago}
                </span>
              )
            })()}
            <span style={{ fontSize: 11, background: published ? '#dcfce7' : '#f1f5f9', color: published ? '#15803d' : '#64748b', padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>
              {published ? '공개 중' : '숨김'}
            </span>
            {/* 고객 화면과 같은 판정을 관리자에서도 보여준다 — 아쉽딜·판정 대기가 어떤
                상품인지 목록에서 바로 알아야 손볼 대상을 고를 수 있다 */}
            <GradeBadge display={getDealVerdict(p).display} size="sm" />
            {p.status === 'candidate'    && <span style={{ fontSize: 11, background: '#fef9c3', color: '#a16207',  padding: '2px 6px', borderRadius: 10, fontWeight: 600 }}>공구 후보</span>}
            {p.status === 'needs_review' && <span style={{ fontSize: 11, background: '#fff7ed', color: '#c2410c',  padding: '2px 6px', borderRadius: 10, fontWeight: 600 }}>검수 필요</span>}
            {p.status === 'ready'        && <span style={{ fontSize: 11, background: '#dcfce7', color: '#15803d',  padding: '2px 6px', borderRadius: 10, fontWeight: 600 }}>공개 가능</span>}
            {p.status === 'excluded'     && <span style={{ fontSize: 11, background: '#f1f5f9', color: '#64748b',  padding: '2px 6px', borderRadius: 10, fontWeight: 600 }}>제외</span>}
            {p.status === 'upcoming'     && <span style={{ fontSize: 11, background: '#ede9fe', color: '#7c3aed',  padding: '2px 6px', borderRadius: 10, fontWeight: 600 }}>오픈 예정</span>}
            {p.source === 'influencer_request' && <span title="인플루언서가 직접 제출한 등록 요청" style={{ fontSize: 11, background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: 10, fontWeight: 600, cursor: 'help' }}>직접 제보</span>}
            {p.review_reason && p.review_reason.length > 0 && p.review_reason.map((r, i) => (
              <span key={i} style={{ fontSize: 10, background: '#fee2e2', color: '#dc2626', padding: '1px 5px', borderRadius: 8 }}>{r}</span>
            ))}
            {p.brand && <span style={{ color: '#6366f1', fontWeight: 600 }}>{p.brand}</span>}
            <span style={{ color: expired ? '#ef4444' : '#6366f1' }}>{periodLabel}</span>
            {hiddenFromCustomers && (
              <span title="마감일이 지나서 상시딜/소진시 마감이 아니면 고객 화면(/) 에는 자동으로 안 보여요"
                style={{ fontSize: 11, background: '#fee2e2', color: '#dc2626', padding: '2px 6px', borderRadius: 10, fontWeight: 700, cursor: 'help' }}>
                마감 지남 · 고객화면엔 숨김
              </span>
            )}
            <span style={{ fontWeight: 600, color: '#0f172a' }}>{p.price?.toLocaleString()}원</span>
            {p.market_price && p.price && p.market_price > p.price && (
              <span title={`네이버 쇼핑 최저가: ${p.market_price.toLocaleString()}원`}
                style={{ fontSize: 11, background: '#fef9c3', color: '#92400e', padding: '2px 6px', borderRadius: 10, fontWeight: 700, cursor: 'help' }}>
                최저가比 {Math.round((1 - p.price / p.market_price) * 100)}%↓
              </span>
            )}
            {p.extraction_debug && (
              <span
                title={JSON.stringify(p.extraction_debug, null, 2)}
                style={{ fontSize: 10, background: '#f0f9ff', color: '#0369a1', padding: '1px 5px', borderRadius: 8, cursor: 'help' }}>
                {(p.extraction_debug as Record<string,unknown>).extraction_method as string || '추출'}
                {(p.extraction_debug as Record<string,unknown>).extraction_error
                  ? ' (오류)'
                  : (p.extraction_debug as Record<string,unknown>).extraction_confidence === 'high' ? ' ✓' : ''}
              </span>
            )}
          </div>
        </div>

        {/* 빠른 검수 버튼 — needs_review / candidate 전용 */}
        {(p.status === 'needs_review' || p.status === 'candidate') && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid #e2e8f0' }}>
            <button onClick={() => onQuickReview(p, 'approve')}
              style={{ flex: 1, padding: '7px 0', background: '#dcfce7', color: '#15803d', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              공구 확정
            </button>
            <button onClick={() => onQuickReview(p, 'always_on')}
              style={{ flex: 1, padding: '7px 0', background: '#fef9c3', color: '#92400e', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              상시판매
            </button>
            <button onClick={() => setShowExcludeReasons(true)}
              style={{ flex: 1, padding: '7px 0', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              제외
            </button>
          </div>
        )}

        {/* 제외 사유 선택 — 나중에 "왜 뺐었지?" 바로 알 수 있게 */}
        {showExcludeReasons && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, paddingTop: 8, borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 12, color: '#64748b', alignSelf: 'center', marginRight: 2 }}>제외 사유:</span>
            {['품절', '너무 비쌈', '공구 마감', '기타'].map(reason => (
              <button key={reason} onClick={() => exclude(reason)}
                style={{ padding: '5px 10px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                {reason}
              </button>
            ))}
            <button onClick={() => setShowExcludeReasons(false)}
              style={{ padding: '5px 10px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>
              취소
            </button>
          </div>
        )}

        {/* 액션 버튼 — 자주 쓰는 것만 항상 보이고, 나머지(상시딜/소진시/제외/삭제)는 "⋯더보기"로 접음.
            상시딜/소진시가 이미 켜져 있으면 접혀 있어도 놓치지 않도록 작은 상태 배지만 표시 */}
        <div className="admin-row-actions" style={{ alignItems: 'center' }}>
          {p.source_url && (
            <a href={p.source_url} target="_blank" rel="noopener noreferrer" title="인포크/링크트리 원본 보기"
              style={{ padding: '6px 10px', background: '#ede9fe', borderRadius: 6, fontSize: 12, color: '#7c3aed', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              원본 →
            </a>
          )}
          {p.purchase_url && (
            <a href={p.purchase_url} target="_blank" rel="noopener noreferrer" title="구매 페이지 보기"
              style={{ padding: '6px 10px', background: '#dcfce7', borderRadius: 6, fontSize: 12, color: '#16a34a', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              구매 →
            </a>
          )}
          {!p.source_url && !p.purchase_url && p.url && (
            <a href={p.url} target="_blank" rel="noopener noreferrer"
              style={{ padding: '6px 10px', background: '#f1f5f9', borderRadius: 6, fontSize: 12, color: '#475569', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              보기 →
            </a>
          )}
          <button onClick={() => onEdit(p)}
            style={{ padding: '6px 12px', background: '#ede9fe', color: '#7c3aed', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
            수정
          </button>
          {/* 버튼 문구는 "지금 상태"가 아니라 "누르면 일어날 일"이어야 한다.
              상태(공개 중 / 숨김)는 위 배지 줄에서 따로 보여준다. */}
          <button onClick={() => onToggle(p)}
            title={published ? '고객 화면에서 숨깁니다' : '고객 화면에 공개합니다'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              background: published ? '#f1f5f9' : '#dcfce7', color: published ? '#475569' : '#16a34a' }}>
            {published
              ? <><EyeOff size={13} strokeWidth={2.5} /> 숨기기</>
              : <><Eye size={13} strokeWidth={2.5} /> 공개하기</>}
          </button>
          {(p.is_evergreen_deal || p.is_always_on) && <span title="상시딜로 설정됨" style={{ display: 'inline-flex', color: '#b45309' }}><Package size={13} strokeWidth={2.5} /></span>}
          {p.sale_until_sold_out && <span title="소진시 마감으로 설정됨" style={{ display: 'inline-flex', color: '#dc2626' }}><Flame size={13} strokeWidth={2.5} /></span>}
          <button onClick={() => setShowMore(v => !v)}
            title="더 많은 작업"
            style={{ padding: '6px 10px', background: showMore ? '#e2e8f0' : '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
            ⋯
          </button>
        </div>

        {showMore && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, paddingTop: 8, borderTop: '1px solid #e2e8f0' }}>
            {/* 인스타에 올릴 링크. utm_source가 붙어 있어야 인스타 유입이 "직접 방문"에
                섞이지 않는다 — 인앱 브라우저는 리퍼러를 안 보내기 때문이다. */}
            <button onClick={() => {
                const url = `https://gonggu.asknuggetdata.com/post/${p.id}?utm_source=instagram&utm_medium=bio`
                navigator.clipboard.writeText(url)
                  .then(() => setCopied(true))
                  .catch(() => {})
                setTimeout(() => setCopied(false), 1600)
              }}
              title="인스타 프로필·스토리에 올릴 링크를 복사합니다 (유입 경로가 인스타로 잡힙니다)"
              style={{ padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                background: copied ? '#dcfce7' : '#f1f5f9', color: copied ? '#16a34a' : '#475569' }}>
              {copied ? '복사됨' : '인스타용 링크 복사'}
            </button>
            {/* 홈 "이번 주 우리가 고른 공구" — 운영자가 직접 고르는 유일한 영역 */}
            <button onClick={() => onToggleFeatured(p)}
              title="켜면 홈 상단 '이번 주 우리가 고른 공구'에 노출됩니다"
              style={{ padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                background: p.is_featured ? '#fef3c7' : '#f1f5f9', color: p.is_featured ? '#b45309' : '#94a3b8' }}>
              {p.is_featured ? '추천 해제' : '추천하기'}
            </button>
            {p.is_featured && (
              <label title="숫자가 작을수록 홈에서 먼저 보입니다"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#b45309' }}>
                순서
                <input
                  type="number" min={1}
                  value={p.featured_order ?? ''}
                  onChange={e => onSetFeaturedOrder(p, parseInt(e.target.value, 10) || 1)}
                  style={{ width: 52, padding: '5px 6px', borderRadius: 6, border: '1px solid #fcd34d', fontSize: 11 }}
                />
              </label>
            )}
            <button onClick={() => onToggleMultiOption(p)}
              title="한 링크에서 여러 상품을 옵션별 가격으로 파는 공구 — 켜면 등급 대신 '여러 상품'으로 표시됩니다"
              style={{ padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                background: isMultiOption(p) ? '#eef2ff' : '#f1f5f9', color: isMultiOption(p) ? '#4338ca' : '#94a3b8' }}>
              {isMultiOption(p) ? '여러 상품 해제' : '여러 상품으로'}
            </button>
            <button onClick={() => onToggleAlwaysOn(p)}
              title="상시딜로 설정하면 마감일 없이도 공개 가능"
              style={{ padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                background: (p.is_evergreen_deal || p.is_always_on) ? '#fef3c7' : '#f1f5f9', color: (p.is_evergreen_deal || p.is_always_on) ? '#92400e' : '#94a3b8' }}>
              {(p.is_evergreen_deal || p.is_always_on) ? '상시딜 해제' : '상시딜로 설정'}
            </button>
            <button onClick={() => onToggleSoldOutOnly(p)}
              title="한정수량으로 재고 소진시 마감되고, 고정된 마감일은 없는 공구"
              style={{ padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                background: p.sale_until_sold_out ? '#fee2e2' : '#f1f5f9', color: p.sale_until_sold_out ? '#b91c1c' : '#94a3b8' }}>
              {p.sale_until_sold_out ? '소진시 해제' : '소진시로 설정'}
            </button>
            {p.status !== 'excluded' && (
              <button onClick={() => setShowExcludeReasons(true)}
                title="이 공구를 제외 처리 (고객 화면에서 숨겨짐)"
                style={{ padding: '6px 10px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                제외
              </button>
            )}
            <button onClick={() => onDelete(p.id)}
              style={{ padding: '6px 10px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              삭제
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const SOURCE_TYPE_COLORS: Record<string, string> = {
  inpock: '#6366f1', linktree: '#22c55e', littly: '#f97316',
  smartstore: '#0ea5e9', instagram: '#ec4899', unknown: '#94a3b8', custom: '#64748b',
}

const CAT_OPTIONS = [
  { value: '', label: '카테고리 없음' },
  { value: 'kids', label: '유아동' },
  { value: 'life', label: '생활' },
  { value: 'food', label: '식품' },
  { value: 'health', label: '건강' },
  { value: 'beauty', label: '뷰티' },
]

interface InfluencerManagerProps {
  sources: InfluencerSource[]
  inpockStatus: ScraperStatus | null
  inpockBusy: boolean
  influencerBusy: string | null
  editingInfluencer: string | null
  editInfluencerDraft: Partial<InfluencerSource>
  newSourceUrl: string
  newSourceName: string
  onNewUrlChange: (v: string) => void
  onNewNameChange: (v: string) => void
  onAdd: () => void
  onRemove: (id: string, name: string) => void
  onCollectAll: () => void
  onCollectOne: (id: string) => void
  onEditStart: (src: InfluencerSource) => void
  onEditChange: (patch: Partial<InfluencerSource>) => void
  onEditSave: (id: string) => void
  onEditCancel: () => void
  influencerStats: (src: InfluencerSource) => { total: number; candidate: number; needs_review: number; ready: number; published: number; excluded: number }
}

function InfluencerManager({
  sources, inpockStatus, inpockBusy, influencerBusy, editingInfluencer, editInfluencerDraft,
  newSourceUrl, newSourceName, onNewUrlChange, onNewNameChange,
  onAdd, onRemove, onCollectAll, onCollectOne, onEditStart, onEditChange, onEditSave, onEditCancel,
  influencerStats,
}: InfluencerManagerProps) {
  const inputStyle: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
  }
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const filteredSources = !q ? sources : sources.filter(s =>
    (s.influencer_name || '').toLowerCase().includes(q) ||
    (s.instagram_handle || '').toLowerCase().includes(q) ||
    (s.handle || '').toLowerCase().includes(q) ||
    (s.url || '').toLowerCase().includes(q)
  )

  return (
    <div>
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 20, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <button onClick={onCollectAll}
          disabled={inpockBusy || !!inpockStatus?.running || sources.length === 0}
          style={{
            background: inpockBusy || inpockStatus?.running || sources.length === 0 ? '#94a3b8' : '#0ea5e9',
            color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px',
            cursor: inpockBusy ? 'wait' : sources.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, flexShrink: 0,
          }}>
          {inpockBusy || inpockStatus?.running ? '수집 중...' : '🔄 전체 수집'}
        </button>
        <div style={{ fontSize: 13, color: '#64748b' }}>
          {inpockStatus?.running ? (
            <span style={{ color: '#0ea5e9', fontWeight: 600 }}>⏳ 수집 중...</span>
          ) : inpockStatus?.last_run ? (
            <>마지막: {new Date(inpockStatus.last_run).toLocaleString('ko-KR')} · 신규 <strong>{inpockStatus.last_count}</strong>개{inpockStatus.error && <span style={{ color: '#ef4444', marginLeft: 8 }}>❌ {inpockStatus.error}</span>}</>
          ) : '아직 수집한 적 없음'}
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 20, border: '1px solid #e2e8f0' }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>＋ 인플루언서 추가</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input type="url" value={newSourceUrl} onChange={e => onNewUrlChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onAdd() }}
            placeholder="링크 URL (예: link.inpock.co.kr/handle, linktr.ee/handle)"
            style={{ ...inputStyle, flex: '2 1 220px', minWidth: 0 }} />
          <input type="text" value={newSourceName} onChange={e => onNewNameChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onAdd() }}
            placeholder="이름 (선택)"
            style={{ ...inputStyle, flex: '1 1 120px', minWidth: 0 }} />
          <button onClick={onAdd}
            style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 14, whiteSpace: 'nowrap' }}>
            추가
          </button>
        </div>
        <p style={{ fontSize: 11, color: '#94a3b8', margin: '8px 0 0' }}>지원: inpock · linktree · littly · 그 외는 수동 검토로 저장</p>
      </div>

      {sources.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="이름 / 인스타 핸들 / URL 검색..."
            style={{ ...inputStyle, maxWidth: 320 }} />
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{filteredSources.length}개</span>
        </div>
      )}

      {sources.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👤</div>
          <div>등록된 인플루언서가 없습니다.</div>
        </div>
      ) : filteredSources.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
          <Search size={38} strokeWidth={1.5} style={{ marginBottom: 12, color: '#cbd5e1' }} />
          <div>검색 결과가 없습니다.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredSources.map(src => {
            const stats = influencerStats(src)
            const isEditing = editingInfluencer === src.id
            const isBusy = influencerBusy === src.id
            const collStatusColor: Record<string, string> = { active: '#22c55e', paused: '#94a3b8', failed: '#ef4444', never_collected: '#e2e8f0' }
            const lcAt = src.last_collected_at ? new Date(src.last_collected_at).toLocaleString('ko-KR') : null

            return (
              <div key={src.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ background: SOURCE_TYPE_COLORS[src.source_type] || '#94a3b8', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 7px', flexShrink: 0 }}>
                    {src.source_type}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>{src.influencer_name}</span>
                  {src.instagram_handle && (
                    <span style={{ fontSize: 12, color: '#64748b' }}>@{src.instagram_handle.replace('@', '')}</span>
                  )}
                  {src.category && (
                    <span style={{ fontSize: 11, background: '#f1f5f9', borderRadius: 6, padding: '2px 8px', color: '#475569' }}>
                      {CAT_OPTIONS.find(c => c.value === src.category)?.label || src.category}
                    </span>
                  )}
                  {src.collection_status && (
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: collStatusColor[src.collection_status] || '#e2e8f0', display: 'inline-block', flexShrink: 0 }} title={src.collection_status} />
                  )}
                  <a href={src.url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                    {src.url}
                  </a>
                  {lcAt && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>마지막: {lcAt}</span>}
                  <div style={{ display: 'flex', gap: 6, marginLeft: lcAt ? 0 : 'auto', flexShrink: 0 }}>
                    <button onClick={() => onCollectOne(src.id)} disabled={isBusy || !!inpockStatus?.running}
                      style={{ background: isBusy || inpockStatus?.running ? '#94a3b8' : '#0ea5e9', color: '#fff', border: 'none', borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: isBusy ? 'wait' : 'pointer' }}>
                      {isBusy ? '수집 중...' : '수집 실행'}
                    </button>
                    <button onClick={() => isEditing ? onEditCancel() : onEditStart(src)}
                      style={{ background: isEditing ? '#e2e8f0' : '#f1f5f9', color: '#475569', border: 'none', borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {isEditing ? '취소' : '수정'}
                    </button>
                    <button onClick={() => onRemove(src.id, src.influencer_name)}
                      style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      삭제
                    </button>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #f1f5f9', padding: '8px 16px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {[
                    { label: '전체 후보', value: stats.total,        color: '#64748b' },
                    { label: '검수 필요', value: stats.needs_review,  color: '#f97316' },
                    { label: '공개 가능', value: stats.ready,         color: '#22c55e' },
                    { label: '공개됨',    value: stats.published,     color: '#0ea5e9' },
                    { label: '제외',      value: stats.excluded,      color: '#94a3b8' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                      <span style={{ fontWeight: 700, color }}>{value}</span>
                      <span style={{ color: '#94a3b8' }}>{label}</span>
                    </div>
                  ))}
                  {src.memo && (
                    <span style={{ fontSize: 11, color: '#64748b', marginLeft: 'auto', fontStyle: 'italic' }}>{src.memo}</span>
                  )}
                </div>

                {isEditing && (
                  <div style={{ borderTop: '1px solid #e2e8f0', padding: 16, background: '#f8fafc' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>이름</label>
                        <input value={editInfluencerDraft.influencer_name ?? src.influencer_name}
                          onChange={e => onEditChange({ influencer_name: e.target.value })}
                          style={inputStyle} />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>인스타 핸들</label>
                        <input value={editInfluencerDraft.instagram_handle ?? src.instagram_handle ?? ''}
                          onChange={e => onEditChange({ instagram_handle: e.target.value })}
                          placeholder="@username"
                          style={inputStyle} />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>카테고리</label>
                        <select value={editInfluencerDraft.category ?? src.category ?? ''}
                          onChange={e => onEditChange({ category: e.target.value })}
                          style={{ ...inputStyle }}>
                          {CAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>수집 상태</label>
                        <select value={editInfluencerDraft.collection_status ?? src.collection_status ?? 'never_collected'}
                          onChange={e => onEditChange({ collection_status: e.target.value as InfluencerSource['collection_status'] })}
                          style={{ ...inputStyle }}>
                          <option value="active">active (활성)</option>
                          <option value="paused">paused (일시중지)</option>
                          <option value="failed">failed (오류)</option>
                          <option value="never_collected">never_collected (미수집)</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>메모</label>
                      <textarea value={editInfluencerDraft.memo ?? src.memo ?? ''}
                        onChange={e => onEditChange({ memo: e.target.value })}
                        rows={2}
                        placeholder="메모 (내부용)"
                        style={{ ...inputStyle, resize: 'vertical' }} />
                    </div>
                    <button onClick={() => onEditSave(src.id)}
                      style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                      저장
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// 컬렉션 소개는 홈 롤링 영역과 상세 상단에 함께 나온다 — 비워두면 홈이 허전해서 기본값을 넣는다
const DEFAULT_COLLECTION_DESC = '꿀공구가 추천하는 꿀템'

const COLLECTION_COLORS = ['#F0A500', '#6366f1', '#0ea5e9', '#22c55e', '#f97316', '#a855f7', '#eab308', '#14b8a6']

const emptyCollectionForm = {
  title: '', description: DEFAULT_COLLECTION_DESC, emoji: '', color: COLLECTION_COLORS[0], expiresAt: '', productIds: [] as number[],
}

function CollectionManager({
  collections, posts, onCreate, onUpdate, onDelete,
}: {
  collections: Collection[]
  posts: Post[]
  onCreate: (data: Partial<Collection>) => Promise<boolean>
  onUpdate: (id: string, patch: Partial<Collection>) => Promise<boolean>
  onDelete: (id: string, title: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyCollectionForm)
  const [productSearch, setProductSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  function startCreate() {
    setEditingId(null)
    setForm(emptyCollectionForm)
    setProductSearch('')
    setShowForm(true)
  }

  function startEdit(c: Collection) {
    setEditingId(c.id)
    setForm({
      title: c.title, description: c.description, emoji: c.emoji, color: c.color,
      expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : '', productIds: [...c.productIds],
    })
    setProductSearch('')
    setShowForm(true)
  }

  async function submit() {
    if (!form.title.trim()) { alert('제목을 입력하세요'); return }
    setSaving(true)
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      emoji: form.emoji.trim() || '🛍️',
      color: form.color,
      expiresAt: form.expiresAt || null,
      productIds: form.productIds,
    }
    const ok = editingId ? await onUpdate(editingId, payload) : await onCreate(payload)
    setSaving(false)
    if (ok) { setShowForm(false); setEditingId(null) }
  }

  const q = productSearch.trim().toLowerCase()
  // 가격이 0원인 게시물은 실제 판매 상품이 아니라 공지·이벤트성 게시물인 경우가 대부분이라
  // 컬렉션에 담을 대상에서 제외한다 (이미 담겨 있던 항목은 계속 칩으로 보이고 뺄 수 있음)
  const pickableProducts = posts.filter(p => p.price > 0)
  const pickerList = (q ? pickableProducts.filter(p => p.title.toLowerCase().includes(q)) : pickableProducts).slice(0, 50)

  function toggleProduct(id: number) {
    setForm(prev => ({
      ...prev,
      productIds: prev.productIds.includes(id)
        ? prev.productIds.filter(x => x !== id)
        : [...prev.productIds, id],
    }))
  }
  function removeProduct(id: number) {
    setForm(prev => ({ ...prev, productIds: prev.productIds.filter(x => x !== id) }))
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>홈 화면 &quot;지금 뜨는 컬렉션&quot; 섹션에 노출되는 컬렉션을 관리해요. 상품이 1개 이상 담긴 컬렉션만 고객 화면에 보여요.</p>
        <button onClick={startCreate}
          style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0, marginLeft: 12 }}>
          ＋ 컬렉션 추가
        </button>
      </div>

      {showForm && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 20, border: '1.5px solid #6366f1' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
            {editingId ? '컬렉션 수정' : '새 컬렉션'}
          </h3>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 70 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>이모지</label>
              <input value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))}
                style={{ ...inputStyle, fontSize: 20, textAlign: 'center' }} maxLength={4} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>제목</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="예: 여름 휴가 준비물" style={inputStyle} />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>설명</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2} placeholder="홈 롤링 영역과 컬렉션 상세 상단에 함께 표시되는 소개 문구" style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>색상</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {COLLECTION_COLORS.map(c => (
                  <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                    style={{
                      width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer',
                      border: form.color === c ? '2.5px solid #1e293b' : '2px solid transparent',
                    }} />
                ))}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>마감일 (선택)</label>
              <input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} style={inputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
              담긴 상품 ({form.productIds.length}개)
            </label>
            {form.productIds.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {form.productIds.map(id => {
                  const p = posts.find(x => x.id === id)
                  return (
                    <span key={id} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, background: '#eef2ff', color: '#4338ca',
                      borderRadius: 8, padding: '4px 8px 4px 10px', fontSize: 12, fontWeight: 600,
                    }}>
                      {p ? p.title.slice(0, 24) : `#${id}`}
                      <button onClick={() => removeProduct(id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4338ca', fontWeight: 800, padding: 0 }}>✕</button>
                    </span>
                  )
                })}
              </div>
            )}
            <input value={productSearch} onChange={e => setProductSearch(e.target.value)}
              placeholder="목록에서 검색으로 좁혀보기 (비워두면 전체 목록)" style={inputStyle} />
            <div style={{ marginTop: 6, border: '1px solid #e2e8f0', borderRadius: 8, maxHeight: 260, overflowY: 'auto' }}>
              {pickerList.length === 0 ? (
                <p style={{ padding: '12px 10px', fontSize: 12, color: '#94a3b8', margin: 0 }}>일치하는 상품이 없어요</p>
              ) : (
                pickerList.map(p => {
                  const checked = form.productIds.includes(p.id)
                  return (
                    <button key={p.id} onClick={() => toggleProduct(p.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                        padding: '8px 10px', background: checked ? '#eef2ff' : '#fff',
                        border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: 13,
                        color: checked ? '#4338ca' : '#1e293b', fontWeight: checked ? 700 : 400,
                      }}>
                      <span style={{
                        flexShrink: 0, width: 16, height: 16, borderRadius: 4,
                        border: checked ? 'none' : '1.5px solid #cbd5e1',
                        background: checked ? '#6366f1' : 'transparent',
                        color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {checked && '✓'}
                      </span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.title.slice(0, 40)} · {p.price.toLocaleString()}원
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={submit} disabled={saving}
              style={{ background: saving ? '#94a3b8' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontWeight: 700, fontSize: 13, cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? '저장 중...' : editingId ? '수정 저장' : '컬렉션 만들기'}
            </button>
            <button onClick={() => { setShowForm(false); setEditingId(null) }}
              style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, padding: '9px 20px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              취소
            </button>
          </div>
        </div>
      )}

      {collections.length === 0 ? (
        <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>아직 만든 컬렉션이 없어요</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {collections.map(c => (
            <div key={c.id} className="admin-row" style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0' }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                background: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
              }}>
                {c.emoji}
              </div>
              <div className="admin-row-info">
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{c.title}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  상품 {c.productIds.length}개 · id: {c.id}
                  {c.expiresAt && ` · ~${c.expiresAt.slice(0, 10)} 마감`}
                  {c.productIds.length === 0 && <span style={{ color: '#f97316', fontWeight: 600 }}> · 상품 없음(고객 화면 비노출)</span>}
                </div>
              </div>
              <div className="admin-row-actions">
                <a href={`/collection/${c.id}`} target="_blank" rel="noreferrer"
                  style={{ fontSize: 12, fontWeight: 600, color: '#0ea5e9', textDecoration: 'none', padding: '6px 10px' }}>
                  보기
                </a>
                <button onClick={() => startEdit(c)}
                  style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, padding: '6px 12px', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                  수정
                </button>
                <button onClick={() => onDelete(c.id, c.title)}
                  style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '6px 12px', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// 관리자 IP 관리 — 운영자 방문을 통계에서 빼는 세 겹 중 가장 넓게 걸리는 장치라,
// 무엇이 걸려 있는지 눈으로 보고 직접 뺄 수 있어야 한다.
function AdminIpManager() {
  const [data, setData] = useState<{ ips: { ip: string; lastSeen: string; hits: number }[]; ttlDays: number; currentIp: string | null } | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin-ips')
      setData(await r.json())
    } catch { setData(null) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function remove(ip: string) {
    if (!confirm(`${ip} 를 관리자 IP에서 뺄까요?\n이 회선의 방문이 다시 고객 통계에 잡히게 됩니다.`)) return
    await fetch('/api/admin-ips', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip }),
    })
    load()
  }

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0' }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>관리자 방문 제외</h2>
      <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7, marginBottom: 18 }}>
        운영자 본인의 방문이 고객 통계에 섞이지 않도록 세 가지로 막고 있어요.
        <br />① 로그인 중인 브라우저 ② 한 번이라도 로그인한 브라우저(1년) ③ 최근 로그인에 쓰인 IP({data?.ttlDays ?? 14}일)
        <br />관리자 페이지를 열기만 해도 그 브라우저는 통계에서 빠집니다.
      </p>

      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: '#92400e', lineHeight: 1.6, marginBottom: 16 }}>
        IP 제외는 회선 전체에 걸려요. 카페·회사처럼 여러 사람이 쓰는 곳에서 로그인했다면
        그 회선의 실제 고객 방문까지 통계에서 빠지니, 아래 목록에서 빼주세요.
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: '#94a3b8' }}>불러오는 중…</p>
      ) : !data || data.ips.length === 0 ? (
        <p style={{ fontSize: 13, color: '#94a3b8' }}>등록된 관리자 IP가 없어요</p>
      ) : (
        <div className="admin-scroll-x"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 420 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ textAlign: 'left', padding: '8px 0', color: '#64748b', fontWeight: 700 }}>IP</th>
              <th style={{ textAlign: 'left', padding: '8px 0', color: '#64748b', fontWeight: 700 }}>마지막 로그인</th>
              <th style={{ textAlign: 'right', padding: '8px 0', color: '#64748b', fontWeight: 700 }}>로그인 수</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.ips.map(r => (
              <tr key={r.ip} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '9px 0', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {r.ip}
                  {r.ip === data.currentIp && (
                    <span style={{ marginLeft: 6, fontSize: 11, background: '#dbeafe', color: '#1d4ed8', padding: '1px 6px', borderRadius: 8 }}>지금 접속 중</span>
                  )}
                </td>
                <td style={{ padding: '9px 0', color: '#64748b' }}>{r.lastSeen.slice(0, 16).replace('T', ' ')}</td>
                <td style={{ padding: '9px 0', textAlign: 'right', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{r.hits}</td>
                <td style={{ padding: '9px 0', textAlign: 'right' }}>
                  <button onClick={() => remove(r.ip)}
                    style={{ padding: '4px 10px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    제외 해제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  )
}

// 판정 채우기 — 비교 가격이 없어 등급을 못 매기는 상품을 한 화면에서 연달아 채운다.
// 상품마다 수정 모달을 열면 한 건당 클릭이 대여섯 번인데, 여기서는 두 칸만 치고 저장이다.
// 판정 대기가 많으면 "공구가 진짜 싼지 알려주는 곳"이라는 약속이 깨지므로 이 작업이 제일 급하다.
// 채우기 — 손이 가야 하는 상품을 한 화면에서 연달아 처리한다.
// 상품마다 수정 모달을 열면 한 건에 8~10 클릭이라 100건 넘는 작업은 현실적으로 못 한다.
//
// 두 가지 대상이 같은 필드(purchase_links)를 채우므로 화면을 나누지 않고 여기서 전환한다.
//   판정 대기     — 비교 가격이 없어 등급을 못 매기는 공구. 가격이 필요하다.
//   종료·링크없음 — 마감됐는데 지금 살 곳을 못 알려주는 공구. 링크가 필요하다.
function VerdictFiller({ posts, onSaved }: { posts: Post[]; onSaved: () => void }) {
  const [mode, setMode] = useState<CompareState | 'ended'>('unchecked')
  // 목록은 전체 2,300건 기준이라 그대로 펼치면 화면이 못 버티고, 고객에게 안 보이는 공구는
  // 채워도 지금 효과가 없다. 기본은 보이는 것만 — 대신 몇 건을 뺐는지 항상 적는다
  const [visibleOnly, setVisibleOnly] = useState(true)

  const groups = useMemo(() => {
    const g: Record<CompareState, Post[]> = { unchecked: [], compared: [], incomparable: [] }
    for (const p of posts) g[getCompareState(p)].push(p)
    const byImpact = (a: Post, b: Post) => {
      const av = isCustomerVisible(a) ? 0 : 1
      const bv = isCustomerVisible(b) ? 0 : 1
      if (av !== bv) return av - bv
      return (b.scraped_at || '').localeCompare(a.scraped_at || '')
    }
    for (const k of Object.keys(g) as CompareState[]) g[k].sort(byImpact)
    return g
  }, [posts])

  // 마감된 공구는 검색 유입이 계속 들어오는데 보낼 곳이 없으면 그대로 이탈한다
  const ended = posts
    .filter(p => isPagePublic(p) && isExpired(p) && !hasPurchaseLink(p))
    .sort((a, b) => (b.deadline || '').localeCompare(a.deadline || ''))

  const full = mode === 'ended' ? ended : groups[mode]
  const list = visibleOnly && mode !== 'ended' ? full.filter(isCustomerVisible) : full
  const hidden = full.length - list.length

  const tabs: { key: CompareState | 'ended'; label: string; color: string }[] = [
    { key: 'unchecked',    label: `${COMPARE_STATE_LABEL.unchecked} ${groups.unchecked.length}`,       color: '#475569' },
    { key: 'incomparable', label: `${COMPARE_STATE_LABEL.incomparable} ${groups.incomparable.length}`, color: '#78716c' },
    { key: 'compared',     label: `${COMPARE_STATE_LABEL.compared} ${groups.compared.length}`,         color: '#15803d' },
    { key: 'ended',        label: `종료·링크없음 ${ended.length}`,                                       color: '#dc2626' },
  ]

  const blurb: Record<CompareState | 'ended', React.ReactNode> = {
    unchecked: <>아직 아무도 비교가를 안 본 공구예요. 후보가 있으면 골라서 저장하고, 찾아봐도 비교할 상품이 없으면 <strong>비교불가</strong>로 남겨주세요 — 그래야 이 목록에서 빠집니다.</>,
    incomparable: <>찾아본 끝에 비교할 동일상품이 없다고 표시해 둔 공구예요. 나중에 팔기 시작했다면 <strong>다시 확인하기</strong>로 되돌릴 수 있어요.</>,
    compared: <>비교가가 붙어 판정이 나가고 있는 공구예요. 값이 이상하면 여기서 고칠 수 있어요.</>,
    ended: <>마감됐는데 &quot;지금 살 수 있는 곳&quot;을 못 알려주는 공구예요. 검색으로 계속 들어오는데 보낼 곳이 없으면 그대로 나갑니다.<br />링크만 넣어도 됩니다 — 가격을 모르면 &quot;가격 확인하기&quot;로 보내요.</>,
  }

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0' }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 12 }}>채우기</h2>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setMode(t.key)}
            style={{ padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
              background: mode === t.key ? t.color : '#e2e8f0', color: mode === t.key ? '#fff' : '#475569' }}>
            {t.label}
          </button>
        ))}
      </div>

      <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7, marginBottom: 12 }}>{blurb[mode]}</p>

      {mode !== 'ended' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#475569', marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={visibleOnly} onChange={e => setVisibleOnly(e.target.checked)} />
          고객 화면에 보이는 것만
          {visibleOnly && hidden > 0 && <span style={{ color: '#94a3b8' }}>— 안 보이는 {hidden.toLocaleString()}건은 뺐어요</span>}
        </label>
      )}

      {list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <CheckCircle2 size={32} strokeWidth={1.75} style={{ color: '#22c55e', marginBottom: 8 }} />
          <p style={{ fontSize: 14, fontWeight: 700 }}>여기 처리할 공구가 없어요</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(p => mode === 'ended'
            ? <EndedFillRow key={p.id} post={p} onSaved={onSaved} />
            : <CompareFillRow key={p.id} post={p} allPosts={posts} onSaved={onSaved} />)}
        </div>
      )}
    </div>
  )
}

const fillInput: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0',
  outline: 'none', width: '100%', boxSizing: 'border-box',
}

// 목적이 다른 두 가지를 한 필드에 담으면 안 된다.
//
//   판정용 비교가  → origPrice(정가) · market_price(네이버 최저가) · market_url(근거 링크)
//                   가격만 보여주고 제휴 고지 문구는 붙지 않는다.
//   대체 구매 링크 → purchase_links (쿠팡·네이버 파트너스 등 제휴 링크 전용)
//                   고객 화면에 버튼으로 뜨고 제휴 고지 문구가 반드시 함께 붙는다.
//
// 처음엔 채우기에서 비교가도 purchase_links에 넣었는데, 그러면 제휴가 아닌 네이버쇼핑
// 링크에 "네이버 파트너스 활동의 일환으로 수수료를 받습니다"가 붙어 허위 고지가 된다.

/** 검색어 한 줄 — 눌러서 복사. 파트너스는 검색어를 직접 입력해야 한다. */
function SearchQueryBar({ post }: { post: Post }) {
  const [copied, setCopied] = useState(false)
  const q = partnerSearchQuery(post)
  return (
    <button type="button"
      onClick={() => { navigator.clipboard?.writeText(q).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1400) }}
      title="검색어를 복사합니다 — 검색창에 붙여넣으세요"
      style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', marginBottom: 8,
        padding: '7px 10px', borderRadius: 8, border: '1px dashed #cbd5e1', background: copied ? '#dcfce7' : '#f8fafc',
        cursor: 'pointer', fontSize: 12.5, color: '#475569' }}>
      <Copy size={13} strokeWidth={2.5} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{q}</span>
      <span style={{ flexShrink: 0, color: copied ? '#15803d' : '#94a3b8', fontWeight: 700 }}>{copied ? '복사됨' : '복사'}</span>
    </button>
  )
}

function FillRowHead({ post, mode, badge }: { post: Post; mode: 'pending' | 'ended'; badge?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
      <div style={{ width: 44, height: 44, borderRadius: 8, background: '#f1f5f9', flexShrink: 0, overflow: 'hidden' }}>
        {post.img
          ? <img src={post.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#cbd5e1' }}><ImageOff size={18} /></div>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{mode === 'ended' ? '당시 공구가' : '공구가'} <strong style={{ color: '#0f172a' }}>{post.price?.toLocaleString()}원</strong></span>
          {mode === 'ended' && post.deadline && <span style={{ color: '#dc2626' }}>{fmtDate(post.deadline)} 마감</span>}
          {mode === 'pending'
            ? <a href={`https://search.shopping.naver.com/search/all?query=${encodeURIComponent(partnerSearchQuery(post))}`}
                target="_blank" rel="noreferrer" style={{ color: '#16a34a', fontWeight: 600 }}>네이버쇼핑에서 최저가 찾기 →</a>
            : <a href="https://partners.coupang.com/#/product/search" target="_blank" rel="noreferrer"
                onClick={() => navigator.clipboard?.writeText(partnerSearchQuery(post)).catch(() => {})}
                style={{ color: '#dc2626', fontWeight: 600 }}>쿠팡 파트너스에서 링크 만들기 →</a>}
        </div>
      </div>
      {badge}
    </div>
  )
}

function SaveButton({ canSave, saving, done, onClick }: { canSave: boolean; saving: boolean; done: boolean; onClick: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
      <button onClick={onClick} disabled={!canSave || saving}
        style={{ padding: '7px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
          cursor: canSave && !saving ? 'pointer' : 'not-allowed',
          background: done ? '#dcfce7' : canSave ? '#6366f1' : '#e2e8f0',
          color: done ? '#15803d' : canSave ? '#fff' : '#94a3b8' }}>
        {saving ? '저장 중…' : done ? '저장됨' : '저장'}
      </button>
    </div>
  )
}

/** 판정 대기 — 비교 가격만 채운다. 제휴 링크가 아니므로 고객 화면에 버튼으로 뜨지 않는다. */
/**
 * 비교가 채우기 한 행.
 *
 * 후보를 먼저 내밀고 고르게 한다 — 관리자가 매번 맨손으로 검색하는 대신, 우리가 이미 아는
 * 값(수집해 둔 네이버 최저가, 같은 상품으로 보이는 다른 공구)을 보여주고 "이게 맞다"만
 * 고르면 비교가로 저장된다. 후보 탐색은 lib/compareCandidates.ts가 하고, 나중에 API나
 * 검색 서비스가 붙어도 이 화면은 그대로다.
 *
 * 세 상태(미확인·비교가 있음·비교불가)를 한 컴포넌트가 다룬다. 같은 공구가 상태만 오가는
 * 것이라 화면을 나누면 같은 입력칸을 세 벌 갖게 된다.
 */
function CompareFillRow({ post, allPosts, onSaved }: { post: Post; allPosts: Post[]; onSaved: () => void }) {
  const state = getCompareState(post)
  const [orig, setOrig]           = useState(String(post.origPrice ?? ''))
  const [market, setMarket]       = useState(String(post.market_price ?? ''))
  const [marketUrl, setMarketUrl] = useState(post.market_url ?? '')
  const [cands, setCands]         = useState<CompareCandidate[] | null>(null)
  const [picked, setPicked]       = useState<number | null>(null)
  const [askNone, setAskNone]     = useState(false)
  const [reason, setReason]       = useState<CompareNoneReason>(post.compare_none_reason ?? 'not_found')
  const [note, setNote]           = useState(post.compare_none_note ?? '')
  const [saving, setSaving]       = useState(false)
  const [done, setDone]           = useState(false)

  useEffect(() => {
    let alive = true
    findCompareCandidates({ post, allPosts }).then(c => { if (alive) setCands(c) })
    return () => { alive = false }
  }, [post, allPosts])

  // 저장하고 목록에서 다시 찾아 확인하는 왕복을 없애기 위해 입력하는 동안 등급을 보여준다
  const preview = (() => {
    if (!post.price) return null
    const o = parseInt(orig) || 0, m = parseInt(market) || 0
    if (!o && !m) return null
    return getDealVerdict({ ...post, origPrice: o || null, market_price: m || null } as Post).display
  })()

  async function patch(body: Record<string, unknown>) {
    setSaving(true)
    await fetch(`/api/posts/${post.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    setSaving(false); setDone(true); onSaved()
  }

  const canSave = parseInt(orig) > 0 || parseInt(market) > 0
  // 값이 실제로 붙었으면 "비교할 게 없다"는 더 이상 사실이 아니므로 표시를 함께 지운다
  const savePrice = () => patch({
    origPrice: parseInt(orig) || null,
    market_price: parseInt(market) || null,
    market_url: marketUrl.trim() || null,
    ...CLEAR_COMPARE_NONE,
  })
  const saveNone = () => patch({
    compare_none_at: new Date().toISOString(),
    compare_none_reason: reason,
    compare_none_note: reason === 'other' ? (note.trim() || null) : null,
  })

  function pick(i: number) {
    const c = cands?.[i]
    if (!c) return
    setPicked(i)
    setMarket(String(c.price))
    if (c.url) setMarketUrl(c.url)
    setDone(false)
  }

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: done ? '#f0fdf4' : '#fff' }}>
      <FillRowHead post={post} mode="pending" badge={preview ? <GradeBadge display={preview} size="sm" /> : undefined} />

      {isMultiOption(post) && (
        <p style={{ fontSize: 11.5, color: '#78716c', margin: '0 0 8px' }}>
          여러 상품을 파는 공구라 가격 하나로는 판정이 안 붙어요 — 비교불가로 남기면 됩니다.
        </p>
      )}

      {state === 'incomparable' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10,
          padding: '7px 10px', borderRadius: 8, background: '#f5f5f4', fontSize: 12.5, color: '#57534e' }}>
          <strong style={{ fontWeight: 700 }}>비교불가</strong>
          <span>{COMPARE_NONE_REASON_LABEL[post.compare_none_reason ?? 'other']}</span>
          {post.compare_none_note && <span style={{ color: '#78716c' }}>· {post.compare_none_note}</span>}
          {post.compare_none_at && <span style={{ color: '#a8a29e' }}>{fmtDate(post.compare_none_at)} 확인</span>}
          <button onClick={() => patch({ ...CLEAR_COMPARE_NONE })} disabled={saving}
            style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, border: '1px solid #d6d3d1',
              background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#57534e' }}>
            다시 확인하기
          </button>
        </div>
      )}

      <SearchQueryBar post={post} />

      {/* 후보 — 지금은 우리 안에 있는 값만 낸다. 외부 탐색이 붙을 자리다 */}
      <div style={{ border: '1px solid #eef2f7', borderRadius: 8, padding: 10, marginBottom: 8, background: '#fbfdff' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 7 }}>동일상품 후보</div>
        {cands === null ? (
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>찾는 중…</p>
        ) : cands.length === 0 ? (
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0, lineHeight: 1.6 }}>
            자동으로 찾을 수 있는 후보가 없어요. 위 검색어를 복사해 직접 찾아 아래에 넣거나, 비교할 상품이 없으면 비교불가로 남겨주세요.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cands.map((c, i) => (
              <label key={`${c.providerId}-${c.price}`}
                style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer',
                  padding: '6px 8px', borderRadius: 7, background: picked === i ? '#eef2ff' : 'transparent' }}>
                <input type="radio" name={`cand-${post.id}`} checked={picked === i} onChange={() => pick(i)} style={{ marginTop: 3 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>{c.price.toLocaleString()}원</span>
                  <span style={{ fontSize: 12, color: '#64748b' }}> · {c.label}</span>
                  {c.note && <span style={{ display: 'block', fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>{c.note}</span>}
                </span>
                {c.url && (
                  <a href={c.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                    style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 600, color: '#6366f1' }}>열기</a>
                )}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="admin-2col" style={{ gap: 8 }}>
        <input type="number" value={orig} onChange={e => { setOrig(e.target.value); setDone(false) }}
          placeholder="정가 (공구 게시물에 적힌 값)" style={{ ...fillInput, fontSize: 13 }} />
        <input type="number" value={market} onChange={e => { setMarket(e.target.value); setPicked(null); setDone(false) }}
          placeholder="네이버 최저가" style={{ ...fillInput, fontSize: 13 }} />
      </div>
      <input type="url" value={marketUrl} onChange={e => setMarketUrl(e.target.value)}
        placeholder="네이버쇼핑 링크 (선택 — 근거로 보여줄 때만)" style={{ ...fillInput, fontSize: 12, marginTop: 6 }} />
      <p style={{ fontSize: 11, color: '#94a3b8', margin: '6px 0 0' }}>
        비교용 값이라 고객 화면에 구매 버튼으로는 안 뜨고, 제휴 고지 문구도 붙지 않아요.
      </p>

      {askNone ? (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: '#fafaf9', border: '1px solid #e7e5e4' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#44403c', marginBottom: 7 }}>왜 비교할 수 없나요?</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {(Object.keys(COMPARE_NONE_REASON_LABEL) as CompareNoneReason[]).map(r => (
              <label key={r} style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 12.5, color: '#57534e', cursor: 'pointer' }}>
                <input type="radio" name={`none-${post.id}`} checked={reason === r} onChange={() => setReason(r)} />
                {COMPARE_NONE_REASON_LABEL[r]}
              </label>
            ))}
          </div>
          {reason === 'other' && (
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="한 줄로 적어주세요"
              style={{ ...fillInput, fontSize: 12.5, marginTop: 7 }} />
          )}
          <p style={{ fontSize: 11, color: '#a8a29e', margin: '8px 0 0' }}>
            고객 화면은 지금과 똑같이 보여요. 이 표시는 관리자 목록에서만 씁니다.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
            <button onClick={() => setAskNone(false)}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #d6d3d1', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#57534e' }}>
              취소
            </button>
            <button onClick={() => { setAskNone(false); saveNone() }} disabled={saving}
              style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#78716c', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              비교불가로 저장
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 8 }}>
          {state === 'incomparable' ? <span /> : (
            <button onClick={() => setAskNone(true)}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #d6d3d1', background: '#fff',
                cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#57534e' }}>
              비교할 동일상품이 없다
            </button>
          )}
          <button onClick={savePrice} disabled={!canSave || saving}
            style={{ padding: '7px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
              cursor: canSave && !saving ? 'pointer' : 'not-allowed',
              background: done ? '#dcfce7' : canSave ? '#6366f1' : '#e2e8f0',
              color: done ? '#15803d' : canSave ? '#fff' : '#94a3b8' }}>
            {saving ? '저장 중…' : done ? '저장됨' : picked !== null ? '이 상품이 맞다 → 비교가로 저장' : '저장'}
          </button>
        </div>
      )}
    </div>
  )
}

/** 종료·링크없음 — 제휴 대체 구매 링크를 채운다. 고객 화면에 버튼 + 고지 문구로 뜬다. */
function EndedFillRow({ post, onSaved }: { post: Post; onSaved: () => void }) {
  const existing = normalizePurchaseLinks(post)
  const [coupangUrl, setCoupangUrl] = useState(existing.find(l => l.platform === 'coupang')?.url ?? '')
  const [coupang, setCoupang] = useState(String(existing.find(l => l.platform === 'coupang')?.price ?? ''))
  const [naverUrl, setNaverUrl] = useState(existing.find(l => l.platform === 'naver')?.url ?? '')
  const [naver, setNaver] = useState(String(existing.find(l => l.platform === 'naver')?.price ?? ''))
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const canSave = !!(coupangUrl.trim() || naverUrl.trim())
  async function save() {
    setSaving(true)
    const now = new Date().toISOString()
    const links = []
    if (coupangUrl.trim()) links.push({ platform: 'coupang' as const, url: coupangUrl.trim(), price: parseInt(coupang) || null, visible: true, checked_at: now })
    if (naverUrl.trim())   links.push({ platform: 'naver' as const, url: naverUrl.trim(), price: parseInt(naver) || null, visible: true, checked_at: now })
    await fetch(`/api/posts/${post.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purchase_links: links }),
    })
    setSaving(false); setDone(true); onSaved()
  }

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: done ? '#f0fdf4' : '#fff' }}>
      <FillRowHead post={post} mode="ended" />
      <SearchQueryBar post={post} />
      <div className="admin-2col" style={{ gap: 8 }}>
        <input type="url" value={coupangUrl} onChange={e => { setCoupangUrl(e.target.value); setDone(false) }}
          placeholder="쿠팡 파트너스 링크" style={{ ...fillInput, fontSize: 13 }} />
        <input type="url" value={naverUrl} onChange={e => { setNaverUrl(e.target.value); setDone(false) }}
          placeholder="네이버 제휴 링크" style={{ ...fillInput, fontSize: 13 }} />
      </div>
      <div className="admin-2col" style={{ gap: 8, marginTop: 6 }}>
        <input type="number" value={coupang} onChange={e => setCoupang(e.target.value)}
          placeholder="쿠팡 가격 (선택)" style={{ ...fillInput, fontSize: 12 }} />
        <input type="number" value={naver} onChange={e => setNaver(e.target.value)}
          placeholder="네이버 가격 (선택)" style={{ ...fillInput, fontSize: 12 }} />
      </div>
      <p style={{ fontSize: 11, color: '#94a3b8', margin: '6px 0 0' }}>
        제휴 링크만 넣어주세요 — 고객 화면에 구매 버튼으로 뜨고 파트너스 고지 문구가 함께 붙습니다.
        가격을 모르면 비워두면 &quot;가격 확인하기&quot;로 보냅니다.
      </p>
      <SaveButton canSave={canSave} saving={saving} done={done} onClick={save} />
    </div>
  )
}
