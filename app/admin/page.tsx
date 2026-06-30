'use client'
import { useState, useEffect, useCallback } from 'react'
import type { Post, ScraperStatus } from '@/lib/types'
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

function fmt(dateStr?: string) {
  if (!dateStr) return ''
  const [, m, d] = dateStr.split('-')
  return `${parseInt(m)}.${parseInt(d)}`
}

function periodLabel(p: Post) {
  if (p.start_date && p.deadline) return `${fmt(p.start_date)} ~ ${fmt(p.deadline)}`
  if (p.deadline) return `~ ${fmt(p.deadline)}`
  return '기간 없음'
}

function daysLeft(deadline?: string) {
  if (!deadline) return 999
  const today = new Date(); today.setHours(0,0,0,0)
  const d = new Date(deadline); d.setHours(0,0,0,0)
  return Math.ceil((d.getTime() - today.getTime()) / 86400000)
}

export default function AdminPage() {
  const [authed, setAuthed]           = useState<boolean | null>(null)  // null = 확인 중
  const [posts, setPosts]             = useState<Post[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingPost, setEditingPost]   = useState<Post | null>(null)
  const [loading, setLoading]         = useState(true)
  const [filter, setFilter]           = useState<'all' | 'review' | 'published' | 'hidden'>('all')
  const [searchQ, setSearchQ]         = useState('')
  const [analytics, setAnalytics]     = useState<DayStat[]>([])
  const [includeKws, setIncludeKws]   = useState<string[]>([])
  const [excludeKws, setExcludeKws]   = useState<string[]>([])
  const [newInclude, setNewInclude]   = useState('')
  const [newExclude, setNewExclude]   = useState('')
  const [inpockSources, setInpockSources] = useState<string[]>([])
  const [newInpock, setNewInpock]     = useState('')
  const [inpockStatus, setInpockStatus] = useState<ScraperStatus | null>(null)
  const [inpockBusy, setInpockBusy]   = useState(false)
  const [instPostUrl, setInstPostUrl] = useState('')
  const [instPostBusy, setInstPostBusy] = useState(false)
  const [instPostMsg, setInstPostMsg] = useState('')

  // 세션 확인 (httpOnly 쿠키는 JS로 읽을 수 없으므로 서버에 확인)
  useEffect(() => {
    fetch('/api/auth')
      .then(r => r.json())
      .then(d => setAuthed(!!d.authed))
      .catch(() => setAuthed(false))
  }, [])

  const fetchPosts = useCallback(async () => {
    const r = await fetch('/api/posts?admin=1&per_page=200')
    const d = await r.json()
    setPosts(d.posts || [])
    setLoading(false)
  }, [])

  const fetchAnalytics = useCallback(async () => {
    const r = await fetch('/api/analytics')
    if (r.ok) setAnalytics(await r.json())
  }, [])

  const fetchInpockSources = useCallback(async () => {
    const r = await fetch('/api/inpock-sources')
    if (r.ok) { const d = await r.json(); setInpockSources(d.sources || []) }
  }, [])

  const fetchInpockStatus = useCallback(async () => {
    const r = await fetch('/api/inpock')
    if (r.ok) setInpockStatus(await r.json())
  }, [])

  async function addInpockSource() {
    const handle = newInpock.trim()
    if (!handle) return
    const r = await fetch('/api/inpock-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle }),
    })
    if (r.ok) { setNewInpock(''); await fetchInpockSources() }
    else { const d = await r.json().catch(() => ({})); alert(d.error || '추가 실패') }
  }

  async function removeInpockSource(handle: string) {
    if (!confirm(`'${handle}' 인플루언서를 삭제할까요?`)) return
    await fetch(`/api/inpock-sources?handle=${encodeURIComponent(handle)}`, { method: 'DELETE' })
    await fetchInpockSources()
  }

  async function startInpock() {
    setInpockBusy(true)
    await fetch('/api/inpock', { method: 'POST' })
    await fetchInpockStatus()
    // 수집은 시간이 걸리므로 잠시 후 결과 갱신
    setTimeout(async () => { await fetchPosts(); await fetchInpockStatus(); setInpockBusy(false) }, 8000)
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
    fetchInpockSources()
    fetchInpockStatus()
    const iv = setInterval(() => { fetchInpockStatus() }, 5000)
    return () => clearInterval(iv)
  }, [fetchPosts, fetchAnalytics, fetchConfig, fetchInpockSources, fetchInpockStatus])

  async function togglePublished(p: Post) {
    const next = p.published === false ? true : false
    setPosts(prev => prev.map(x => x.id === p.id ? { ...x, published: next } : x))
    await fetch(`/api/posts/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published: next }),
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

  // 자동 수집분(인포크·인스타)이 검수 대기 상태인 것
  const isReview = (p: Post) => p.published === false && p.source !== 'manual'

  const visible = posts.filter(p => {
    const matchFilter =
      filter === 'all' ? true :
      filter === 'review' ? isReview(p) :
      filter === 'published' ? p.published !== false :
      p.published === false
    const q = searchQ.toLowerCase()
    const matchQ = !q || p.title.toLowerCase().includes(q) || p.account.toLowerCase().includes(q)
    return matchFilter && matchQ
  })

  const publishedCount = posts.filter(p => p.published !== false).length
  const hiddenCount    = posts.filter(p => p.published === false).length
  const reviewCount    = posts.filter(isReview).length

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
          <StatCard label="전체 공구" value={posts.length} icon="📦" color="#6366f1" />
          <StatCard label="공개 중" value={publishedCount} icon="✅" color="#22c55e" />
          <StatCard label="검수 대기" value={reviewCount} icon="📝" color="#eab308" />
          <StatCard label="숨김 처리" value={hiddenCount} icon="🙈" color="#f97316" />
        </div>

        {/* 방문자 분석 */}
        <AnalyticsSection data={analytics} />

        {/* 인포크링크 공구 수집 (메인) */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 24, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e293b' }}>🔗 인포크링크 공구 수집</h3>
            <button
              onClick={startInpock}
              disabled={inpockBusy || inpockStatus?.running || inpockSources.length === 0}
              style={{
                background: inpockBusy || inpockStatus?.running || inpockSources.length === 0 ? '#94a3b8' : '#0ea5e9',
                color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px',
                cursor: inpockBusy ? 'wait' : inpockSources.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13,
              }}
            >
              {inpockBusy || inpockStatus?.running ? '수집 중...' : '🔄 지금 수집'}
            </button>
          </div>

          {/* 상태 */}
          {inpockStatus && (
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
              {inpockStatus.running ? (
                <span style={{ color: '#0ea5e9', fontWeight: 600 }}>⏳ 수집 중...</span>
              ) : inpockStatus.last_run ? (
                <>마지막 수집: {new Date(inpockStatus.last_run).toLocaleString('ko-KR')}
                  {' · '}신규 <strong>{inpockStatus.last_count}</strong>개 검수대기
                  {!!inpockStatus.skipped_count && <> · 비공구 제외 {inpockStatus.skipped_count}개</>}
                  {inpockStatus.error && <span style={{ color: '#ef4444', marginLeft: 8 }}>❌ {inpockStatus.error}</span>}
                </>
              ) : '아직 수집한 적 없음'}
            </div>
          )}

          {/* 인플루언서 등록 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={newInpock}
              onChange={e => setNewInpock(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addInpockSource() }}
              placeholder="인포크 핸들 또는 링크 (예: unidongdong 또는 link.inpock.co.kr/unidongdong)"
              style={{ flex: 1, minWidth: 220, padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none' }}
            />
            <button onClick={addInpockSource}
              style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              ＋ 인플루언서 추가
            </button>
          </div>

          {/* 등록된 인플루언서 목록 */}
          {inpockSources.length === 0 ? (
            <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0 0' }}>등록된 인플루언서가 없습니다. 인포크 링크를 추가하세요.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {inpockSources.map(h => (
                <span key={h} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f1f5f9', borderRadius: 16, padding: '4px 6px 4px 12px', fontSize: 12, color: '#475569' }}>
                  {h}
                  <button onClick={() => removeInpockSource(h)} title="삭제"
                    style={{ background: '#e2e8f0', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', color: '#64748b', fontSize: 12, lineHeight: 1 }}>×</button>
                </span>
              ))}
            </div>
          )}
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '10px 0 0' }}>
            ※ 공구만 골라 <strong>검수 대기</strong>로 수집됩니다 (카톡·카페·상시판매 자동 제외). 가격·기간을 보완한 뒤 공개하세요.
          </p>
        </div>

        {/* 인스타 게시글 직접 추가 */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 24, border: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>📸 인스타 게시글 직접 추가</h3>
          <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 10px' }}>
            특정 게시글 URL을 입력하면 수집 후 검수 대기로 추가됩니다.
            최초 1회 터미널에서 <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 4 }}>python3 scraper.py --setup</code> 로그인 필요.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="url"
              value={instPostUrl}
              onChange={e => { setInstPostUrl(e.target.value); setInstPostMsg('') }}
              onKeyDown={e => { if (e.key === 'Enter') addInstPost() }}
              placeholder="https://www.instagram.com/p/ABC123..."
              style={{ flex: 1, minWidth: 240, padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none' }}
            />
            <button
              onClick={addInstPost}
              disabled={instPostBusy || !instPostUrl.trim()}
              style={{
                background: instPostBusy || !instPostUrl.trim() ? '#94a3b8' : '#6366f1',
                color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px',
                fontWeight: 600, fontSize: 13,
                cursor: instPostBusy ? 'wait' : !instPostUrl.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {instPostBusy ? '수집 중...' : '수집'}
            </button>
          </div>
          {instPostMsg && (
            <p style={{ fontSize: 12, margin: '8px 0 0', color: instPostMsg.startsWith('✅') ? '#16a34a' : '#ef4444' }}>
              {instPostMsg}
            </p>
          )}
        </div>

        {/* 키워드 설정 */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 24, border: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>⚙️ 수집 키워드 설정</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* 포함 키워드 */}
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

            {/* 제외 키워드 */}
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
            {(['all','review','published','hidden'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13,
                  background: filter === f ? '#6366f1' : '#e2e8f0',
                  color: filter === f ? '#fff' : '#475569', fontWeight: 600,
                }}
              >
                {f === 'all' ? '전체' : f === 'review' ? `검수대기${reviewCount ? ` ${reviewCount}` : ''}` : f === 'published' ? '공개' : '숨김'}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="제목 / 계정 검색..."
            className="admin-filter-search"
          />
          <span style={{ fontSize: 13, color: '#94a3b8', marginLeft: 'auto' }}>{visible.length}개</span>
        </div>

        {/* 공구 목록 테이블 */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>불러오는 중...</div>
        ) : visible.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <div>등록된 공구가 없습니다</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visible.map(p => <AdminPostRow key={p.id} post={p} onToggle={togglePublished} onDelete={deletePost} onEdit={setEditingPost} periodLabel={periodLabel(p)} dLeft={daysLeft(p.deadline)} />)}
          </div>
        )}
      </div>

      {(() => {
        const existingGroups = [...new Set(posts.map(p => p.group_key).filter(Boolean) as string[])]
        return (
          <>
            {showAddModal && <AddPostModal onClose={() => setShowAddModal(false)} onSubmit={addPost} existingGroups={existingGroups} />}
            {editingPost  && <AddPostModal onClose={() => setEditingPost(null)} onSubmit={updatePost} editPost={editingPost} existingGroups={existingGroups} />}
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

function AdminPostRow({ post: p, onToggle, onDelete, onEdit, periodLabel, dLeft }: {
  post: Post
  onToggle: (p: Post) => void
  onDelete: (id: number) => void
  onEdit:   (p: Post) => void
  periodLabel: string
  dLeft: number
}) {
  const published = p.published !== false
  const expired   = dLeft < 0

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
            {p.published === false && p.source !== 'manual' && (
              <span style={{ fontSize: 11, background: '#fef9c3', color: '#a16207', padding: '2px 6px', borderRadius: 10, fontWeight: 600 }}>📝 검수대기</span>
            )}
            {p.brand && <span style={{ color: '#6366f1', fontWeight: 600 }}>{p.brand}</span>}
            <span style={{ color: expired ? '#ef4444' : '#6366f1' }}>📅 {periodLabel}</span>
            <span style={{ fontWeight: 600, color: '#0f172a' }}>{p.price?.toLocaleString()}원</span>
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="admin-row-actions">
          {p.url && (
            <a href={p.url} target="_blank" rel="noopener noreferrer" title="게시글 보기"
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
          <button onClick={() => onDelete(p.id)}
            style={{ padding: '6px 10px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            삭제
          </button>
        </div>
      </div>
    </div>
  )
}
