'use client'
import { useState, useEffect, useCallback } from 'react'
import type { Post, ScraperStatus } from '@/lib/types'
import AddPostModal from '@/components/AddPostModal'

const SESSION_KEY = 'gonggu-admin-ok'

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
        sessionStorage.setItem(SESSION_KEY, '1')
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
  const [status, setStatus]           = useState<ScraperStatus | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingPost, setEditingPost]   = useState<Post | null>(null)
  const [loading, setLoading]         = useState(true)
  const [scraping, setScraping]       = useState(false)
  const [filter, setFilter]           = useState<'all' | 'published' | 'hidden'>('all')
  const [searchQ, setSearchQ]         = useState('')

  // 세션 확인
  useEffect(() => {
    setAuthed(sessionStorage.getItem(SESSION_KEY) === '1')
  }, [])

  const fetchPosts = useCallback(async () => {
    const r = await fetch('/api/posts?admin=1&per_page=200')
    const d = await r.json()
    setPosts(d.posts || [])
    setLoading(false)
  }, [])

  const fetchStatus = useCallback(async () => {
    const r = await fetch('/api/scrape/status')
    if (r.ok) setStatus(await r.json())
  }, [])

  useEffect(() => {
    fetchPosts()
    fetchStatus()
    const iv = setInterval(fetchStatus, 5000)
    return () => clearInterval(iv)
  }, [fetchPosts, fetchStatus])

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

  async function startScrape() {
    setScraping(true)
    await fetch('/api/scrape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 30 }) })
    await fetchStatus()
    setTimeout(async () => { await fetchPosts(); setScraping(false) }, 3000)
  }

  const visible = posts.filter(p => {
    const matchFilter =
      filter === 'all' ? true :
      filter === 'published' ? p.published !== false :
      p.published === false
    const q = searchQ.toLowerCase()
    const matchQ = !q || p.title.toLowerCase().includes(q) || p.account.toLowerCase().includes(q)
    return matchFilter && matchQ
  })

  const publishedCount = posts.filter(p => p.published !== false).length
  const hiddenCount    = posts.filter(p => p.published === false).length

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
            onClick={() => { sessionStorage.removeItem(SESSION_KEY); setAuthed(false) }}
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
          <StatCard label="숨김 처리" value={hiddenCount} icon="🙈" color="#f97316" />
        </div>

        {/* 스크래퍼 섹션 */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 24, border: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>🤖 Instagram 스크래퍼</h3>
          {status && (
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
              {status.running ? (
                <span style={{ color: '#6366f1', fontWeight: 600 }}>⏳ 스크래핑 중...</span>
              ) : status.last_run ? (
                <>마지막 실행: {new Date(status.last_run).toLocaleString('ko-KR')}{status.error && <span style={{ color: '#ef4444', marginLeft: 8 }}>❌ {status.error}</span>}</>
              ) : '아직 실행된 적 없음'}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={startScrape}
              disabled={scraping || status?.running}
              style={{ background: scraping || status?.running ? '#94a3b8' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: scraping ? 'wait' : 'pointer', fontWeight: 600, fontSize: 13 }}
            >
              {scraping || status?.running ? '스크래핑 중...' : '🔄 스크래핑 시작'}
            </button>
            {status?.error && !status?.running && (
              <span style={{ fontSize: 12, color: '#ef4444' }}>
                ⚠️ {status.error.includes('1') ? '로그인 실패 — .env.local 계정 정보를 확인하세요' : status.error}
              </span>
            )}
          </div>
        </div>

        {/* 필터 + 검색 */}
        <div className="admin-filter">
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all','published','hidden'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13,
                  background: filter === f ? '#6366f1' : '#e2e8f0',
                  color: filter === f ? '#fff' : '#475569', fontWeight: 600,
                }}
              >
                {f === 'all' ? '전체' : f === 'published' ? '공개' : '숨김'}
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

      {showAddModal && <AddPostModal onClose={() => setShowAddModal(false)} onSubmit={addPost} />}
      {editingPost  && <AddPostModal onClose={() => setEditingPost(null)} onSubmit={updatePost} editPost={editingPost} />}
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
      background: '#fff',
      border: `1px solid ${published ? '#e2e8f0' : '#fed7aa'}`,
      borderRadius: 12,
      padding: '12px 16px',
      opacity: published ? 1 : 0.78,
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
          <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span>{p.account}</span>
            {p.brand && <span style={{ color: '#6366f1', fontWeight: 600 }}>{p.brand}</span>}
            <span style={{ color: expired ? '#ef4444' : '#6366f1' }}>📅 {periodLabel}</span>
            <span style={{ fontWeight: 600, color: '#0f172a' }}>{p.price?.toLocaleString()}원</span>
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="admin-row-actions">
          {p.url && (
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
          <button onClick={() => onDelete(p.id)}
            style={{ padding: '6px 10px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            삭제
          </button>
        </div>
      </div>
    </div>
  )
}
