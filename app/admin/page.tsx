'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import type { Post, ScraperStatus, InfluencerSource, Collection, PurchaseLink, PurchaseLinkRelation } from '@/lib/types'
import { RELATION_DEFAULT_REASON } from '@/lib/types'
import { daysLeft, periodLabel, isExpired, isCustomerVisible, isPagePublic, fmtDate, getPeriodState, DEADLINE_UNKNOWN_DAYS } from '@/lib/period'
import { hasPurchaseLink, normalizePurchaseLinks, brokenPurchaseLinks, isAffiliateLink, isSameProduct, alternativeLinks, PLATFORM_LABEL } from '@/lib/purchaseLinks'
import { getDealVerdict, isMultiOption } from '@/lib/dealGrade'
import { partnerSearchQuery } from '@/lib/searchQuery'
import { getCompareState, COMPARE_STATE_LABEL, CLEAR_COMPARE_NONE, type CompareState } from '@/lib/compareState'
import type { Inquiry } from '@/lib/inquiries'
import { needsKoreanName } from '@/lib/influencerItems'
import { findCompareCandidates, type CompareCandidate } from '@/lib/compareCandidates'
import { COMPARE_NONE_REASON_LABEL, type CompareNoneReason } from '@/lib/types'
import { GradeBadge } from '@/components/DealVerdictBox'
import { SITE_URL } from '@/lib/siteUrl'
import { CheckCircle2, TriangleAlert, Search, Flame, ImageOff, Eye, EyeOff, Package, Copy } from 'lucide-react'
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

export default function AdminPage() {
  const [authed, setAuthed]           = useState<boolean | null>(null)  // null = 확인 중
  const [posts, setPosts]             = useState<Post[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingPost, setEditingPost]   = useState<Post | null>(null)
  const [loading, setLoading]         = useState(true)
  const [filter, setFilter]           = useState<'all' | 'candidate' | 'needs_review' | 'ready' | 'published' | 'expired' | 'excluded' | 'upcoming' | 'upcoming_overdue' | 'featured'>('all')
  const [searchQ, setSearchQ]         = useState('')
  const [analytics, setAnalytics]     = useState<DayStat[]>([])
  const [topPosts, setTopPosts]       = useState<TopPost[]>([])
  const [topSharedPosts, setTopSharedPosts] = useState<TopPost[]>([])
  const [sources, setSources] = useState<{ source: string; label: string; count: number }[]>([])
  // 상품별 상세 조회수(최근 14일) — 채우기 목록을 실제 유입 순으로 세우는 데 쓴다
  const [detailViews, setDetailViews] = useState<Record<string, number>>({})
  // 상품별 클릭(종류별)과 유입 경로 — 수익화 현황 표
  const [clickBreakdown, setClickBreakdown] = useState<Record<string, Record<string, number>>>({})
  const [postSources, setPostSources] = useState<Record<string, Record<string, number>>>({})
  // 최근 방문의 개별 동작 — 세션 단위로 묶어 흐름을 본다
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  // 최근 7일 구매처(쿠팡·네이버·기타) 클릭 합계 — 성장 목표 카드
  const [moneyClicks7, setMoneyClicks7] = useState(0)
  const [growthGoals, setGrowthGoals] = useState<number[]>([])
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  // 「오늘 손보면 돈 되는 일」에서 '목록으로 →'를 누르면 채우기 탭의 어느 세부 탭으로
  // 갈지 함께 정한다 — 탭만 바꾸면 항상 '미확인'으로 열려서, ⚠️ 종료+대체상품없음 항목을
  // 눌러도 엉뚱한 목록이 뜨는 문제가 있었다
  const [verdictMode, setVerdictMode] = useState<'unchecked' | 'ended' | 'deadline'>('unchecked')
  const [influencerSources, setInfluencerSources] = useState<InfluencerSource[]>([])
  const [newSourceUrl, setNewSourceUrl] = useState('')
  const [newSourceName, setNewSourceName] = useState('')
  const [inpockStatus, setInpockStatus] = useState<ScraperStatus | null>(null)
  const [inpockBusy, setInpockBusy]   = useState(false)
  const [instPostUrl, setInstPostUrl] = useState('')
  const [instPostBusy, setInstPostBusy] = useState(false)
  const [instPostMsg, setInstPostMsg] = useState('')
  const [adminTab, setAdminTab] = useState<'posts' | 'influencers' | 'collections' | 'verdict' | 'revenue' | 'outreach' | 'data' | 'inquiries' | 'settings'>('posts')
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
      setDetailViews(d.detailViews || {})
      setClickBreakdown(d.clickBreakdown || {})
      setPostSources(d.postSources || {})
      setRecentSessions(d.recentSessions || [])
      setMoneyClicks7(d.moneyClicks7 || 0)
    }
  }, [])

  const fetchGrowthGoals = useCallback(async () => {
    const r = await fetch('/api/growth-goals')
    if (r.ok) { const d = await r.json(); setGrowthGoals(d.stages || []) }
  }, [])

  const fetchInquiries = useCallback(async () => {
    const r = await fetch('/api/inquiries')
    if (r.ok) { const d = await r.json(); setInquiries(d.inquiries || []) }
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
    fetchGrowthGoals()
    fetchInquiries()
    fetchInfluencerSources()
    fetchInpockStatus()
    fetchCollections()
    const iv = setInterval(() => { fetchInpockStatus() }, 5000)
    return () => clearInterval(iv)
  }, [fetchPosts, fetchAnalytics, fetchGrowthGoals, fetchInquiries, fetchInfluencerSources, fetchInpockStatus, fetchCollections])

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

  // status는 'upcoming'으로 저장되면 실제 공구가 수집되기 전까지 안 바뀐다(D-036 참고).
  // 오픈일이 지나도 status만 보고 "오픈예정" 탭에 묶으면, 정작 오픈일이 지나 이제
  // "왜 아직도 안 채워졌지" 확인이 필요한 것들이 "아직 안 열렸다"는 탭에 계속 숨어 버린다.
  // 날짜 계산은 getPeriodState가 KST 기준으로 다시 해주므로 그걸로 가른다.
  const isUpcomingOpen    = (p: Post) => effectiveStatus(p) === 'upcoming' && getPeriodState(p).kind === 'upcoming'
  const isUpcomingOverdue = (p: Post) => effectiveStatus(p) === 'upcoming' && getPeriodState(p).kind !== 'upcoming'

  const visible = posts.filter(p => {
    const st = effectiveStatus(p)
    const matchFilter =
      filter === 'all'       ? true :
      filter === 'published' ? isPublishedLive(p) :
      filter === 'expired'   ? isPublishedExpired(p) :
      filter === 'upcoming'  ? isUpcomingOpen(p) :
      filter === 'upcoming_overdue' ? isUpcomingOverdue(p) :
      filter === 'featured'  ? !!p.is_featured :
      st === filter
    const q = searchQ.toLowerCase()
    const matchQ = !q || p.title.toLowerCase().includes(q) || p.account.toLowerCase().includes(q)
    return matchFilter && matchQ
  })
  // 오픈예정 탭은 원래 순서(수집 순)라 "내일 오픈"이 몇 십 건 사이에 묻혀 안 보였다 —
  // 오픈일이 가까운 순으로 세워서 급한 것부터 눈에 띄게 한다
  if (filter === 'upcoming') visible.sort((a, b) => daysLeft(a.start_date) - daysLeft(b.start_date))

  const countBy = (s: Post['status']) => posts.filter(p => effectiveStatus(p) === s).length
  const candidateCount   = countBy('candidate')
  const needsReviewCount = countBy('needs_review')
  const readyCount       = countBy('ready')
  const publishedCount   = posts.filter(isPublishedLive).length
  const expiredCount     = posts.filter(isPublishedExpired).length
  const excludedCount    = countBy('excluded')
  const upcomingCount        = posts.filter(isUpcomingOpen).length
  const upcomingOverdueCount = posts.filter(isUpcomingOverdue).length
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

        {/* 오늘 손보면 돈 되는 일. 이 화면의 첫 질문을 "몇 명 들어왔지?"에서
            "오늘 어떤 상품을 손보면 돈이 될까?"로 바꾼다 — 통계 카드는 그 질문에 답을 못
            했다. 공개·검수·후보 건수는 '공구 관리' 탭의 필터 칩에 그대로 남아 있다 */}
        <TodayPriorities posts={posts} detailViews={detailViews} clickBreakdown={clickBreakdown}
          postSources={postSources} sources={sources}
          onGoTo={(tab, mode) => {
            setAdminTab(tab)
            if (mode) setVerdictMode(mode)
            if (tab === 'posts') setFilter('upcoming')
            // "목록으로 →"는 TodayPriorities(맨 위)에서 누르는데, 탭 내용은 방문자 분석
            // (거의 750줄, 화면 여러 개 분량) 아래에 있다. 상태만 바꾸고 안 내려주면
            // 스크롤이 안 된 사람 눈엔 아무 일도 안 일어난 것처럼 보였다.
            document.getElementById('admin-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }} />

        {/* 방문자 분석 */}
        <AnalyticsSection data={analytics} topPosts={topPosts} topSharedPosts={topSharedPosts} sources={sources} />

        {/* 탭 메뉴 */}
        <div id="admin-tabs" style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #e2e8f0', paddingBottom: 0 }}>
          {([
            { key: 'posts',       label: '공구 관리' },
            { key: 'influencers', label: '인플루언서 관리' },
            { key: 'collections', label: '컬렉션 관리' },
            { key: 'verdict',     label: '채우기' },
            { key: 'revenue',     label: '수익화 현황' },
            { key: 'outreach',    label: '인플루언서 확산' },
            { key: 'data',        label: '데이터' },
            { key: 'inquiries',   label: `제휴 문의${inquiries.filter(i => !i.handled).length ? ` ${inquiries.filter(i => !i.handled).length}` : ''}` },
            { key: 'settings',    label: '통계 설정' },
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={() => { setAdminTab(key); if (key === 'verdict') setVerdictMode('unchecked') }}
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
                  { key: 'upcoming_overdue', label: `오픈일 지남 · 미수집 ${upcomingOverdueCount}`, color: '#dc2626', count: upcomingOverdueCount },
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
            onEditStart={(src) => { setEditingInfluencer(src.id); setEditInfluencerDraft({ influencer_name: src.influencer_name, instagram_handle: src.instagram_handle, url: src.url, category: src.category, collection_status: src.collection_status, memo: src.memo }) }}
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
        {adminTab === 'verdict' && <VerdictFiller posts={posts} views={detailViews} onSaved={fetchPosts} initialMode={verdictMode} />}

        {adminTab === 'data' && (
          <>
            <GrowthGoalsBoard stages={growthGoals} analytics={analytics} moneyClicks7={moneyClicks7} onSaved={fetchGrowthGoals} />
            <VisitorFlow sessions={recentSessions} posts={posts} clickBreakdown={clickBreakdown} postSources={postSources} sources={sources} onRefresh={fetchAnalytics} />
          </>
        )}

        {adminTab === 'inquiries' && <InquiryList inquiries={inquiries} onRefresh={fetchInquiries} />}

        {adminTab === 'revenue' && <RevenueBoard posts={posts} clicks={clickBreakdown} sources={postSources} onGoFill={() => setAdminTab('verdict')} onSaved={fetchPosts} />}

        {adminTab === 'outreach' && <OutreachBoard posts={posts} detailViews={detailViews} clickBreakdown={clickBreakdown} onSaved={fetchPosts} />}

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
            {p.status === 'upcoming' && (
              getPeriodState(p).kind === 'upcoming'
                ? <span style={{ fontSize: 11, background: '#ede9fe', color: '#7c3aed',  padding: '2px 6px', borderRadius: 10, fontWeight: 600 }}>오픈 예정</span>
                : <span title="오픈일은 지났는데 정식 공구로 아직 수집되지 않았어요" style={{ fontSize: 11, background: '#fee2e2', color: '#dc2626',  padding: '2px 6px', borderRadius: 10, fontWeight: 700, cursor: 'help' }}>오픈일 지남 · 미수집</span>
            )}
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
  const [onlyNoName, setOnlyNoName] = useState(false)
  const q = search.trim().toLowerCase()
  const noName = sources.filter(s => needsKoreanName(s.influencer_name))
  let filteredSources = !q ? sources : sources.filter(s =>
    (s.influencer_name || '').toLowerCase().includes(q) ||
    (s.instagram_handle || '').toLowerCase().includes(q) ||
    (s.handle || '').toLowerCase().includes(q) ||
    (s.url || '').toLowerCase().includes(q)
  )
  if (onlyNoName) filteredSources = filteredSources.filter(s => needsKoreanName(s.influencer_name))

  return (
    <div>
      {/* 이름이 핸들 그대로면 인플루언서 페이지 제목이 "bobpro__ 공구"로 검색 결과에 나간다.
          그 페이지들은 노출 844에 클릭 33(CTR 3.9%)로, 상세 페이지의 1/4 수준이다 */}
      {noName.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16,
          padding: '12px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10 }}>
          <TriangleAlert size={17} strokeWidth={2.5} style={{ color: '#D97706', flexShrink: 0 }} />
          <div style={{ fontSize: 13, lineHeight: 1.6, color: '#92400E', flex: 1, minWidth: 0 }}>
            <strong>{noName.length}명</strong>의 이름이 핸들 그대로예요.
            인플루언서 페이지 제목이 <strong>&quot;bobpro__ 공구&quot;</strong>처럼 나가서 검색에서 잘 안 눌립니다.
            각 줄의 <strong>인스타 열기</strong>로 활동명을 확인해 넣어주세요.
          </div>
          <button onClick={() => setOnlyNoName(v => !v)}
            style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 8, border: 'none',
              background: onlyNoName ? '#92400E' : '#D97706', color: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}>
            {onlyNoName ? '전체 보기' : '이것만 보기'}
          </button>
        </div>
      )}
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
                  {/* 이름이 핸들 그대로면 페이지 제목이 "bobpro__ 공구"로 나간다. 한국 사용자는
                      그렇게 검색하지 않으므로 채울 대상을 눈에 띄게 표시한다 */}
                  {needsKoreanName(src.influencer_name) && (
                    /* 인스타 핸들이 없으면 인포크 주소로 보낸다. 인포크 핸들은 인스타 계정명과
                       다른 경우가 많아서(58개 중 39개는 인스타 핸들이 아예 없고, 있는 19개 중
                       13개는 서로 다르다) 그걸로 인스타 주소를 만들면 엉뚱한 계정이 열린다 */
                    <a href={src.instagram_handle
                      ? `https://www.instagram.com/${src.instagram_handle.replace('@', '')}/`
                      : src.url}
                      target="_blank" rel="noopener noreferrer"
                      title="활동명을 확인하고 아래 수정에서 넣어주세요"
                      style={{ fontSize: 11, fontWeight: 700, background: '#fef3c7', color: '#92400e',
                        borderRadius: 6, padding: '2px 8px', textDecoration: 'none', flexShrink: 0 }}>
                      한글 이름 없음 · {src.instagram_handle ? '인스타' : '인포크'} 열기 ↗
                    </a>
                  )}
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
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                          인스타 핸들
                          {(editInfluencerDraft.instagram_handle ?? src.instagram_handle) && (
                            <a href={`https://www.instagram.com/${String(editInfluencerDraft.instagram_handle ?? src.instagram_handle).replace('@', '')}/`}
                              target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textDecoration: 'none' }}>열기 ↗</a>
                          )}
                        </label>
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
                    {/* 인포크 주소는 인스타 핸들과 다른 경우가 많아서(@bobpro__ ↔ inpock/bobpro) 함께
                        보여야 어느 계정인지 확인이 된다. 둘 다 바로 열어볼 수 있게 링크를 붙인다 */}
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                        인포크 주소
                        {(editInfluencerDraft.url ?? src.url) && (
                          <a href={editInfluencerDraft.url ?? src.url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textDecoration: 'none' }}>열기 ↗</a>
                        )}
                        {src.handle && (
                          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>인포크 핸들 {src.handle}</span>
                        )}
                      </label>
                      <input value={editInfluencerDraft.url ?? src.url ?? ''}
                        onChange={e => onEditChange({ url: e.target.value })}
                        placeholder="https://link.inpock.co.kr/..."
                        style={inputStyle} />
                      <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>
                        이 주소에서 공구를 수집해요. 바꾸면 다음 수집부터 다른 페이지를 읽습니다.
                      </p>
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

interface RecentSession {
  sessionId: string
  visitorId: string | null
  startedAt: string
  lastAt: string
  source: string | null
  isReturning: boolean
  pageViews: number
  events: { at: string; s: string; v?: string; t: string; p?: number; c?: string; src?: string }[]
}

/**
 * 최근 방문 흐름 — 한 방문을 가로 한 줄로 본다.
 *
 * 처음에는 동작을 세로로 나열했는데, 절반이 "페이지 열기"라 읽히지 않았다. view 이벤트는
 * postId가 없어서 **어느 페이지인지도 모른다** — 점으로 찍을 내용이 없다. 그래서 주요 동작만
 * 가로로 잇고, 페이지 열기는 개수만 요약에 적는다.
 *
 * 방문자 id를 앞에 붙인다. 같은 사람이 여러 번 온 걸 눈으로 잇기 위해서다(visitorId는
 * localStorage에 남는 익명 난수라 브라우저당 하나다). IP는 저장하지 않는다.
 *
 * 관리자 방문은 여기 안 들어온다 — /api/analytics가 쿠키·흔적 쿠키·IP 세 겹으로 걸러낸 뒤에
 * 기록하기 때문이다(D-007). 표시 안 되는 기기에서 볼 때는 URL에 ?notrack=1을 한 번 붙이면 된다.
 */
function VisitorFlow({ sessions, posts, clickBreakdown, postSources, sources, onRefresh }: {
  sessions: RecentSession[]
  posts: Post[]
  clickBreakdown: Record<string, Record<string, number>>
  postSources: Record<string, Record<string, number>>
  sources: { source: string; label: string; count: number }[]
  onRefresh: () => void
}) {
  const title = (id?: number) => (id ? posts.find(p => p.id === id)?.title || `#${id}` : '')
  const searchIn = (id: number) => {
    const row = postSources[id] || {}
    return (row.naver_search || 0) + (row.google_search || 0) + (row.other_search || 0)
  }

  // 요약 3숫자 — 개별 로그(최근 300건, 대략 일주일치)보다 더 넓은 창(14일 집계)에서 낸다.
  // 표본이 작으면 비율이 출렁여서, 로그 몇 개로 계산한 "이동률"은 믿을 수가 없다.
  //
  // "검색→상세"는 검색 발생분만 센다(postSources). 전체 상세조회(detailViews)로 나누면
  // 100을 넘는 숫자가 나올 수 있다 — 검색 유입은 방문(세션) 수, 상세조회는 클릭(이벤트) 수라
  // 한 사람이 여러 상품을 보면 분모보다 분자가 커진다.
  const totalSearch = sources
    .filter(s => s.source === 'naver_search' || s.source === 'google_search' || s.source === 'other_search')
    .reduce((sum, s) => sum + s.count, 0)
  const totalDetail = posts.reduce((sum, p) => sum + searchIn(p.id), 0)
  const totalMoney = Object.values(clickBreakdown).reduce((sum, row) => sum + (row.coupang || 0) + (row.naver || 0) + (row.other || 0), 0)
  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '–')

  const when = (iso: string) => {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (m < 1) return '방금'
    if (m < 60) return `${m}분 전`
    if (m < 1440) return `${Math.floor(m / 60)}시간 전`
    return `${Math.floor(m / 1440)}일 전`
  }

  /** 타임라인에 점으로 찍을 만한 동작인지 — 페이지 열기는 내용이 없어 뺀다 */
  type Node = { label: string; sub: string; money: boolean; strong: boolean }
  const toNode = (e: RecentSession['events'][number]): Node | null => {
    if (e.t === 'view') return null
    if (e.t === 'click' && e.c === 'detail') return { label: '상세', sub: title(e.p), money: false, strong: false }
    if (e.t === 'join' || (e.t === 'click' && e.c === 'groupbuy')) return { label: '공구로 나감', sub: title(e.p), money: false, strong: true }
    if (e.t === 'click' && (e.c === 'coupang' || e.c === 'naver' || e.c === 'other')) {
      return { label: `${e.c} 구매`, sub: title(e.p), money: true, strong: true }
    }
    if (e.t === 'bookmark') return { label: '찜', sub: title(e.p), money: false, strong: true }
    if (e.t === 'share') return { label: '공유', sub: title(e.p), money: false, strong: true }
    if (e.t === 'search') return { label: '검색', sub: '', money: false, strong: false }
    if (e.t === 'category') return { label: '카테고리', sub: '', money: false, strong: false }
    return { label: e.t, sub: title(e.p), money: false, strong: false }
  }

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 17, fontWeight: 800 }}>최근 방문 흐름</h2>
        <button onClick={onRefresh}
          style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, border: '1px solid #cbd5e1',
            background: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#475569' }}>
          새로고침
        </button>
      </div>
      <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7, marginBottom: 16 }}>
        한 방문이 한 줄이에요. <strong>페이지 열기는 뺐습니다</strong> — 어느 페이지인지 안 남아서 볼 게 없어요.
        <br />
        <span style={{ color: '#94a3b8' }}>
          앞의 4자리는 방문자 표시(브라우저마다 하나). 관리자 방문은 안 들어옵니다. 최근 300건만 남아요.
        </span>
      </p>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 18,
        padding: '12px 14px', background: '#f8fafc', borderRadius: 10, fontSize: 12.5 }}>
        <span><strong style={{ fontSize: 15 }}>{totalSearch}</strong>명 검색 유입</span>
        <span style={{ color: '#94a3b8' }}>검색→상세 {pct(totalDetail, totalSearch)}</span>
        <span style={{ color: '#94a3b8' }}>상세→구매처클릭 {pct(totalMoney, totalDetail)}</span>
        <span style={{ marginLeft: 'auto', color: '#94a3b8' }}>최근 14일 집계 기준</span>
      </div>

      {sessions.length === 0 ? (
        <p style={{ textAlign: 'center', padding: '28px 0', fontSize: 14, fontWeight: 700, color: '#64748b' }}>
          아직 쌓인 방문이 없어요
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sessions.map(s => {
            const nodes = s.events.map(toNode).filter(Boolean) as Node[]
            const paid = nodes.some(n => n.money)
            return (
              <div key={s.sessionId}
                style={{ border: '1px solid #e2e8f0', borderLeft: `3px solid ${paid ? '#22c55e' : '#e2e8f0'}`,
                  borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: nodes.length ? 8 : 0 }}>
                  <code style={{ fontSize: 11, fontWeight: 700, color: '#475569', background: '#f1f5f9', borderRadius: 5, padding: '1px 6px' }}>
                    {(s.visitorId || s.sessionId).slice(0, 4)}
                  </code>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>
                    {SOURCE_KO[s.source || 'direct'] || s.source || '직접 방문'}
                  </span>
                  {s.isReturning && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d', background: '#dcfce7', borderRadius: 5, padding: '1px 6px' }}>재방문</span>
                  )}
                  <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>
                    {s.pageViews > 0 && `${s.pageViews}페이지 · `}{when(s.lastAt)}
                  </span>
                </div>

                {nodes.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: '#94a3b8' }}>둘러보기만 하고 나갔어요</div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', paddingBottom: 2 }}>
                    {nodes.map((n, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                        {i > 0 && <span style={{ width: 18, height: 1.5, background: '#e2e8f0', flexShrink: 0 }} />}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, maxWidth: 190, flexShrink: 0 }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
                            color: n.money ? '#15803d' : n.strong ? '#4f46e5' : '#64748b' }}>
                            {n.money ? '● ' : n.strong ? '◆ ' : '○ '}{n.label}
                          </span>
                          {n.sub && (
                            <span style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden',
                              textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 12 }}>
                              {n.sub}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
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

const SOURCE_KO: Record<string, string> = {
  naver_search: '네이버 검색', google_search: '구글 검색', other_search: '기타 검색',
  instagram: '인스타그램', kakao: '카카오톡', calendar: '캘린더 알림',
  inapp: '앱 안에서', external: '외부 링크', direct: '직접 방문',
}

const INQUIRY_KIND_KO: Record<string, string> = { influencer: '인플루언서', brand: '브랜드', company: '업체' }

/**
 * 제휴 문의 — "우리 공구도 올려주세요" "제휴하고 싶어요" 창구(`/propose`)로 들어온 것들.
 *
 * 이메일로도 가겠지만(설정돼 있으면) 여기가 최종 저장소다. SMTP가 아직 안 잡혀 있거나
 * 잠깐 죽어도 문의는 여기 남는다 — `emailed`가 false면 그 문의는 메일로 못 받았다는 뜻이라
 * 표시해 둔다. 처리한 건 접어 둘 수 있게 `handled` 토글만 뒀다 — 계속 쌓이면 새 문의를
 * 못 찾는다.
 */
function InquiryList({ inquiries, onRefresh }: { inquiries: Inquiry[]; onRefresh: () => void }) {
  const [showHandled, setShowHandled] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const list = showHandled ? inquiries : inquiries.filter(i => !i.handled)

  async function toggle(id: string, handled: boolean) {
    setBusyId(id)
    await fetch('/api/inquiries', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, handled }),
    })
    setBusyId(null)
    onRefresh()
  }

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 17, fontWeight: 800 }}>제휴 문의</h2>
        <button onClick={onRefresh}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #cbd5e1',
            background: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#475569' }}>
          새로고침
        </button>
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#64748b', cursor: 'pointer' }}>
          <input type="checkbox" checked={showHandled} onChange={e => setShowHandled(e.target.checked)} />
          처리한 것도 보기
        </label>
      </div>
      <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7, marginBottom: 16 }}>
        「공구 제안 · 입점 문의」(사이트 하단)로 들어온 것들이에요. 이메일로도 보내지만
        <code style={{ background: '#f1f5f9', borderRadius: 4, padding: '1px 5px' }}>SMTP_HOST</code> 등이
        아직 설정 안 됐거나 발송이 실패하면 여기가 유일한 기록이에요.
      </p>

      {list.length === 0 ? (
        <p style={{ textAlign: 'center', padding: '28px 0', fontSize: 14, fontWeight: 700, color: '#64748b' }}>
          {showHandled ? '문의가 없어요' : '처리할 문의가 없어요'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(i => (
            <div key={i.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px',
              opacity: i.handled ? 0.6 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5', background: '#eef2ff', borderRadius: 6, padding: '2px 8px' }}>
                  {INQUIRY_KIND_KO[i.kind] || i.kind}
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{i.name}</span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{i.contact}</span>
                {!i.emailed && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309', background: '#fef3c7', borderRadius: 6, padding: '2px 8px' }}
                    title="메일 발송이 안 됐거나 SMTP가 설정 안 됐어요">
                    메일 미발송
                  </span>
                )}
                <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#94a3b8' }}>
                  {new Date(i.createdAt).toLocaleString('ko-KR')}
                </span>
              </div>
              {i.link && (
                <a href={i.link.startsWith('http') ? i.link : `https://${i.link}`} target="_blank" rel="noreferrer"
                  style={{ fontSize: 12, color: '#6366f1', fontWeight: 600, textDecoration: 'none' }}>
                  {i.link} ↗
                </a>
              )}
              {i.product && <div style={{ fontSize: 12.5, color: '#475569', marginTop: 4 }}>상품: {i.product}</div>}
              <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.6, margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{i.message}</p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button onClick={() => toggle(i.id, !i.handled)} disabled={busyId === i.id}
                  style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff',
                    cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569' }}>
                  {i.handled ? '처리 취소' : '처리 완료'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


/**
 * 제휴 링크를 그 자리에서 넣는 창.
 *
 * 수익화 현황 표에서 "없음"을 보고 다른 화면으로 옮겨 다시 찾는 왕복이 있었다. 표에서 바로
 * 넣게 한다.
 *
 * 저장 전에 파트너스 링크인지 검사한다 — url 자리에 상품명을 그대로 붙여넣은 데이터가
 * 실제로 있었다("앱솔리 또또뻥 호라산밀 앤 파로 뻥튀기, 5개, 95g"). 그런 값은 고객 화면에
 * 안 뜨는데, 관리자는 넣었다고 생각하고 넘어간다. 입구에서 막는 편이 낫다.
 *
 * 동일 상품을 못 찾을 때를 위한 대체 상품 칸도 있다(D-031) — 채우기 「종료·링크없음」에는
 * 있었는데 여기 없어서, 이 창으로 먼저 들어온 관리자가 "다른 상품 추천할 링크는 넣을 수가
 * 없다"고 막혔다. 두 입구가 같은 기능을 갖춰야 한다.
 */
function PurchaseLinkModal({ post, onClose, onSaved }: { post: Post; onClose: () => void; onSaved: () => void }) {
  const existing = normalizePurchaseLinks(post)
  const current = existing.find(l => l.platform === 'coupang' && isSameProduct(l))
  const [url, setUrl] = useState(current?.url ?? '')
  const [price, setPrice] = useState(String(current?.price ?? ''))

  const altExisting = existing.find(l => !isSameProduct(l))
  const [showAlt, setShowAlt] = useState(!!altExisting)
  const [altUrl, setAltUrl] = useState(altExisting?.url ?? '')
  const [altPrice, setAltPrice] = useState(String(altExisting?.price ?? ''))
  const [altRelation, setAltRelation] = useState<PurchaseLinkRelation>(altExisting?.relation ?? 'similar')
  const [altProductName, setAltProductName] = useState(altExisting?.productName ?? '')
  const [altReason, setAltReason] = useState(altExisting?.reason ?? RELATION_DEFAULT_REASON[altExisting?.relation ?? 'similar'])
  const [altMemo, setAltMemo] = useState(altExisting?.adminMemo ?? '')

  const [saving, setSaving] = useState(false)

  const trimmed = url.trim()
  const looksOk = !trimmed || isAffiliateLink({ platform: 'coupang', url: trimmed })
  const altTrimmed = altUrl.trim()
  const altLooksOk = !altTrimmed || isAffiliateLink({ platform: 'coupang', url: altTrimmed })
  const canSave = (!!trimmed || !!altTrimmed) && looksOk && altLooksOk

  async function save() {
    setSaving(true)
    // 이 창이 다루는 건 coupang 동일상품 + coupang 대체상품 둘뿐이다. 그 외 플랫폼(네이버 등)
    // 은 건드리지 않고 그대로 남긴다
    const untouched = existing.filter(l => l.platform !== 'coupang')
    const now = new Date().toISOString()
    const links = [...untouched]
    if (trimmed) links.push({ platform: 'coupang' as const, kind: 'same' as const, relation: 'same' as const, url: trimmed, price: parseInt(price) || null, visible: true, checked_at: now })
    if (altTrimmed) links.push({
      platform: 'coupang' as const, kind: 'alternative' as const, relation: altRelation,
      url: altTrimmed, price: parseInt(altPrice) || null,
      productName: altProductName.trim() || null, reason: altReason.trim() || null, adminMemo: altMemo.trim() || null,
      visible: true, checked_at: now,
    })
    await fetch(`/api/posts/${post.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purchase_links: links }),
    })
    setSaving(false); onSaved(); onClose()
  }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 520,
          maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ fontSize: 15.5, fontWeight: 800, marginBottom: 4 }}>쿠팡 파트너스 링크 넣기</h3>
        <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, marginBottom: 12 }}>{post.title}</p>

        <FillTools post={post} />

        <input type="url" value={url} onChange={e => setUrl(e.target.value)}
          placeholder="https://link.coupang.com/a/..."
          style={{ ...fillInput, fontSize: 13 }} />
        {!looksOk && (
          <p style={{ fontSize: 12, color: '#b91c1c', margin: '6px 0 0', lineHeight: 1.6 }}>
            파트너스 링크가 아니에요. 파트너스에서 <strong>링크를 복사</strong>해 주세요 —
            상품명이 복사된 것 같아요. (<code>link.coupang.com</code> 또는 <code>coupa.ng</code>)
          </p>
        )}

        <input type="number" value={price} onChange={e => setPrice(e.target.value)}
          placeholder="쿠팡 가격 (선택 — 모르면 비워두면 '가격 확인하기'로 보내요)"
          style={{ ...fillInput, fontSize: 13, marginTop: 8 }} />

        <p style={{ fontSize: 11, color: '#94a3b8', margin: '8px 0 0', lineHeight: 1.6 }}>
          고객 화면에 구매 버튼으로 뜨고 공정위 제휴 고지가 함께 붙어요. 그래서 진짜 파트너스
          링크만 넣어야 합니다.
        </p>

        {showAlt ? (
          <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: '#fafaf9', border: '1px solid #e7e5e4' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#44403c', marginBottom: 7 }}>
              똑같은 상품을 못 찾았을 때 — 비슷한 상품
            </div>
            <RelationPicker relation={altRelation} reason={altReason}
              onChange={(rel, reason) => { setAltRelation(rel); setAltReason(reason) }} />
            <input type="url" value={altUrl} onChange={e => setAltUrl(e.target.value)}
              placeholder="쿠팡 파트너스 링크 (다른 상품)" style={{ ...fillInput, fontSize: 13, marginTop: 6 }} />
            {!altLooksOk && (
              <p style={{ fontSize: 12, color: '#b91c1c', margin: '6px 0 0', lineHeight: 1.6 }}>
                파트너스 링크가 아니에요. 상품명이 복사된 것 같아요.
              </p>
            )}
            <div className="admin-2col" style={{ gap: 8, marginTop: 6 }}>
              <input type="number" value={altPrice} onChange={e => setAltPrice(e.target.value)}
                placeholder="가격 (선택)" style={{ ...fillInput, fontSize: 12 }} />
              <input value={altProductName} onChange={e => setAltProductName(e.target.value)}
                placeholder="상품명 (고객 화면에 노출)" style={{ ...fillInput, fontSize: 12 }} />
            </div>
            <input value={altReason} onChange={e => setAltReason(e.target.value)}
              placeholder="추천 이유 (고객 화면 문구)" style={{ ...fillInput, fontSize: 12, marginTop: 6 }} />
            <textarea value={altMemo} onChange={e => setAltMemo(e.target.value)}
              placeholder="내부 메모 (관리자만 봐요 — 예: 브랜드가 달라요, 팩토는 어때요)" rows={2}
              style={{ marginTop: 6, width: '100%', fontSize: 12, fontFamily: 'inherit', padding: '8px 10px', border: '1.5px solid #fde68a', background: '#fffbeb', borderRadius: 8, resize: 'vertical', boxSizing: 'border-box' }} />
            <p style={{ fontSize: 11, color: '#a8a29e', margin: '8px 0 0', lineHeight: 1.6 }}>
              고객 화면에 &quot;같은 상품은 못 찾았어요&quot;라고 먼저 밝히고, 판정(가격 비교)에는
              안 쓰여요. 다른 상품을 같은 상품으로 속이지 않기 위해서예요.
            </p>
            {!altExisting && (
              <button onClick={() => { setShowAlt(false); setAltUrl(''); setAltPrice(''); setAltProductName(''); setAltReason(RELATION_DEFAULT_REASON.similar); setAltMemo(''); setAltRelation('similar') }}
                style={{ marginTop: 8, padding: 0, border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 11.5, color: '#94a3b8', fontWeight: 600 }}>
                접기
              </button>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => setShowAlt(true)}
            style={{ marginTop: 10, padding: 0, border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 11.5, color: '#94a3b8', fontWeight: 600 }}>
            + 똑같은 상품을 못 찾았어요 — 비슷한 상품으로 안내
          </button>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff',
              cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#475569' }}>
            닫기
          </button>
          <button onClick={save} disabled={!canSave || saving}
            style={{ padding: '8px 18px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
              cursor: canSave && !saving ? 'pointer' : 'not-allowed',
              background: canSave ? '#6366f1' : '#e2e8f0', color: canSave ? '#fff' : '#94a3b8' }}>
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * 수익화 현황 — 상품별로 "얼마나 보고, 얼마나 나가고, 나갈 곳이 있는가"를 한 표로 본다.
 *
 * 이 제품에서 돈이 되는 동작은 제휴 링크 클릭뿐이다(사이트 안에서 결제하지 않는다). 그런데
 * 제휴 클릭이 전체 기간 0회다 — 링크가 붙은 공구가 18건뿐이라 셀 게 없었다. 어디에 붙여야
 * 하는지를 숫자로 보여주는 화면이 없어서 그렇다.
 *
 * "검색유입" 열은 오늘부터 쌓인다(postSources). 소급이 안 되므로 한동안 0으로 보이는 게
 * 정상이다 — 없는 값을 있는 것처럼 보이게 하지 않는다.
 */
/**
 * 오늘 손보면 돈 되는 일 — 관리자 첫 화면.
 *
 * 예전엔 "공개됨 72 · 검수 필요 1047 · 오늘 방문자 29명"처럼 상태 개수부터 보여줬다. 숫자는
 * 맞는데, 보고 나서 뭘 해야 할지가 안 나왔다. 이 화면의 첫 질문을 "몇 명 들어왔지?"에서
 * "오늘 어떤 상품을 손보면 돈이 될까?"로 바꾼다.
 *
 * 우선순위 세 묶음은 전부 이미 있는 데이터(postSources·detailViews·clickBreakdown)를
 * 다르게 자른 것뿐이다 — 새 집계를 만들지 않았다.
 *
 * **뺀 것 — 예상 수익.** 클릭까지는 알지만 결제 여부는 모른다. 파트너스 클릭이 실제
 * 구매로 이어졌는지는 쿠팡·네이버 파트너스 자체 대시보드에서만 확인된다. 없는 숫자를
 * 지어내지 않는다(원칙 2) — "구매 8건 · 수익 37,400원" 같은 값은 여기서 낼 수 없다.
 *
 * **뺀 것 — 검색 급상승.** 상품별 유입 경로(postSources)가 쌓인 지 며칠 안 됐다(2026-08-22
 * 시작). 이번 주 대비 지난주를 비교하려면 최소 2주치가 있어야 하는데 지금은 절반도 안
 * 된다. 데이터가 없는데 "+82%"를 보여주면 그게 바로 틀린 숫자를 내보내는 것이다(원칙 1).
 * 자리는 비워 두고 며칠 뒤 데이터가 차면 그때 만든다.
 */
/**
 * 성장 목표 — 일 방문자 기준 단계(기본 150→300→500→1,000→3,000→10,000)로 지금 어디까지
 * 왔는지 보여준다. 단계는 사장님이 나중에 고칠 수 있다(/api/growth-goals).
 *
 * "지금 단계"는 오늘 하루 값이 아니라 최근 7일 평균으로 정한다 — 하루 방문자는 요일
 * 편차가 커서(주말 vs 평일), 좋은 날 하루로 다음 단계를 넘긴 것처럼 보이거나 나쁜 날
 * 하루로 이미 넘은 단계 아래로 떨어져 보이면 판정이 널뛴다.
 */
function GrowthGoalsBoard({ stages, analytics, moneyClicks7, onSaved }: {
  stages: number[]
  analytics: DayStat[]
  moneyClicks7: number
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const last7 = analytics.slice(-7)
  const week7 = last7.reduce((s, d) => s + d.visitors, 0)
  const avg7 = last7.length > 0 ? week7 / last7.length : 0
  const maxVisitors = Math.max(...last7.map(d => d.visitors), 1)
  // 그 전 7일 대비 증감 — "42%"라는 정적인 숫자만으론 지금 오르는 중인지 멎어 있는지
  // 안 보인다는 사장님 피드백. getSummary(14)라 그 전 7일이 딱 앞쪽에 남아 있다.
  const prev7 = analytics.slice(-14, -7)
  const prevAvg7 = prev7.length > 0 ? prev7.reduce((s, d) => s + d.visitors, 0) / prev7.length : 0
  const trendDiff = Math.round(avg7 - prevAvg7)
  const hasTrend = prev7.length > 0

  if (stages.length === 0) return null // 아직 못 불러왔음

  // 단계와 별개로 이미 정해둔 잠금 해제 기준(CLAUDE.md "하지 않기로 한 것") — 일 방문자가
  // 여기 넘으면 그 기능을 다시 검토한다는 뜻. 단계 사다리(150→...→10,000)와 숫자가 딱
  // 안 맞아도(100은 150보다 작다) 사장님이 "다음에 뭘 할지 안 보인다"고 한 부분이라
  // 따로 보여준다 — 없는 계획을 지어내는 대신 이미 있는 결정을 연결한다.
  const UNLOCKS = [
    { threshold: 100, label: '키워드 알림', note: '현재 푸시 구독자 2명' },
    { threshold: 300, label: '댓글 기능', note: null as string | null },
  ]

  // 현재 단계 = 7일 평균이 넘은 마지막 단계. 하나도 못 넘었으면 -1
  let currentIdx = -1
  for (let i = 0; i < stages.length; i++) {
    if (avg7 >= stages[i]) currentIdx = i
  }
  const nextIdx = currentIdx + 1
  const nextStage = nextIdx < stages.length ? stages[nextIdx] : null
  const remaining = nextStage !== null ? Math.max(0, Math.ceil(nextStage - avg7)) : 0
  const stagePct = nextStage !== null ? Math.min(100, Math.round((avg7 / nextStage) * 100)) : 100
  const laterStages = nextStage !== null ? stages.slice(nextIdx + 1) : []
  // 방문자가 늘어도 구매 행동이 같이 늘고 있는지 — "사람이 늘었나 · 구매도 늘었나"를
  // 한 화면에서 같이 보려고 붙였다(사장님 피드백)
  const clickRate7 = week7 > 0 ? (moneyClicks7 / week7) * 100 : null

  function startEdit() {
    setDraft(stages.map(String))
    setErr('')
    setEditing(true)
  }

  async function save() {
    setErr('')
    const nums = draft.map(s => Number(s.trim()))
    if (nums.some(n => !Number.isFinite(n) || n <= 0)) { setErr('모든 단계는 0보다 큰 숫자여야 해요'); return }
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] <= nums[i - 1]) { setErr('단계는 앞 단계보다 커야 해요'); return }
    }
    setSaving(true)
    try {
      const res = await fetch('/api/growth-goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stages: nums }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error || '저장 실패'); return }
      setEditing(false)
      onSaved()
    } catch {
      setErr('저장 실패')
    } finally {
      setSaving(false)
    }
  }

  function fmtDate(dateStr: string) {
    const [, m, d] = dateStr.split('-')
    return `${parseInt(m)}/${parseInt(d)}`
  }

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 24, border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e293b' }}>성장 목표</h3>
        {!editing && (
          <button onClick={startEdit}
            style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 7, border: '1px solid #cbd5e1',
              background: '#fff', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: '#475569' }}>
            단계 수정
          </button>
        )}
      </div>
      <p style={{ fontSize: 11.5, color: '#94a3b8', margin: '0 0 16px' }}>
        일 방문자 기준(최근 7일 평균)이에요. 요일 편차가 커서 하루 값 대신 평균으로 단계를 매겨요.
      </p>

      {editing ? (
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {draft.map((v, i) => (
              <input key={i} type="number" value={v}
                onChange={e => setDraft(d => d.map((x, xi) => xi === i ? e.target.value : x))}
                style={{ width: 90 }} />
            ))}
          </div>
          {err && <p style={{ color: '#ef4444', fontSize: 12.5, margin: '0 0 8px', fontWeight: 600 }}>❌ {err}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-submit" onClick={save} disabled={saving} style={{ width: 'auto', padding: '8px 16px' }}>
              {saving ? '저장 중...' : '저장'}
            </button>
            <button onClick={() => setEditing(false)}
              style={{ padding: '8px 16px', borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff',
                cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#475569' }}>
              취소
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 18 }}>
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>7일 평균</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                {Math.round(avg7).toLocaleString()}명
                {hasTrend && trendDiff !== 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, marginLeft: 6, color: trendDiff > 0 ? '#15803d' : '#dc2626' }}>
                    {trendDiff > 0 ? '▲' : '▼'}{Math.abs(trendDiff)}
                  </span>
                )}
              </div>
              {hasTrend && <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>지난 7일 대비</div>}
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>7일 합계</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{week7.toLocaleString()}명</div>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>구매처 클릭(7일)</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{moneyClicks7.toLocaleString()}회</div>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>구매처 클릭률(7일)</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                {clickRate7 === null ? '–' : `${clickRate7.toFixed(1)}%`}
              </div>
            </div>
          </div>

          {/* 지금 도전 중인 단계 하나만 크게 — 6단계를 한 화면에 다 펼치면 63명이 10,000명
              옆에서 너무 작아 보인다(사장님 피드백). "10,000명까지 1% 왔다"가 아니라
              "1단계의 42%까지 왔다"가 지금 필요한 정보다. */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                {nextStage === null ? `${stages.length}단계 달성 🎉` : `${nextIdx + 1}단계 · 일평균 ${nextStage.toLocaleString()}명`}
              </span>
              {nextStage !== null && (
                <span style={{ fontSize: 12.5, color: '#64748b' }}>
                  {Math.round(avg7).toLocaleString()}명 / {nextStage.toLocaleString()}명 · {stagePct}%
                </span>
              )}
            </div>
            {nextStage !== null && (
              <>
                <div style={{ height: 12, borderRadius: 6, background: '#e2e8f0', overflow: 'hidden' }}>
                  <div style={{ width: `${stagePct}%`, height: '100%', borderRadius: 6,
                    background: '#f59e0b', transition: 'width .3s' }} />
                </div>
                <p style={{ fontSize: 12, color: '#d97706', fontWeight: 700, margin: '6px 0 0' }}>
                  {nextIdx + 1}단계 달성까지 평균 +{remaining.toLocaleString()}명
                </p>
              </>
            )}
            {laterStages.length > 0 && (
              <p style={{ fontSize: 11.5, color: '#94a3b8', margin: '10px 0 0' }}>
                다음: {laterStages.map(s => `${s.toLocaleString()}명`).join(' → ')}
              </p>
            )}

            {/* 방문자가 늘면 뭐가 달라지는지 — 진행률만 있고 다음 액션이 안 보인다는
                피드백. 새로 정하지 않고 CLAUDE.md에 이미 있는 보류 조건을 그대로 연결한다 */}
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed #e2e8f0' }}>
              <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>
                🔓 방문자가 늘면 열리는 기능
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {UNLOCKS.map(u => {
                  const done = avg7 >= u.threshold
                  return (
                    <div key={u.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                      <span style={{ fontWeight: 700, color: done ? '#15803d' : '#475569' }}>
                        {done ? '✓' : '○'} {u.label}
                      </span>
                      <span style={{ color: '#94a3b8' }}>
                        {done
                          ? '조건 충족'
                          : `일 ${u.threshold.toLocaleString()}명부터 (${Math.round(avg7).toLocaleString()}/${u.threshold.toLocaleString()})${u.note ? ` · ${u.note}` : ''}`}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>최근 7일 방문자 추이</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 60 }}>
              {last7.map((d, i) => (
                <div key={d.date} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{
                    height: `${Math.max(4, (d.visitors / maxVisitors) * 48)}px`,
                    background: i === last7.length - 1 ? '#6366f1' : '#c7d2fe',
                    borderRadius: 3, marginBottom: 4,
                  }} />
                  <span style={{ fontSize: 9.5, color: '#94a3b8' }}>{fmtDate(d.date)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function TodayPriorities({ posts, detailViews, clickBreakdown, postSources, sources, onGoTo }: {
  posts: Post[]
  detailViews: Record<string, number>
  clickBreakdown: Record<string, Record<string, number>>
  postSources: Record<string, Record<string, number>>
  sources: { source: string; label: string; count: number }[]
  onGoTo: (tab: 'verdict' | 'revenue' | 'posts', verdictMode?: 'unchecked' | 'ended' | 'deadline') => void
}) {
  const views = (id: number) => detailViews[id] || 0
  const searchIn = (id: number) => {
    const row = postSources[id] || {}
    return (row.naver_search || 0) + (row.google_search || 0) + (row.other_search || 0)
  }
  const moneyClicks = (id: number) => {
    const row = clickBreakdown[id] || {}
    return (row.coupang || 0) + (row.naver || 0) + (row.other || 0)
  }

  // 14일 기준 — 위 세 집계와 같은 창(getSourceCounts(14)/getClickBreakdown(14)/getPostSourceCounts(14))
  const totalSearch = sources
    .filter(s => s.source === 'naver_search' || s.source === 'google_search' || s.source === 'other_search')
    .reduce((sum, s) => sum + s.count, 0)
  // "상세조회"는 검색 발생분만 센다. 전체 상세조회(detailViews)로 나누면 371/266=139%처럼
  // 100을 넘는 숫자가 나온다 — 검색 유입은 방문(세션) 수고 상세조회는 클릭(이벤트) 수라
  // 한 사람이 여러 상품을 보면 분모보다 분자가 커진다. 같은 모수(검색으로 온 사람의
  // 클릭)로 맞춰야 비율이 뜻을 가진다
  const totalDetail = posts.reduce((sum, p) => sum + searchIn(p.id), 0)
  const totalMoneyClicks = posts.reduce((sum, p) => sum + moneyClicks(p.id), 0)
  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '–')

  const bucketA = posts
    .filter(p => isCustomerVisible(p) && getPeriodState(p).kind !== 'upcoming'
      && getCompareState(p) === 'unchecked' && searchIn(p.id) > 0)
    .sort((a, b) => searchIn(b.id) - searchIn(a.id))

  const bucketB = posts
    .filter(p => isPagePublic(p) && !hasPurchaseLink(p) && alternativeLinks(p).length === 0 && views(p.id) > 0)
    .sort((a, b) => views(b.id) - views(a.id))

  const bucketC = posts
    .filter(p => isPagePublic(p) && isExpired(p) && !hasPurchaseLink(p) && alternativeLinks(p).length === 0 && views(p.id) > 0)
    .sort((a, b) => views(b.id) - views(a.id))

  // 오픈일이 지나면 D-037이 알아서 고객 화면에서 숨겨주지만, 그건 이미 늦은 뒤다 —
  // 하루 전에 미리 알려줘야 그날 안에 재수집을 걸어보거나 사장님이 직접 확인할 시간이 있다.
  const bucketD = posts
    .filter(p => {
      const s = getPeriodState(p)
      return s.kind === 'upcoming' && s.daysToOpen === 1 && (!p.price || !p.img || !p.purchase_url)
    })
    .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))

  const buckets: { emoji: string; label: string; items: Post[]; metric: (p: Post) => string; tab: 'verdict' | 'revenue' | 'posts'; verdictMode?: 'unchecked' | 'ended' | 'deadline' }[] = [
    { emoji: '🔥', label: '검색 유입 있는데 비교가 없는 상품', items: bucketA, metric: p => `검색 ${searchIn(p.id)}회`, tab: 'verdict', verdictMode: 'unchecked' },
    { emoji: '💰', label: '조회수 있는데 구매 링크가 없는 상품', items: bucketB, metric: p => `조회 ${views(p.id)}회`, tab: 'revenue' },
    // "종료됐는데 대체 상품도 없는" 상품은 채우기의 「종료·링크없음」 세부 탭에 있다.
    // 탭만 'verdict'로 바꾸면 항상 '미확인'으로 열려서 이 항목을 못 찾았다 — 세부 탭까지 지정한다
    { emoji: '⚠️', label: '공구 종료됐는데 대체 상품도 없는 상품', items: bucketC, metric: p => `조회 ${views(p.id)}회`, tab: 'verdict', verdictMode: 'ended' },
    { emoji: '📅', label: '내일 오픈인데 아직 콘텐츠가 안 채워진 예고', items: bucketD, metric: p => `${fmtDate(p.start_date)} 오픈`, tab: 'posts' },
  ]

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0', marginBottom: 20 }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 14 }}>오늘 손보면 돈 되는 일</h2>

      {/* 최근 14일 퍼널. 클릭까지만 안다 — 결제 여부는 모른다 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4,
        padding: '12px 14px', background: '#f8fafc', borderRadius: 10 }}>
        <FunnelStep label="검색 유입" value={totalSearch} />
        <FunnelArrow rate={pct(totalDetail, totalSearch)} />
        <FunnelStep label="상세 조회" value={totalDetail} />
        <FunnelArrow rate={pct(totalMoneyClicks, totalDetail)} />
        <FunnelStep label="구매처 클릭" value={totalMoneyClicks} highlight />
      </div>
      <p style={{ fontSize: 11.5, color: '#94a3b8', margin: '6px 0 18px', lineHeight: 1.6 }}>
        최근 14일 · 상세조회는 검색으로 들어와 본 것만 센 값이에요(전체 조회수는 아래 목록의
        &quot;조회&quot;가 더 정확해요). 쿠팡·네이버 파트너스 클릭까지만 알 수 있고, 실제
        결제 여부와 수익은 각 플랫폼 파트너스 대시보드에서 확인해야 해요 — 저희가 지어낼 수
        있는 숫자가 아니에요.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {buckets.map(b => b.items.length === 0 ? null : (
          <div key={b.label} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '11px 13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{b.emoji} {b.label} {b.items.length}건</span>
              <button onClick={() => onGoTo(b.tab, b.verdictMode)}
                style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 7, border: '1px solid #cbd5e1',
                  background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#475569' }}>
                목록으로 →
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {b.items.slice(0, 3).map(p => (
                <div key={p.id} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: '#475569' }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.title}
                  </span>
                  <span style={{ flexShrink: 0, color: '#94a3b8' }}>{b.metric(p)}</span>
                </div>
              ))}
              {b.items.length > 3 && (
                <span style={{ fontSize: 11.5, color: '#94a3b8' }}>외 {b.items.length - 3}건</span>
              )}
            </div>
          </div>
        ))}
        {buckets.every(b => b.items.length === 0) && (
          <p style={{ textAlign: 'center', padding: '16px 0', fontSize: 13.5, fontWeight: 700, color: '#64748b' }}>
            지금 급한 일이 없어요 🎉
          </p>
        )}

        {/* 검색 급상승 — 데이터가 아직 며칠치뿐이라 자리만 비워 둔다 */}
        <div style={{ border: '1px dashed #e2e8f0', borderRadius: 10, padding: '11px 13px' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: '#94a3b8' }}>
            🚀 최근 검색 급상승 상품 — 데이터가 더 쌓이면 여기 보여요
          </span>
        </div>
      </div>
    </div>
  )
}

function FunnelStep({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div style={{ textAlign: 'center', padding: '2px 10px' }}>
      <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: highlight ? '#15803d' : '#0f172a' }}>{value.toLocaleString()}</div>
    </div>
  )
}

function FunnelArrow({ rate }: { rate: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#cbd5e1', minWidth: 44 }}>
      <span style={{ fontSize: 14 }}>→</span>
      <span style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 700 }}>{rate}</span>
    </div>
  )
}

function RevenueBoard({ posts, clicks, sources, onGoFill, onSaved }: {
  posts: Post[]
  clicks: Record<string, Record<string, number>>
  sources: Record<string, Record<string, number>>
  onGoFill: () => void
  onSaved: () => void
}) {
  const [needOnly, setNeedOnly] = useState(true)
  const [linking, setLinking] = useState<Post | null>(null)

  const n = (id: number, k: string) => (clicks[id] || {})[k] || 0
  const searchIn = (id: number) => {
    const row = sources[id] || {}
    return (row.naver_search || 0) + (row.google_search || 0) + (row.other_search || 0)
  }

  const rows = useMemo(() => {
    return posts
      .filter(isPagePublic)
      .map(p => {
        const detail = n(p.id, 'detail')
        const groupbuy = n(p.id, 'groupbuy')
        const coupang = n(p.id, 'coupang')
        const naver = n(p.id, 'naver')
        return {
          post: p,
          detail,
          groupbuy,
          coupang,
          naver,
          search: searchIn(p.id),
          // 상세조회 대비 "어디로든 나간" 클릭(공구·쿠팡·네이버 전부) 비율 — 이 상품이
          // 보기만 하고 마는지, 실제로 눌러서 나가는지를 한눈에 본다
          ctr: detail > 0 ? (groupbuy + coupang + naver) / detail * 100 : null,
          linked: hasPurchaseLink(p),
          broken: brokenPurchaseLinks(p).length > 0,
          // 대체 상품만 있고 동일 상품은 없는 상태 — "없음"이라고 하면 이미 채운 걸 또 채우려 든다
          hasAlt: alternativeLinks(p).length > 0,
          ended: isExpired(p),
        }
      })
      .filter(r => r.detail > 0 || r.groupbuy > 0)
      .sort((a, b) => b.detail - a.detail)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, clicks, sources])

  // 수익화가 필요한 것 — 사람이 보고 있는데 나갈 곳이 없는 상품.
  // 마감 공구가 먼저다. 진행 중 공구는 공구 자체가 출구라 급하지 않고, 꿀딜에 대체 구매처를
  // 붙이는 건 "제일 싸다"고 판정해 놓고 다른 데로 보내는 모양이라 따로 판단이 필요하다.
  // 대체 상품만 있고 동일 상품은 없는 것도 "채웠다"로 친다 — hasAlt를 안 빼면 배지엔
  // "대체 상품"이라고 뜨면서 정작 이 목록엔 계속 남아 "링크 없음"을 또 채우라고 조르게 된다
  const need = rows.filter(r => !r.linked && !r.hasAlt && r.detail > 0)
  const list = needOnly ? need : rows
  const lost = need.filter(r => r.ended).reduce((s, r) => s + r.detail, 0)

  const th: React.CSSProperties = { padding: '8px 10px', fontSize: 11.5, fontWeight: 700, color: '#64748b', textAlign: 'right', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '9px 10px', fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap', borderTop: '1px solid #f1f5f9' }

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0' }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>수익화 현황</h2>
      <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7, marginBottom: 14 }}>
        최근 14일 기준이에요. 돈이 되는 건 <strong>쿠팡·네이버 클릭</strong>뿐입니다 — 공구 클릭은 판매자 링크라 수수료가 없어요.
        {lost > 0 && <> 지금 <strong>마감됐는데 살 곳이 없는 공구</strong>가 조회 {lost}회를 받고 그대로 내보내고 있어요.</>}
        {rows.some(r => r.broken) && (
          <> <strong style={{ color: '#b45309' }}>링크 오류 {rows.filter(r => r.broken).length}건</strong>이 있어요 —
          주소 자리에 상품명이 들어간 것들이라 고객에게 안 보입니다.</>
        )}
        <br />
        <span style={{ color: '#94a3b8' }}>검색유입 열은 오늘부터 쌓입니다 — 지난 기록은 상품과 안 묶여 있어서 소급이 안 돼요.
        클릭률은 상세조회 대비 (공구·쿠팡·네이버 클릭 합) 비율이에요 — 어디로든 나갔는지만 보고, 실제 구매 여부는 몰라요.</span>
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={() => setNeedOnly(true)}
          style={{ padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
            background: needOnly ? '#dc2626' : '#e2e8f0', color: needOnly ? '#fff' : '#475569' }}>
          수익화 필요 {need.length}
        </button>
        <button onClick={() => setNeedOnly(false)}
          style={{ padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
            background: !needOnly ? '#475569' : '#e2e8f0', color: !needOnly ? '#fff' : '#475569' }}>
          전체 {rows.length}
        </button>
        <button onClick={onGoFill}
          style={{ marginLeft: 'auto', padding: '7px 14px', borderRadius: 8, border: '1px solid #cbd5e1',
            background: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#475569' }}>
          채우기 화면으로
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>상품</th>
              <th style={th}>상세조회</th>
              <th style={th}>검색유입</th>
              <th style={th}>공구 클릭</th>
              <th style={th}>쿠팡</th>
              <th style={th}>네이버</th>
              <th style={th}>클릭률</th>
              <th style={{ ...th, textAlign: 'center' }}>제휴링크</th>
            </tr>
          </thead>
          <tbody>
            {list.map(r => (
              <tr key={r.post.id}>
                <td style={{ ...td, textAlign: 'left', maxWidth: 320 }}>
                  <a href={`/post/${r.post.id}`} target="_blank" rel="noreferrer"
                    style={{ color: '#1e293b', fontWeight: 600, textDecoration: 'none' }}>
                    {r.post.title}
                  </a>
                  <span style={{ marginLeft: 6, fontSize: 11, color: r.ended ? '#dc2626' : '#22c55e', fontWeight: 700 }}>
                    {r.ended ? '마감' : '진행'}
                  </span>
                </td>
                <td style={{ ...td, fontWeight: 700 }}>{r.detail || '–'}</td>
                <td style={td}>{r.search || '–'}</td>
                <td style={td}>{r.groupbuy || '–'}</td>
                <td style={{ ...td, color: r.coupang ? '#0f172a' : '#cbd5e1' }}>{r.coupang || '–'}</td>
                <td style={{ ...td, color: r.naver ? '#0f172a' : '#cbd5e1' }}>{r.naver || '–'}</td>
                <td style={{ ...td, fontWeight: 700, color: r.ctr === null ? '#cbd5e1' : r.ctr >= 20 ? '#15803d' : '#0f172a' }}>
                  {r.ctr === null ? '–' : `${r.ctr.toFixed(1)}%`}
                </td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <button onClick={() => setLinking(r.post)}
                    title={r.linked ? '링크를 고칩니다' : '여기서 바로 넣습니다'}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px 6px',
                      borderRadius: 6, fontSize: 11.5, fontWeight: 700,
                      color: r.linked ? '#15803d' : r.broken ? '#b45309' : r.hasAlt ? '#92400e' : '#dc2626',
                      textDecoration: r.linked ? 'none' : 'underline' }}>
                    {r.linked ? '있음' : r.broken ? '링크 오류' : r.hasAlt ? '대체 상품' : '없음'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {linking && (
          <PurchaseLinkModal post={linking} onClose={() => setLinking(null)} onSaved={onSaved} />
        )}
        {list.length === 0 && (
          <p style={{ textAlign: 'center', padding: '24px 0', fontSize: 14, fontWeight: 700, color: '#64748b' }}>
            해당하는 상품이 없어요
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * 인플루언서 확산 후보 — "오늘 누구에게 연락하지?"를 매번 다시 고민하지 않게, 조건에
 * 맞는 상품을 자동으로 추려서 하루 5~10건만 보여준다.
 *
 * 조건: 진행 중(마감 아님) + 가격비교 완료(등급이 매겨졌다는 뜻) + 꿀딜/괜찮딜만.
 * 아쉬운딜·판정 대기는 절대 넣지 않는다 — "홍보해 주세요"가 아니라 "가격을 확인해봤는데
 * 정말 좋은 딜이라 알려드립니다"로 접근해야, 인플루언서·판매자에게도 꿀공구가
 * 광고 매체가 아니라 객관적인 가격 검증 서비스로 보인다(사장님 기준).
 *
 * 정렬: ① 할인폭 큼 ② 상세조회+공구클릭 많음 ③ 아직 연락 안 한 것 우선.
 *
 * 이미지·DM 문구를 새로 만들지 않는다 — 공유 이미지는 이미 있는 /api/og/deal/[id]를
 * 열기만 하고, DM 문구는 클립보드에 복사할 템플릿 하나만 준비한다.
 */
const OUTREACH_LABEL: Record<string, string> = {
  none: '미전달', sent: '전달완료', confirmed: '공유확인', converted: '유입발생',
}
const OUTREACH_ORDER = ['none', 'sent', 'confirmed', 'converted'] as const

function OutreachBoard({ posts, detailViews, clickBreakdown, onSaved }: {
  posts: Post[]
  detailViews: Record<string, number>
  clickBreakdown: Record<string, Record<string, number>>
  onSaved: () => void
}) {
  const [showAll, setShowAll] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)

  const views = (id: number) => detailViews[id] || 0
  const clicks = (id: number) => (clickBreakdown[id] || {}).groupbuy || 0

  const rows = useMemo(() => {
    return posts
      .filter(p => isCustomerVisible(p) && !isExpired(p) && p.influencer_name)
      .map(p => {
        const v = getDealVerdict(p)
        return { post: p, verdict: v, discountRate: v.discountRate ?? 0, engagement: views(p.id) + clicks(p.id) }
      })
      .filter(r => r.verdict.display.key === 'honey' || r.verdict.display.key === 'good')
      .sort((a, b) => {
        if (b.discountRate !== a.discountRate) return b.discountRate - a.discountRate
        if (b.engagement !== a.engagement) return b.engagement - a.engagement
        const sa = a.post.outreach_status || 'none'
        const sb = b.post.outreach_status || 'none'
        if (sa === 'none' && sb !== 'none') return -1
        if (sb === 'none' && sa !== 'none') return 1
        return 0
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, detailViews, clickBreakdown])

  const pending = rows.filter(r => (r.post.outreach_status || 'none') === 'none')
  const list = showAll ? rows : pending.slice(0, 10)

  async function setStatus(post: Post, status: string) {
    setSavingId(post.id)
    try {
      await fetch(`/api/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outreach_status: status, outreach_updated_at: new Date().toISOString() }),
      })
      onSaved()
    } finally {
      setSavingId(null)
    }
  }

  function trackingUrl(post: Post) {
    const campaign = encodeURIComponent((post.account || '').replace('@', ''))
    return `${SITE_URL}/post/${post.id}?utm_source=influencer_dm&utm_medium=referral&utm_campaign=${campaign}`
  }

  function dmText(post: Post, rate: number) {
    const pct = Math.round(Math.abs(rate) * 100)
    const name = post.influencer_name || (post.account || '').replace('@', '')
    return `안녕하세요 ${name}님! 꿀공구에서 가격을 확인해봤는데, 지금 진행 중이신 '${post.title}' 공구가 다른 곳보다 ${pct}% 더 저렴한 진짜 좋은 딜이더라고요 🍯\n저희가 가격 검증한 자료 공유드려요: ${trackingUrl(post)}`
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(key)
      setTimeout(() => setCopiedId(c => (c === key ? null : c)), 1500)
    }).catch(() => {})
  }

  const th: React.CSSProperties = { padding: '8px 10px', fontSize: 11.5, fontWeight: 700, color: '#64748b', textAlign: 'right', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '9px 10px', fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap', borderTop: '1px solid #f1f5f9' }

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0' }}>
      <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>인플루언서 확산 후보</h2>
      <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7, marginBottom: 14 }}>
        진행 중 · 가격비교 완료 · <strong>꿀딜/괜찮딜</strong>만 골랐어요(아쉬운딜은 안 보내는 게 원칙이에요).
        할인폭 → 반응(조회+클릭) → 아직 연락 안 한 것 순으로 정렬돼요.
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={() => setShowAll(false)}
          style={{ padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
            background: !showAll ? '#dc2626' : '#e2e8f0', color: !showAll ? '#fff' : '#475569' }}>
          오늘 후보 {Math.min(10, pending.length)}
        </button>
        <button onClick={() => setShowAll(true)}
          style={{ padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
            background: showAll ? '#475569' : '#e2e8f0', color: showAll ? '#fff' : '#475569' }}>
          전체 {rows.length}
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>상품</th>
              <th style={{ ...th, textAlign: 'left' }}>인플루언서</th>
              <th style={th}>판정</th>
              <th style={th}>가격차</th>
              <th style={th}>조회/클릭</th>
              <th style={{ ...th, textAlign: 'center' }}>액션</th>
              <th style={{ ...th, textAlign: 'center' }}>상태</th>
            </tr>
          </thead>
          <tbody>
            {list.map(r => {
              const p = r.post
              return (
                <tr key={p.id}>
                  <td style={{ ...td, textAlign: 'left', maxWidth: 260 }}>
                    <a href={`/post/${p.id}`} target="_blank" rel="noreferrer"
                      style={{ color: '#1e293b', fontWeight: 600, textDecoration: 'none' }}>
                      {p.title}
                    </a>
                  </td>
                  <td style={{ ...td, textAlign: 'left' }}>{p.influencer_name}</td>
                  <td style={td}><GradeBadge display={r.verdict.display} size="sm" /></td>
                  <td style={{ ...td, fontWeight: 700, color: '#dc2626' }}>{Math.round(Math.abs(r.discountRate) * 100)}%↓</td>
                  <td style={td}>{views(p.id)} / {clicks(p.id)}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <a href={`/api/og/deal/${p.id}`} target="_blank" rel="noreferrer"
                        title="공유 이미지 만들기"
                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff',
                          fontSize: 11, fontWeight: 600, color: '#475569', textDecoration: 'none' }}>
                        이미지
                      </a>
                      <button onClick={() => copy(dmText(p, r.discountRate), `dm-${p.id}`)}
                        title="DM 문구 복사"
                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1',
                          background: copiedId === `dm-${p.id}` ? '#dcfce7' : '#fff',
                          cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#475569' }}>
                        {copiedId === `dm-${p.id}` ? '복사됨' : 'DM 복사'}
                      </button>
                      <button onClick={() => copy(trackingUrl(p), `link-${p.id}`)}
                        title="추적링크 복사"
                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1',
                          background: copiedId === `link-${p.id}` ? '#dcfce7' : '#fff',
                          cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#475569' }}>
                        {copiedId === `link-${p.id}` ? '복사됨' : '링크 복사'}
                      </button>
                    </div>
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <select
                      value={p.outreach_status || 'none'}
                      disabled={savingId === p.id}
                      onChange={e => setStatus(p, e.target.value)}
                      style={{ fontSize: 12, fontWeight: 700, padding: '4px 6px', borderRadius: 6, border: '1px solid #cbd5e1',
                        color: (p.outreach_status || 'none') === 'none' ? '#dc2626' : '#15803d' }}>
                      {OUTREACH_ORDER.map(s => <option key={s} value={s}>{OUTREACH_LABEL[s]}</option>)}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {list.length === 0 && (
          <p style={{ textAlign: 'center', padding: '24px 0', fontSize: 14, fontWeight: 700, color: '#64748b' }}>
            지금 조건에 맞는 후보가 없어요
          </p>
        )}
      </div>
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
function VerdictFiller({ posts, views, onSaved, initialMode }: {
  posts: Post[]
  views: Record<string, number>
  onSaved: () => void
  /** 상위(관리자 첫 화면 우선순위)에서 특정 세부 탭을 지정해 열 때 쓴다. 기본은 '미확인' */
  initialMode?: CompareState | 'ended' | 'deadline'
}) {
  const [mode, setMode] = useState<CompareState | 'ended' | 'deadline'>(initialMode ?? 'unchecked')
  // TodayPriorities에서 다시 '목록으로 →'를 누르면(예: 🔥 다음에 ⚠️) VerdictFiller가 이미
  // 마운트돼 있어 useState 초깃값이 다시 안 먹는다. prop이 바뀌면 따라간다
  useEffect(() => {
    if (initialMode) setMode(initialMode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode])
  // 목록은 전체 2,300건 기준이라 그대로 펼치면 화면이 못 버티고, 고객에게 안 보이는 공구는
  // 채워도 지금 효과가 없다. 기본은 보이는 것만 — 대신 몇 건을 뺐는지 항상 적는다
  const [visibleOnly, setVisibleOnly] = useState(true)

  // 실제로 사람이 보고 있는 순으로 세운다.
  //
  // 판정이 없는 공구가 2,300건이라 "어디부터 채우나"가 실제 손실을 가른다. 최신순·상시딜순은
  // 이론이고, 검색으로 들어와 판정 없는 상세에 착지한 사람 수가 진짜 손실이다 — 실측에서
  // 검색 유입 146명 중 64명(44%)이 판정 없는 페이지에 떨어졌고, 1위 착지 공구 한 건만
  // 채워도 26명이 판정을 보게 된다.
  // 오픈 예정은 채울 수 없다(가격·구매 링크가 아직 없다). 몇 건을 뺐는지는 아래에 적는다
  const upcomingSkipped = posts.filter(p =>
    isCustomerVisible(p) && getPeriodState(p).kind === 'upcoming' && getCompareState(p) === 'unchecked').length

  const groups = useMemo(() => {
    const g: Record<CompareState, Post[]> = { unchecked: [], compared: [], incomparable: [] }
    for (const p of posts) {
      if (getPeriodState(p).kind === 'upcoming') continue
      g[getCompareState(p)].push(p)
    }
    const byTraffic = (a: Post, b: Post) => {
      const av = views[a.id] || 0
      const bv = views[b.id] || 0
      if (av !== bv) return bv - av
      // 조회가 같으면(대부분 0) 기존 기준 — 고객에게 보이는 것 먼저, 그다음 최신
      const ac = isCustomerVisible(a) ? 0 : 1
      const bc = isCustomerVisible(b) ? 0 : 1
      if (ac !== bc) return ac - bc
      return (b.scraped_at || '').localeCompare(a.scraped_at || '')
    }
    for (const k of Object.keys(g) as CompareState[]) g[k].sort(byTraffic)
    return g
  }, [posts, views])

  // 마감된 공구는 검색 유입이 계속 들어오는데 보낼 곳이 없으면 그대로 이탈한다.
  //
  // 조회 많은 순으로 세운다. 마감일 역순이면 "최근에 끝난 것"이 위로 오는데 실제로 사람이
  // 보고 있는 건 그것과 다르다 — 40일 전에 끝난 공구가 조회 34회로 1위다. 마감 공구가 상세
  // 조회의 56%를 받으면서 190건이 살 곳을 못 알려주고 있어서(2026-08-23 실측), 어디부터
  // 채우냐가 그대로 손실 크기를 가른다.
  const ended = posts
    // 대체 상품 링크라도 넣어뒀으면 이미 손본 것이다 — 안 빼면 채워도 계속 이 목록에 남는다
    .filter(p => isPagePublic(p) && isExpired(p) && !hasPurchaseLink(p) && alternativeLinks(p).length === 0)
    .sort((a, b) => {
      const av = views[a.id] || 0
      const bv = views[b.id] || 0
      if (av !== bv) return bv - av
      return (b.deadline || '').localeCompare(a.deadline || '')
    })

  // 마감일을 못 읽은 공구. 이미 자동으로 내려간 것까지 함께 보여준다 — 진짜 상시딜이면
  // 되살려야 하는데, 보이는 것만 걸러 놓으면 되살릴 대상이 화면에서 사라진다
  const deadlineUnknown = posts
    .filter(p => isPagePublic(p) && getPeriodState(p).kind === 'deadline_unknown')
    .sort((a, b) => (views[b.id] || 0) - (views[a.id] || 0))

  const full = mode === 'ended' ? ended : mode === 'deadline' ? deadlineUnknown : groups[mode]
  const skipVisibleFilter = mode === 'ended' || mode === 'deadline'
  const list = visibleOnly && !skipVisibleFilter ? full.filter(isCustomerVisible) : full
  const hidden = full.length - list.length

  const tabs: { key: CompareState | 'ended' | 'deadline'; label: string; color: string }[] = [
    { key: 'unchecked',    label: `${COMPARE_STATE_LABEL.unchecked} ${groups.unchecked.length}`,       color: '#475569' },
    { key: 'incomparable', label: `${COMPARE_STATE_LABEL.incomparable} ${groups.incomparable.length}`, color: '#78716c' },
    { key: 'compared',     label: `${COMPARE_STATE_LABEL.compared} ${groups.compared.length}`,         color: '#15803d' },
    { key: 'deadline',     label: `마감일 미확인 ${deadlineUnknown.length}`,                              color: '#b45309' },
    { key: 'ended',        label: `종료·링크없음 ${ended.length}`,                                       color: '#dc2626' },
  ]

  const blurb: Record<CompareState | 'ended' | 'deadline', React.ReactNode> = {
    unchecked: <>{upcomingSkipped > 0 && <><strong>오픈 예정 {upcomingSkipped}건은 뺐어요</strong> — 아직 안 열려서 가격도 링크도 없어요.<br /></>}아직 아무도 비교가를 안 본 공구예요. <strong>최근 14일 조회가 많은 순</strong>으로 세웠으니 위에서부터 채우면 손실이 제일 빨리 줄어요. 찾아봐도 비교할 상품이 없으면 <strong>비교불가</strong>로 남겨주세요 — 그래야 이 목록에서 빠집니다.</>,
    incomparable: <>찾아본 끝에 비교할 동일상품이 없다고 표시해 둔 공구예요. 나중에 팔기 시작했다면 <strong>다시 확인하기</strong>로 되돌릴 수 있어요.</>,
    compared: <>비교가가 붙어 판정이 나가고 있는 공구예요. 값이 이상하면 여기서 고칠 수 있어요.</>,
    deadline: <>수집기가 <strong>마감일을 못 읽은</strong> 공구예요. 상시딜과 구분이 안 돼서 예전에는 끝난 공구가 계속 진행 중으로 남아 있었어요.
      지금은 시작일(없으면 수집일)로부터 <strong>{DEADLINE_UNKNOWN_DAYS}일</strong>이 지나면 고객 목록에서 자동으로 내려가고 상세는 종료 안내로 바뀝니다.
      마감일을 알면 넣어주시고, 정말 계속 파는 공구면 <strong>상시딜이 맞다</strong>를 눌러주세요.</>,
    ended: <>마감됐는데 &quot;지금 살 수 있는 곳&quot;을 못 알려주는 공구예요. 상세 조회의 절반 이상이 마감 공구에 오는데, 보낼 곳이 없으면 그대로 나갑니다. <strong>최근 14일 조회 많은 순</strong>으로 세웠어요.<br />링크만 넣어도 됩니다 — 가격을 모르면 &quot;가격 확인하기&quot;로 보내요.</>,
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
            ? <EndedFillRow key={p.id} post={p} views={views[p.id] || 0} onSaved={onSaved} />
            : mode === 'deadline'
            ? <DeadlineFillRow key={p.id} post={p} views={views[p.id] || 0} onSaved={onSaved} />
            : <CompareFillRow key={p.id} post={p} allPosts={posts} views={views[p.id] || 0} onSaved={onSaved} />)}
        </div>
      )}
    </div>
  )
}

const fillInput: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0',
  outline: 'none', width: '100%', boxSizing: 'border-box',
}

/** 동일 상품/같은 브랜드/비슷한 상품 세 단계 선택. EndedFillRow·PurchaseLinkModal 둘 다 쓴다.
 * relation을 고르면 kind(same/alternative, 판정 가드레일)가 같이 정해지고, reason이 비어
 * 있거나 이전 기본 문구 그대로면 새 relation의 기본 문구로 채워준다 — 관리자가 직접 고친
 * 문구는 안 건드린다. */
function RelationPicker({ relation, reason, onChange }: {
  relation: PurchaseLinkRelation
  reason: string
  onChange: (relation: PurchaseLinkRelation, reason: string) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {(['same', 'same_brand', 'similar'] as PurchaseLinkRelation[]).map(rel => {
        const active = relation === rel
        const label = rel === 'same' ? '동일 상품' : rel === 'same_brand' ? '같은 브랜드 다른 상품' : '비슷한 상품'
        return (
          <button key={rel} type="button"
            onClick={() => {
              const reasonUntouched = !reason.trim() || Object.values(RELATION_DEFAULT_REASON).includes(reason.trim())
              onChange(rel, reasonUntouched ? RELATION_DEFAULT_REASON[rel] : reason)
            }}
            style={{ flex: 1, padding: '6px 8px', borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
              border: `1.5px solid ${active ? (rel === 'same' ? '#6366f1' : '#b45309') : '#e2e8f0'}`,
              background: active ? (rel === 'same' ? '#eef2ff' : '#fffbeb') : '#fff',
              color: active ? (rel === 'same' ? '#4338ca' : '#b45309') : '#94a3b8' }}>
            {label}
          </button>
        )
      })}
    </div>
  )
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
/** 구매 링크의 판매처 도메인 — 어디로 나가는지 보고 누르게 한다 */
function linkHost(url?: string | null): string {
  try { return new URL(url || '').hostname.replace(/^www\.|^m\./, '') } catch { return '' }
}

/**
 * "이 공구는 이미 끝났다"를 한 번에 표시한다.
 *
 * 마감일을 모르는 채로 끝난 걸 알게 되는 일이 잦다 — 판매 페이지를 열어보고 안다. 예전에는
 * 이럴 때 21일이 지나기를 기다리거나 없는 마감일을 지어 넣는 수밖에 없었다. ended_at은
 * 날짜를 주장하지 않고 "확인했다"는 사실만 남긴다. 종료 안내는 마감일 없이도 정상으로 뜬다.
 */
function EndedNowButton({ post, onSaved }: { post: Post; onSaved: () => void }) {
  const [busy, setBusy] = useState(false)
  if (post.ended_at) {
    return (
      <button onClick={async () => { setBusy(true); await fetch(`/api/posts/${post.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ended_at: null }) }); setBusy(false); onSaved() }}
        disabled={busy}
        style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff',
          cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#475569' }}>
        {busy ? '되돌리는 중…' : '종료 표시 취소'}
      </button>
    )
  }
  return (
    <button onClick={async () => { setBusy(true); await fetch(`/api/posts/${post.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ended_at: new Date().toISOString() }) }); setBusy(false); onSaved() }}
      disabled={busy}
      title="마감일을 몰라도 됩니다 — 고객 화면은 날짜 없이 종료 안내만 보여줍니다"
      style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff',
        cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#b91c1c' }}>
      {busy ? '처리 중…' : '이 공구 끝났어요'}
    </button>
  )
}

/**
 * 채우기 한 줄의 작업 도구.
 *
 * 실제 작업 순서는 "공구 판매 페이지에서 구성을 확인 → 같은 구성을 네이버·쿠팡에서 찾기 →
 * 가격 입력"이다. 그런데 판매 링크가 화면에 아예 없어서 1단계를 다른 창에서 따로 찾아야
 * 했다 — 미확인 34건 전부 purchase_url을 갖고 있는데도 그랬다. 순서대로 놓는다.
 *
 * 검색은 새 탭으로 바로 연다. 쿠팡은 파트너스 안에서 찾아야 추적 링크를 만들 수 있어서
 * 일반 쿠팡이 아니라 partners.coupang.com으로 보낸다.
 */
function FillTools({ post }: { post: Post }) {
  const [copied, setCopied] = useState(false)
  const q = partnerSearchQuery(post)
  const host = linkHost(post.purchase_url)

  const linkBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8,
    border: '1px solid #cbd5e1', background: '#fff', fontSize: 12.5, fontWeight: 600, color: '#475569',
    textDecoration: 'none', whiteSpace: 'nowrap',
  }

  return (
    <div style={{ marginBottom: 10 }}>
      {post.purchase_url && (
        <a href={post.purchase_url} target="_blank" rel="noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', borderRadius: 8,
            background: '#eef2ff', border: '1px solid #c7d2fe', textDecoration: 'none', marginBottom: 6 }}>
          <Package size={15} strokeWidth={2.5} style={{ color: '#4f46e5', flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#3730a3' }}>공구 판매 페이지 열기</span>
          {host && <span style={{ fontSize: 11.5, color: '#6366f1', marginLeft: 'auto' }}>{host}</span>}
        </a>
      )}

      <button type="button"
        onClick={() => { navigator.clipboard?.writeText(q).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1400) }}
        title="검색어를 복사합니다 — 검색창에 붙여넣으세요"
        style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', marginBottom: 6,
          padding: '7px 10px', borderRadius: 8, border: '1px dashed #cbd5e1', background: copied ? '#dcfce7' : '#f8fafc',
          cursor: 'pointer', fontSize: 12.5, color: '#475569' }}>
        <Copy size={13} strokeWidth={2.5} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{q}</span>
        <span style={{ flexShrink: 0, color: copied ? '#15803d' : '#94a3b8', fontWeight: 700 }}>{copied ? '복사됨' : '복사'}</span>
      </button>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <a href={`https://search.shopping.naver.com/search/all?query=${encodeURIComponent(q)}`}
          target="_blank" rel="noreferrer" style={linkBtn}>
          <Search size={13} strokeWidth={2.5} />네이버쇼핑에서 찾기
        </a>
        <a href={`https://partners.coupang.com/#/product/search?keyword=${encodeURIComponent(q)}`}
          target="_blank" rel="noreferrer" style={linkBtn}>
          <Search size={13} strokeWidth={2.5} />쿠팡 파트너스에서 찾기
        </a>
      </div>
    </div>
  )
}

function FillRowHead({ post, mode, badge }: { post: Post; mode: 'pending' | 'ended'; badge?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
      <div style={{ width: 60, height: 60, borderRadius: 8, background: '#f1f5f9', flexShrink: 0, overflow: 'hidden' }}>
        {post.img
          ? <img src={post.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#cbd5e1' }}><ImageOff size={18} /></div>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* 말줄임 하지 않는다 — "리라 그루브 & 울리 페인트 스틱"처럼 구성이 제목에 들어 있어서,
            잘리면 뭘 비교해야 하는지 알 수 없다 */}
        <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.45, wordBreak: 'break-word' }}>{post.title}</div>
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
function CompareFillRow({ post, allPosts, views, onSaved }: { post: Post; allPosts: Post[]; views: number; onSaved: () => void }) {
  const state = getCompareState(post)
  const existingLinks = normalizePurchaseLinks(post)
  const existingCoupang = existingLinks.find(l => l.platform === 'coupang')
  const [orig, setOrig]           = useState(String(post.origPrice ?? ''))
  const [showOrig, setShowOrig]   = useState(!!post.origPrice)
  const [market, setMarket]       = useState(String(post.market_price ?? ''))
  const [coupang, setCoupang]     = useState(String(existingCoupang?.price ?? ''))
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

  /**
   * 쿠팡에서 찾은 가격은 purchase_links에 넣는다.
   *
   * market_price에 넣으면 고객 화면에 "네이버 최저가"로 표시된다 — 쿠팡에서 찾은 값인데
   * 네이버라고 말하는 셈이다. purchase_links는 가격만 있고 url이 없으면 판정에는 '쿠팡'으로
   * 들어가되 구매 버튼으로 뜨지 않고 제휴 고지도 안 붙는다(visiblePurchaseLinks가 url을
   * 요구한다). 비교 전용 값에 정확히 맞는 자리다.
   *
   * 이미 url이 있는 쿠팡 링크(진짜 제휴 링크)는 가격만 고치고 url·노출 설정은 건드리지 않는다.
   */
  function mergedLinks(): PurchaseLink[] {
    const price = parseInt(coupang) || 0
    const rest = existingLinks.filter(l => l.platform !== 'coupang')
    if (!price) return existingCoupang?.url ? [...rest, { ...existingCoupang, price: null }] : rest
    if (existingCoupang) return [...rest, { ...existingCoupang, price }]
    return [...rest, { platform: 'coupang' as const, url: '', price, visible: false, checked_at: new Date().toISOString() }]
  }

  // 저장하고 목록에서 다시 찾아 확인하는 왕복을 없애기 위해 입력하는 동안 등급을 보여준다
  const preview = (() => {
    if (!post.price) return null
    const o = parseInt(orig) || 0, m = parseInt(market) || 0, cp = parseInt(coupang) || 0
    if (!o && !m && !cp) return null
    return getDealVerdict({
      ...post, origPrice: o || null, market_price: m || null, purchase_links: mergedLinks(),
    } as Post).display
  })()

  async function patch(body: Record<string, unknown>) {
    setSaving(true)
    await fetch(`/api/posts/${post.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    setSaving(false); setDone(true); onSaved()
  }

  const canSave = parseInt(orig) > 0 || parseInt(market) > 0 || parseInt(coupang) > 0
  // 값이 실제로 붙었으면 "비교할 게 없다"는 더 이상 사실이 아니므로 표시를 함께 지운다
  const savePrice = () => patch({
    origPrice: parseInt(orig) || null,
    market_price: parseInt(market) || null,
    market_url: marketUrl.trim() || null,
    purchase_links: mergedLinks(),
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

      {views > 0 && (
        <p style={{ fontSize: 11.5, color: '#475569', margin: '0 0 8px' }}>
          최근 14일 <strong style={{ color: '#0f172a' }}>{views}명</strong>이 이 공구 상세를 봤어요
          {getCompareState(post) !== 'compared' && ' — 판정 없이 나갔습니다'}
        </p>
      )}

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

      <FillTools post={post} />

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
        <input type="number" value={market} onChange={e => { setMarket(e.target.value); setPicked(null); setDone(false) }}
          placeholder="네이버에서 찾은 가격" style={{ ...fillInput, fontSize: 13 }} />
        <input type="number" value={coupang} onChange={e => { setCoupang(e.target.value); setDone(false) }}
          placeholder="쿠팡에서 찾은 가격" style={{ ...fillInput, fontSize: 13 }} />
      </div>
      <input type="url" value={marketUrl} onChange={e => setMarketUrl(e.target.value)}
        placeholder="네이버쇼핑 링크 (선택 — 근거로 보여줄 때만)" style={{ ...fillInput, fontSize: 12, marginTop: 6 }} />
      <p style={{ fontSize: 11, color: '#94a3b8', margin: '6px 0 0', lineHeight: 1.6 }}>
        둘 다 비교용이라 구매 버튼으로 안 뜨고 제휴 고지도 안 붙어요. 고객 화면엔 각각
        &quot;네이버 최저가&quot;, &quot;쿠팡&quot;으로 표시됩니다.
      </p>

      {showOrig ? (
        <input type="number" value={orig} onChange={e => { setOrig(e.target.value); setDone(false) }}
          placeholder="정가 (공구 게시물에 적힌 값 — 판매자가 쓴 값이라 근거가 약해요)"
          style={{ ...fillInput, fontSize: 12.5, marginTop: 6 }} />
      ) : (
        <button type="button" onClick={() => setShowOrig(true)}
          style={{ marginTop: 6, padding: 0, border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 11.5, color: '#94a3b8', fontWeight: 600 }}>
          + 정가도 입력
        </button>
      )}

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
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <EndedNowButton post={post} onSaved={onSaved} />
          {state === 'incomparable' ? null : (
            <button onClick={() => setAskNone(true)}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #d6d3d1', background: '#fff',
                cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#57534e' }}>
              비교할 동일상품이 없다
            </button>
          )}
          </div>
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

/**
 * 마감일 미확인 한 행 — 마감일을 넣거나 "상시딜이 맞다"로 확정한다.
 *
 * 거짓 날짜를 만들지 않으려고 "이미 끝났다" 같은 버튼은 두지 않았다. 실제 마감일을 모르는데
 * 오늘 날짜를 넣으면 화면에 없는 마감일이 적힌다. 모르면 그냥 두면 되고, 기간이 지나면
 * 자동으로 내려간다.
 */
function DeadlineFillRow({ post, views, onSaved }: { post: Post; views: number; onSaved: () => void }) {
  const state = getPeriodState(post)
  const since = state.kind === 'deadline_unknown' ? state.daysSince : null
  const left = since === null ? null : DEADLINE_UNKNOWN_DAYS - since
  const [deadline, setDeadline] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function patch(body: Record<string, unknown>) {
    setSaving(true)
    await fetch(`/api/posts/${post.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    setSaving(false); setDone(true); onSaved()
  }

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: done ? '#f0fdf4' : '#fff' }}>
      <FillRowHead post={post} mode="pending" />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: '#64748b', marginBottom: 10 }}>
        {post.ended_at && <span style={{ color: '#b91c1c', fontWeight: 700 }}>종료 확인됨 — 고객에게 안 보임</span>}
        <span>{post.start_date ? `${fmtDate(post.start_date)} 시작` : `${fmtDate(post.scraped_at)} 수집`}</span>
        {since !== null && <span><strong style={{ color: '#0f172a' }}>{since}일째</strong></span>}
        {left !== null && (
          left >= 0
            ? <span style={{ color: '#b45309', fontWeight: 700 }}>{left}일 뒤 자동으로 내려감</span>
            : <span style={{ color: '#dc2626', fontWeight: 700 }}>이미 내려감 — 고객에게 안 보임</span>
        )}
        {views > 0 && <span>최근 14일 <strong style={{ color: '#0f172a' }}>{views}명</strong> 조회</span>}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="date" value={deadline} onChange={e => { setDeadline(e.target.value); setDone(false) }}
          style={{ ...fillInput, fontSize: 13, width: 'auto', flex: '1 1 160px' }} />
        <button onClick={() => patch({ deadline })} disabled={!deadline || saving}
          style={{ padding: '7px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
            cursor: deadline && !saving ? 'pointer' : 'not-allowed',
            background: done ? '#dcfce7' : deadline ? '#6366f1' : '#e2e8f0',
            color: done ? '#15803d' : deadline ? '#fff' : '#94a3b8' }}>
          {saving ? '저장 중…' : done ? '저장됨' : '마감일 저장'}
        </button>
        <button onClick={() => patch({ is_evergreen_deal: true })} disabled={saving}
          style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff',
            cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#475569' }}>
          상시딜이 맞다
        </button>
        <EndedNowButton post={post} onSaved={onSaved} />
      </div>
      <p style={{ fontSize: 11, color: '#94a3b8', margin: '6px 0 0' }}>
        마감일을 모르는데 끝난 걸 아신다면 「이 공구 끝났어요」를 눌러주세요 — 없는 날짜를 넣지 않고 종료로만 표시합니다.
      </p>
    </div>
  )
}

/** 종료·링크없음 — 제휴 대체 구매 링크를 채운다. 고객 화면에 버튼 + 고지 문구로 뜬다. */
function EndedFillRow({ post, views, onSaved }: { post: Post; views: number; onSaved: () => void }) {
  const existing = normalizePurchaseLinks(post)
  const sameExisting = existing.filter(isSameProduct)
  const altExisting = existing.filter(l => !isSameProduct(l))

  const [coupangUrl, setCoupangUrl] = useState(sameExisting.find(l => l.platform === 'coupang')?.url ?? '')
  const [coupang, setCoupang] = useState(String(sameExisting.find(l => l.platform === 'coupang')?.price ?? ''))
  const [naverUrl, setNaverUrl] = useState(sameExisting.find(l => l.platform === 'naver')?.url ?? '')
  const [naver, setNaver] = useState(String(sameExisting.find(l => l.platform === 'naver')?.price ?? ''))

  // 똑같은 상품을 못 찾을 때만 쓴다 — "오르다 매쓰파워빌더스"·"르베르360유모카"처럼 니치
  // 브랜드는 쿠팡 파트너스에 동일 상품 자체가 없는 경우가 실제로 있었다(D-030에서 예상했던
  // 신호). 접어 두는 이유는 같은 상품 링크가 있으면 이 칸을 볼 일이 없어서다.
  const [showAlt, setShowAlt] = useState(altExisting.length > 0)
  const [altUrl, setAltUrl] = useState(altExisting[0]?.url ?? '')
  const [altPrice, setAltPrice] = useState(String(altExisting[0]?.price ?? ''))
  const [altRelation, setAltRelation] = useState<PurchaseLinkRelation>(altExisting[0]?.relation ?? 'similar')
  const [altProductName, setAltProductName] = useState(altExisting[0]?.productName ?? '')
  const [altReason, setAltReason] = useState(altExisting[0]?.reason ?? RELATION_DEFAULT_REASON[altExisting[0]?.relation ?? 'similar'])
  const [altMemo, setAltMemo] = useState(altExisting[0]?.adminMemo ?? '')

  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const canSave = !!(coupangUrl.trim() || naverUrl.trim() || altUrl.trim())
  async function save() {
    setSaving(true)
    const now = new Date().toISOString()
    const links = []
    if (coupangUrl.trim()) links.push({ platform: 'coupang' as const, kind: 'same' as const, relation: 'same' as const, url: coupangUrl.trim(), price: parseInt(coupang) || null, visible: true, checked_at: now })
    if (naverUrl.trim())   links.push({ platform: 'naver' as const, kind: 'same' as const, relation: 'same' as const, url: naverUrl.trim(), price: parseInt(naver) || null, visible: true, checked_at: now })
    if (altUrl.trim())     links.push({
      platform: 'coupang' as const, kind: 'alternative' as const, relation: altRelation,
      url: altUrl.trim(), price: parseInt(altPrice) || null,
      productName: altProductName.trim() || null, reason: altReason.trim() || null, adminMemo: altMemo.trim() || null,
      visible: true, checked_at: now,
    })
    await fetch(`/api/posts/${post.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purchase_links: links }),
    })
    setSaving(false); setDone(true); onSaved()
  }

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: done ? '#f0fdf4' : '#fff' }}>
      <FillRowHead post={post} mode="ended"
        badge={altExisting.length > 0 ? (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e', background: '#fef3c7', borderRadius: 6, padding: '2px 8px' }}>
            대체 상품 안내 중
          </span>
        ) : undefined} />
      {views > 0 && (
        <p style={{ fontSize: 11.5, color: '#475569', margin: '0 0 8px' }}>
          최근 14일 <strong style={{ color: '#0f172a' }}>{views}명</strong>이 이 페이지에 들어왔어요 — 살 곳을 못 알려주고 그대로 나갔습니다
        </p>
      )}
      <FillTools post={post} />
      <div className="admin-2col" style={{ gap: 8 }}>
        <input type="url" value={coupangUrl} onChange={e => { setCoupangUrl(e.target.value); setDone(false) }}
          placeholder="쿠팡 파트너스 링크 (동일 상품)" style={{ ...fillInput, fontSize: 13 }} />
        <input type="url" value={naverUrl} onChange={e => { setNaverUrl(e.target.value); setDone(false) }}
          placeholder="네이버 제휴 링크 (동일 상품)" style={{ ...fillInput, fontSize: 13 }} />
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

      {showAlt ? (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: '#fafaf9', border: '1px solid #e7e5e4' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#44403c', marginBottom: 7 }}>
            똑같은 상품을 못 찾았을 때 — 비슷한 상품
          </div>
          <RelationPicker relation={altRelation} reason={altReason}
            onChange={(rel, reason) => { setAltRelation(rel); setAltReason(reason); setDone(false) }} />
          <input type="url" value={altUrl} onChange={e => { setAltUrl(e.target.value); setDone(false) }}
            placeholder="쿠팡 파트너스 링크 (다른 상품)" style={{ ...fillInput, fontSize: 13, marginTop: 6 }} />
          <div className="admin-2col" style={{ gap: 8, marginTop: 6 }}>
            <input type="number" value={altPrice} onChange={e => setAltPrice(e.target.value)}
              placeholder="가격 (선택)" style={{ ...fillInput, fontSize: 12 }} />
            <input value={altProductName} onChange={e => setAltProductName(e.target.value)}
              placeholder="상품명 (고객 화면에 노출)" style={{ ...fillInput, fontSize: 12 }} />
          </div>
          <input value={altReason} onChange={e => setAltReason(e.target.value)}
            placeholder="추천 이유 (고객 화면 문구)" style={{ ...fillInput, fontSize: 12, marginTop: 6 }} />
          <textarea value={altMemo} onChange={e => setAltMemo(e.target.value)}
            placeholder="내부 메모 (관리자만 봐요 — 예: 브랜드가 달라요, 팩토는 어때요)" rows={2}
            style={{ marginTop: 6, width: '100%', fontSize: 12, fontFamily: 'inherit', padding: '8px 10px', border: '1.5px solid #fde68a', background: '#fffbeb', borderRadius: 8, resize: 'vertical', boxSizing: 'border-box' }} />
          <p style={{ fontSize: 11, color: '#a8a29e', margin: '8px 0 0', lineHeight: 1.6 }}>
            고객 화면에 &quot;같은 상품은 못 찾았어요&quot;라고 먼저 밝히고, 판정(가격 비교)에는
            안 쓰여요. 다른 상품을 같은 상품으로 속이지 않기 위해서예요.
          </p>
          {!altExisting.length && (
            <button onClick={() => { setShowAlt(false); setAltUrl(''); setAltPrice(''); setAltProductName(''); setAltReason(RELATION_DEFAULT_REASON.similar); setAltMemo(''); setAltRelation('similar') }}
              style={{ marginTop: 8, padding: 0, border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 11.5, color: '#94a3b8', fontWeight: 600 }}>
              접기
            </button>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => setShowAlt(true)}
          style={{ marginTop: 8, padding: 0, border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 11.5, color: '#94a3b8', fontWeight: 600 }}>
          + 똑같은 상품을 못 찾았어요 — 비슷한 상품으로 안내
        </button>
      )}

      <SaveButton canSave={canSave} saving={saving} done={done} onClick={save} />
    </div>
  )
}
