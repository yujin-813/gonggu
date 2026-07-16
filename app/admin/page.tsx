'use client'
import { useState, useEffect, useCallback } from 'react'
import type { Post, ScraperStatus, InfluencerSource } from '@/lib/types'
import { daysLeft, periodLabel, isExpired } from '@/lib/period'
import AddPostModal from '@/components/AddPostModal'

interface DayStat { date: string; visitors: number; events: Record<string, number> }

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
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)', width: 340,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🛍️</div>
          <div style={{ fontWeight: 700, fontSize: 20, color: '#1e293b' }}>딜조아 관리자</div>
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
  fashion: '👗 패션', beauty: '💄 뷰티', food: '🍱 식품',
  life: '🏠 생활용품', kids: '🧸 유아동', health: '💊 건강',
  pet: '🐾 반려동물', digital: '📱 디지털',
}

export default function AdminPage() {
  const [authed, setAuthed]           = useState<boolean | null>(null)  // null = 확인 중
  const [posts, setPosts]             = useState<Post[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingPost, setEditingPost]   = useState<Post | null>(null)
  const [loading, setLoading]         = useState(true)
  const [filter, setFilter]           = useState<'all' | 'candidate' | 'needs_review' | 'ready' | 'published' | 'excluded' | 'upcoming'>('all')
  const [searchQ, setSearchQ]         = useState('')
  const [analytics, setAnalytics]     = useState<DayStat[]>([])
  const [includeKws, setIncludeKws]   = useState<string[]>([])
  const [excludeKws, setExcludeKws]   = useState<string[]>([])
  const [newInclude, setNewInclude]   = useState('')
  const [newExclude, setNewExclude]   = useState('')
  const [influencerSources, setInfluencerSources] = useState<InfluencerSource[]>([])
  const [newSourceUrl, setNewSourceUrl] = useState('')
  const [newSourceName, setNewSourceName] = useState('')
  const [inpockStatus, setInpockStatus] = useState<ScraperStatus | null>(null)
  const [inpockBusy, setInpockBusy]   = useState(false)
  const [instPostUrl, setInstPostUrl] = useState('')
  const [instPostBusy, setInstPostBusy] = useState(false)
  const [instPostMsg, setInstPostMsg] = useState('')
  const [adminTab, setAdminTab] = useState<'posts' | 'influencers'>('posts')
  const [editingInfluencer, setEditingInfluencer] = useState<string | null>(null)
  const [editInfluencerDraft, setEditInfluencerDraft] = useState<Partial<InfluencerSource>>({})
  const [influencerBusy, setInfluencerBusy] = useState<string | null>(null)

  // 세션 확인 (httpOnly 쿠키는 JS로 읽을 수 없으므로 서버에 확인)
  useEffect(() => {
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
    if (r.ok) setAnalytics(await r.json())
  }, [])

  const fetchInfluencerSources = useCallback(async () => {
    const r = await fetch('/api/inpock-sources')
    if (r.ok) { const d = await r.json(); setInfluencerSources(d.sources || []) }
  }, [])

  const fetchInpockStatus = useCallback(async () => {
    const r = await fetch('/api/inpock')
    if (r.ok) setInpockStatus(await r.json())
  }, [])

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

  const fetchConfig = useCallback(async () => {
    const r = await fetch('/api/scraper-config')
    if (r.ok) {
      const d = await r.json()
      setIncludeKws(d.include_keywords || [])
      setExcludeKws(d.exclude_keywords || [])
    }
  }, [])

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
        setInstPostMsg(`✅ ${lastLine || '수집 완료 — 검수 대기에 추가됨'}`)
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

  async function addKeyword(type: 'include' | 'exclude') {
    const kw = (type === 'include' ? newInclude : newExclude).trim()
    if (!kw) return
    const r = await fetch('/api/scraper-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, keyword: kw }),
    })
    if (r.ok) {
      type === 'include' ? setNewInclude('') : setNewExclude('')
      await fetchConfig()
    }
  }

  async function removeKeyword(type: 'include' | 'exclude', kw: string) {
    await fetch(`/api/scraper-config?type=${type}&keyword=${encodeURIComponent(kw)}`, { method: 'DELETE' })
    await fetchConfig()
  }

  useEffect(() => {
    fetchPosts()
    fetchAnalytics()
    fetchConfig()
    fetchInfluencerSources()
    fetchInpockStatus()
    const iv = setInterval(() => { fetchInpockStatus() }, 5000)
    return () => clearInterval(iv)
  }, [fetchPosts, fetchAnalytics, fetchConfig, fetchInfluencerSources, fetchInpockStatus])

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

  async function quickReview(p: Post, action: 'approve' | 'always_on' | 'exclude') {
    const patch =
      action === 'approve'   ? { status: 'ready' as const, published: false } :
      action === 'always_on' ? { status: 'ready' as const, published: false, is_evergreen_deal: true, is_always_on: true } :
                               { status: 'excluded' as const, published: false }
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

  const visible = posts.filter(p => {
    const st = effectiveStatus(p)
    const matchFilter = filter === 'all' ? true : st === filter
    const q = searchQ.toLowerCase()
    const matchQ = !q || p.title.toLowerCase().includes(q) || p.account.toLowerCase().includes(q)
    return matchFilter && matchQ
  })

  const countBy = (s: Post['status']) => posts.filter(p => effectiveStatus(p) === s).length
  const candidateCount   = countBy('candidate')
  const needsReviewCount = countBy('needs_review')
  const readyCount       = countBy('ready')
  const publishedCount   = countBy('published')
  const excludedCount    = countBy('excluded')
  const upcomingCount    = countBy('upcoming')

  // 인증 확인 중 (hydration 전)
  if (authed === null) return null
  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'Noto Sans KR', sans-serif" }}>
      {/* 헤더 */}
      <header style={{ background: '#1a1a2e', color: '#fff', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16, position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ fontWeight: 700, fontSize: 20 }}>🛍️ 딜조아 관리자</div>
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

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>

        {/* 통계 카드 */}
        <div className="admin-stats">
          <StatCard label="공개됨"    value={publishedCount}   icon="✅" color="#22c55e" />
          <StatCard label="공개 가능" value={readyCount}        icon="🟢" color="#6366f1" />
          <StatCard label="검수 필요" value={needsReviewCount}  icon="⚠️" color="#f97316" />
          <StatCard label="공구 후보" value={candidateCount}    icon="📝" color="#eab308" />
        </div>

        {/* 방문자 분석 */}
        <AnalyticsSection data={analytics} />

        {/* 탭 메뉴 */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #e2e8f0', paddingBottom: 0 }}>
          {([
            { key: 'posts',       label: '공구 관리' },
            { key: 'influencers', label: '인플루언서 관리' },
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

            {/* 키워드 설정 */}
            <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 24, border: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>⚙️ 수집 키워드 설정</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#16a34a', marginBottom: 8 }}>✅ 추가 포함 키워드</div>
                  <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 8px' }}>이 단어가 캡션에 있으면 공구로 수집</p>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <input value={newInclude} onChange={e => setNewInclude(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addKeyword('include') }}
                      placeholder="예: 오픈런, 단독판매"
                      style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1.5px solid #e2e8f0', fontSize: 12, outline: 'none' }} />
                    <button onClick={() => addKeyword('include')}
                      style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>추가</button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {includeKws.map(kw => (
                      <span key={kw} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#dcfce7', borderRadius: 12, padding: '3px 6px 3px 10px', fontSize: 12, color: '#15803d' }}>
                        {kw}
                        <button onClick={() => removeKeyword('include', kw)}
                          style={{ background: '#bbf7d0', border: 'none', borderRadius: '50%', width: 16, height: 16, cursor: 'pointer', color: '#166534', fontSize: 11, lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                    {includeKws.length === 0 && <span style={{ fontSize: 11, color: '#94a3b8' }}>추가된 키워드 없음</span>}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#dc2626', marginBottom: 8 }}>🚫 추가 제외 키워드</div>
                  <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 8px' }}>이 단어가 캡션에 있으면 수집 제외</p>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <input value={newExclude} onChange={e => setNewExclude(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addKeyword('exclude') }}
                      placeholder="예: 체험단모집, 협찬"
                      style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1.5px solid #e2e8f0', fontSize: 12, outline: 'none' }} />
                    <button onClick={() => addKeyword('exclude')}
                      style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>추가</button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {excludeKws.map(kw => (
                      <span key={kw} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fee2e2', borderRadius: 12, padding: '3px 6px 3px 10px', fontSize: 12, color: '#991b1b' }}>
                        {kw}
                        <button onClick={() => removeKeyword('exclude', kw)}
                          style={{ background: '#fecaca', border: 'none', borderRadius: '50%', width: 16, height: 16, cursor: 'pointer', color: '#7f1d1d', fontSize: 11, lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                    {excludeKws.length === 0 && <span style={{ fontSize: 11, color: '#94a3b8' }}>추가된 키워드 없음</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* 필터 + 검색 */}
            <div className="admin-filter">
              <div style={{ display: 'flex', gap: 6 }}>
                {([
                  { key: 'all',          label: '전체',                       color: '#6366f1' },
                  { key: 'candidate',    label: `공구 후보 ${candidateCount}`,   color: '#eab308' },
                  { key: 'needs_review', label: `검수 필요 ${needsReviewCount}`, color: '#f97316' },
                  { key: 'ready',        label: `공개 가능 ${readyCount}`,       color: '#22c55e' },
                  { key: 'published',    label: `공개됨 ${publishedCount}`,      color: '#0ea5e9' },
                  { key: 'excluded',     label: `제외 ${excludedCount}`,         color: '#94a3b8' },
                  { key: 'upcoming',     label: `오픈예정 ${upcomingCount}`,      color: '#7c3aed' },
                ] as const).map(({ key, label, color }) => (
                  <button key={key} onClick={() => setFilter(key)}
                    style={{
                      padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13,
                      background: filter === key ? color : '#e2e8f0',
                      color: filter === key ? '#fff' : '#475569', fontWeight: 600,
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
                {visible.map(p => <AdminPostRow key={p.id} post={p} onToggle={togglePublished} onDelete={deletePost} onEdit={setEditingPost} onToggleAlwaysOn={toggleEvergreenDeal} onToggleSoldOutOnly={toggleSoldOutOnly} onQuickReview={quickReview} periodLabel={periodLabel(p)} />)}
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
      </div>

      {(() => {
        const existingGroups = [...new Set(posts.map(p => p.group_key).filter(Boolean) as string[])]
        return (
          <>
            {showAddModal && <AddPostModal onClose={() => setShowAddModal(false)} onSubmit={addPost} existingGroups={existingGroups} />}
            {editingPost  && <AddPostModal onClose={() => setEditingPost(null)} onSubmit={updatePost} editPost={editingPost ?? undefined} existingGroups={existingGroups} />}
          </>
        )
      })()}
    </div>
  )
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '18px 20px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ fontSize: 28 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
        <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
      </div>
    </div>
  )
}

function AnalyticsSection({ data }: { data: DayStat[] }) {
  const last7 = data.slice(-7)
  const today = last7[last7.length - 1]
  const total7 = last7.reduce((s, d) => s + d.visitors, 0)
  const total7join = last7.reduce((s, d) => s + (d.events.join || 0), 0)
  const total7bm = last7.reduce((s, d) => s + (d.events.bookmark || 0), 0)
  const maxVisitors = Math.max(...last7.map(d => d.visitors), 1)

  function fmtDate(dateStr: string) {
    const [, m, d] = dateStr.split('-')
    return `${parseInt(m)}/${parseInt(d)}`
  }

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 24, border: '1px solid #e2e8f0' }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>📊 방문자 분석</h3>

      {/* 요약 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: 20 }}>
        {[
          { label: '오늘 방문자', value: today?.visitors ?? 0, color: '#6366f1' },
          { label: '7일 방문자', value: total7, color: '#0ea5e9' },
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
            { key: 'category', label: '카테고리', icon: '🏷' },
            { key: 'search', label: '검색', icon: '🔍' },
          ].filter(e => today.events[e.key]).map(e => (
            <div key={e.key} style={{ background: '#f1f5f9', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#475569' }}>
              {e.icon} {e.label} <strong>{today.events[e.key]}</strong>회
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AdminPostRow({ post: p, onToggle, onDelete, onEdit, onToggleAlwaysOn, onToggleSoldOutOnly, onQuickReview, periodLabel }: {
  post: Post
  onToggle: (p: Post) => void
  onDelete: (id: number) => void
  onEdit:   (p: Post) => void
  onToggleAlwaysOn: (p: Post) => void
  onToggleSoldOutOnly: (p: Post) => void
  onQuickReview: (p: Post, action: 'approve' | 'always_on' | 'exclude') => void
  periodLabel: string
}) {
  const published = p.status === 'published' || (!p.status && p.published !== false)
  const expired   = isExpired(p)
  // 관리자엔 "공개됨"으로 보여도 마감일이 지나면 고객 화면(/api/posts) 필터에서 자동 제외됨 — 상시딜/소진시는 예외
  const hiddenFromCustomers = published && expired

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
            : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 20 }}>{p.avatar || '🛍️'}</div>
          }
        </div>

        {/* 정보 */}
        <div className="admin-row-info" style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
            <span style={{ fontSize: 11, background: '#f1f5f9', color: '#64748b', padding: '2px 6px', borderRadius: 10, flexShrink: 0 }}>{CAT_LABEL[p.cat] || p.cat}</span>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>{p.account}</span>
            {p.status === 'candidate'    && <span style={{ fontSize: 11, background: '#fef9c3', color: '#a16207',  padding: '2px 6px', borderRadius: 10, fontWeight: 600 }}>📝 공구 후보</span>}
            {p.status === 'needs_review' && <span style={{ fontSize: 11, background: '#fff7ed', color: '#c2410c',  padding: '2px 6px', borderRadius: 10, fontWeight: 600 }}>⚠️ 검수 필요</span>}
            {p.status === 'ready'        && <span style={{ fontSize: 11, background: '#dcfce7', color: '#15803d',  padding: '2px 6px', borderRadius: 10, fontWeight: 600 }}>🟢 공개 가능</span>}
            {p.status === 'excluded'     && <span style={{ fontSize: 11, background: '#f1f5f9', color: '#64748b',  padding: '2px 6px', borderRadius: 10, fontWeight: 600 }}>🚫 제외</span>}
            {p.status === 'upcoming'     && <span style={{ fontSize: 11, background: '#ede9fe', color: '#7c3aed',  padding: '2px 6px', borderRadius: 10, fontWeight: 600 }}>🗓️ 오픈 예정</span>}
            {p.review_reason && p.review_reason.length > 0 && p.review_reason.map((r, i) => (
              <span key={i} style={{ fontSize: 10, background: '#fee2e2', color: '#dc2626', padding: '1px 5px', borderRadius: 8 }}>{r}</span>
            ))}
            {p.brand && <span style={{ color: '#6366f1', fontWeight: 600 }}>{p.brand}</span>}
            <span style={{ color: expired ? '#ef4444' : '#6366f1' }}>📅 {periodLabel}</span>
            {hiddenFromCustomers && (
              <span title="마감일이 지나서 상시딜/소진시 마감이 아니면 고객 화면(/) 에는 자동으로 안 보여요"
                style={{ fontSize: 11, background: '#fee2e2', color: '#dc2626', padding: '2px 6px', borderRadius: 10, fontWeight: 700, cursor: 'help' }}>
                ⚠️ 마감 지남 · 고객화면엔 숨김
              </span>
            )}
            <span style={{ fontWeight: 600, color: '#0f172a' }}>{p.price?.toLocaleString()}원</span>
            {p.market_price && p.price && p.market_price > p.price && (
              <span title={`네이버 쇼핑 최저가: ${p.market_price.toLocaleString()}원`}
                style={{ fontSize: 11, background: '#fef9c3', color: '#92400e', padding: '2px 6px', borderRadius: 10, fontWeight: 700, cursor: 'help' }}>
                🏷️ 최저가比 {Math.round((1 - p.price / p.market_price) * 100)}%↓
              </span>
            )}
            {p.extraction_debug && (
              <span
                title={JSON.stringify(p.extraction_debug, null, 2)}
                style={{ fontSize: 10, background: '#f0f9ff', color: '#0369a1', padding: '1px 5px', borderRadius: 8, cursor: 'help' }}>
                🔍 {(p.extraction_debug as Record<string,unknown>).extraction_method as string || '추출'}
                {(p.extraction_debug as Record<string,unknown>).extraction_error
                  ? ' ⚠️'
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
              ✅ 공구 확정
            </button>
            <button onClick={() => onQuickReview(p, 'always_on')}
              style={{ flex: 1, padding: '7px 0', background: '#fef9c3', color: '#92400e', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              📦 상시판매
            </button>
            <button onClick={() => onQuickReview(p, 'exclude')}
              style={{ flex: 1, padding: '7px 0', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              🚫 제외
            </button>
          </div>
        )}

        {/* 액션 버튼 */}
        <div className="admin-row-actions">
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
            ✏️ 수정
          </button>
          <button onClick={() => onToggle(p)}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              background: published ? '#dcfce7' : '#fff7ed', color: published ? '#16a34a' : '#ea580c' }}>
            {published ? '✅ 공개' : '🙈 숨김'}
          </button>
          <button onClick={() => onToggleAlwaysOn(p)}
            title="상시딜로 설정하면 마감일 없이도 공개 가능"
            style={{ padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
              background: (p.is_evergreen_deal || p.is_always_on) ? '#fef3c7' : '#f1f5f9', color: (p.is_evergreen_deal || p.is_always_on) ? '#92400e' : '#94a3b8' }}>
            {(p.is_evergreen_deal || p.is_always_on) ? '⏰ 상시딜' : '상시딜'}
          </button>
          <button onClick={() => onToggleSoldOutOnly(p)}
            title="한정수량으로 재고 소진시 마감되고, 고정된 마감일은 없는 공구"
            style={{ padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
              background: p.sale_until_sold_out ? '#fee2e2' : '#f1f5f9', color: p.sale_until_sold_out ? '#b91c1c' : '#94a3b8' }}>
            {p.sale_until_sold_out ? '🔥 소진시' : '소진시'}
          </button>
          <button onClick={() => onDelete(p.id)}
            style={{ padding: '6px 10px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            삭제
          </button>
        </div>
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
  { value: 'fashion', label: '👗 패션' },
  { value: 'beauty', label: '💄 뷰티' },
  { value: 'food', label: '🍱 식품' },
  { value: 'life', label: '🏠 생활용품' },
  { value: 'kids', label: '🧸 유아동' },
  { value: 'health', label: '💊 건강' },
  { value: 'pet', label: '🐾 반려동물' },
  { value: 'digital', label: '📱 디지털' },
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
            style={{ ...inputStyle, flex: 2, minWidth: 220 }} />
          <input type="text" value={newSourceName} onChange={e => onNewNameChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onAdd() }}
            placeholder="이름 (선택)"
            style={{ ...inputStyle, flex: 1, minWidth: 120 }} />
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
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
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
