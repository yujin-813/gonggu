import fs from 'fs'
import path from 'path'
import type { Post, ScraperStatus, InfluencerSource, Collection, CuratedSubject, PurchaseRecord } from './types'

// 배포 환경에서 git pull로 덮어쓰이지 않도록 data/ 디렉토리 사용
const DATA_DIR    = path.join(process.cwd(), 'data')
const POSTS_FILE  = path.join(DATA_DIR, 'posts.json')
const STATUS_FILE = path.join(DATA_DIR, 'scraper_status.json')
const PROFILES_FILE = path.join(DATA_DIR, 'tracked_profiles.json')
const COLLECTIONS_FILE = path.join(DATA_DIR, 'collections.json')
const CURATED_SUBJECTS_FILE = path.join(DATA_DIR, 'curated_subjects.json')
const GROWTH_GOALS_FILE = path.join(DATA_DIR, 'growth_goals.json')
const PURCHASE_LOG_FILE = path.join(DATA_DIR, 'purchase_log.json')

// 일 방문자 기준 성장 단계. 사장님이 관리자 화면에서 나중에 바꿀 수 있다 — 이건 그때까지의 기본값.
const DEFAULT_GROWTH_STAGES = [150, 300, 500, 1000, 3000, 10000]

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

// 임시 파일에 쓴 뒤 rename — 쓰기 도중 프로세스가 죽어도 기존 파일이 손상되지 않는다.
function atomicWrite(file: string, content: string) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, content, 'utf-8')
  fs.renameSync(tmp, file)
}

// posts.json이 6.3MB라 페이지마다(홈·카테고리·상세 전부) 매번 통째로 읽고 파싱하면
// 방문자가 늘수록 그게 그대로 서버 부하가 된다. 파일 수정 시각(mtimeMs)+크기만 보고
// 안 바뀌었으면 파싱을 건너뛴다 — 관리자(Next.js)와 수집기(파이썬, cron)가 서로 다른
// 프로세스에서 같은 파일을 건드리므로 통째로 캐시하면 안 되고, 매번 이 값만 가볍게 확인한다.
let postsCache: { mtimeMs: number; size: number; data: Post[] } | null = null

export function loadPosts(): Post[] {
  ensureDir()
  if (!fs.existsSync(POSTS_FILE)) return []
  try {
    const stat = fs.statSync(POSTS_FILE)
    if (!postsCache || postsCache.mtimeMs !== stat.mtimeMs || postsCache.size !== stat.size) {
      postsCache = {
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        data: JSON.parse(fs.readFileSync(POSTS_FILE, 'utf-8')),
      }
    }
    // 캐시된 배열을 그대로 내주면 호출부가 posts[idx].foo = x처럼 항목을 직접 고칠 때
    // (app/api/posts/[id]/route.ts 등) savePosts()로 쓰기도 전에 캐시가 먼저 바뀐다 —
    // 매번 복제해서 내준다
    return structuredClone(postsCache.data)
  } catch {
    return []
  }
}

export function savePosts(posts: Post[]): void {
  ensureDir()
  atomicWrite(POSTS_FILE, JSON.stringify(posts, null, 2))
  postsCache = null // 다음 loadPosts()가 방금 쓴 내용을 다시 읽게 한다
}

export function loadScraperStatus(): ScraperStatus {
  ensureDir()
  if (!fs.existsSync(STATUS_FILE)) {
    return { running: false, last_run: null, last_count: 0, error: null }
  }
  try { return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8')) }
  catch { return { running: false, last_run: null, last_count: 0, error: null } }
}

export function saveScraperStatus(status: ScraperStatus): void {
  ensureDir()
  atomicWrite(STATUS_FILE, JSON.stringify(status, null, 2))
}


// 인스타 추적 계정 (scraper.py가 읽는 tracked_profiles.json, 문자열 배열)
export function loadProfiles(): string[] {
  ensureDir()
  if (!fs.existsSync(PROFILES_FILE)) return []
  try { return JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf-8')) }
  catch { return [] }
}

export function saveProfiles(profiles: string[]): void {
  ensureDir()
  atomicWrite(PROFILES_FILE, JSON.stringify(profiles, null, 2))
}

// 인포크 소스 (inpock.py가 읽는 inpock_sources.json, 핸들 문자열 배열 — 레거시)
const INPOCK_SOURCES_FILE      = path.join(DATA_DIR, 'inpock_sources.json')
const INPOCK_STATUS_FILE       = path.join(DATA_DIR, 'inpock_status.json')
const INFLUENCER_SOURCES_FILE  = path.join(DATA_DIR, 'influencer_sources.json')

export function loadInpockSources(): string[] {
  ensureDir()
  if (!fs.existsSync(INPOCK_SOURCES_FILE)) return []
  try { return JSON.parse(fs.readFileSync(INPOCK_SOURCES_FILE, 'utf-8')) }
  catch { return [] }
}

export function saveInpockSources(sources: string[]): void {
  ensureDir()
  atomicWrite(INPOCK_SOURCES_FILE, JSON.stringify(sources, null, 2))
}

export function loadInpockStatus(): ScraperStatus {
  ensureDir()
  if (!fs.existsSync(INPOCK_STATUS_FILE)) {
    return { running: false, last_run: null, last_count: 0, error: null }
  }
  try { return JSON.parse(fs.readFileSync(INPOCK_STATUS_FILE, 'utf-8')) }
  catch { return { running: false, last_run: null, last_count: 0, error: null } }
}

export function saveInpockStatus(status: ScraperStatus): void {
  ensureDir()
  atomicWrite(INPOCK_STATUS_FILE, JSON.stringify(status, null, 2))
}

// 인플루언서 소스 — collector.py가 읽는 influencer_sources.json (InfluencerSource[])
// 없으면 기존 inpock_sources.json(string[])에서 마이그레이션한다.
export function loadInfluencerSources(): InfluencerSource[] {
  ensureDir()
  if (fs.existsSync(INFLUENCER_SOURCES_FILE)) {
    try { return JSON.parse(fs.readFileSync(INFLUENCER_SOURCES_FILE, 'utf-8')) }
    catch { return [] }
  }
  if (fs.existsSync(INPOCK_SOURCES_FILE)) {
    try {
      const handles: string[] = JSON.parse(fs.readFileSync(INPOCK_SOURCES_FILE, 'utf-8'))
      const now = new Date().toISOString()
      const migrated: InfluencerSource[] = handles.map(h => ({
        id: `inpock_${h}`,
        url: `https://link.inpock.co.kr/${h}`,
        source_type: 'inpock' as const,
        handle: h,
        influencer_name: h,
        added_at: now,
      }))
      atomicWrite(INFLUENCER_SOURCES_FILE, JSON.stringify(migrated, null, 2))
      return migrated
    } catch { return [] }
  }
  return []
}

export function saveInfluencerSources(sources: InfluencerSource[]): void {
  ensureDir()
  atomicWrite(INFLUENCER_SOURCES_FILE, JSON.stringify(sources, null, 2))
}

export function updateInfluencerSource(id: string, patch: Partial<InfluencerSource>): boolean {
  const sources = loadInfluencerSources()
  const idx = sources.findIndex(s => s.id === id)
  if (idx < 0) return false
  sources[idx] = { ...sources[idx], ...patch }
  saveInfluencerSources(sources)
  return true
}

// 컬렉션 (홈 "지금 뜨는 컬렉션" 섹션 + /collection/:id) — 초기엔 관리자가 수동으로 큐레이션
export function loadCollections(): Collection[] {
  ensureDir()
  if (!fs.existsSync(COLLECTIONS_FILE)) return []
  try { return JSON.parse(fs.readFileSync(COLLECTIONS_FILE, 'utf-8')) }
  catch { return [] }
}

export function saveCollections(collections: Collection[]): void {
  ensureDir()
  atomicWrite(COLLECTIONS_FILE, JSON.stringify(collections, null, 2))
}

// 공구 모음 페이지(/pick/:slug) 대상 — 관리자가 고른 브랜드/인플루언서/셀러 목록.
// 상품 목록 자체는 저장하지 않는다(lib/curatedSubjects.ts가 매번 계산).
export function loadCuratedSubjects(): CuratedSubject[] {
  ensureDir()
  if (!fs.existsSync(CURATED_SUBJECTS_FILE)) return []
  try { return JSON.parse(fs.readFileSync(CURATED_SUBJECTS_FILE, 'utf-8')) }
  catch { return [] }
}

export function saveCuratedSubjects(subjects: CuratedSubject[]): void {
  ensureDir()
  atomicWrite(CURATED_SUBJECTS_FILE, JSON.stringify(subjects, null, 2))
}

export function loadGrowthGoals(): { stages: number[] } {
  ensureDir()
  if (!fs.existsSync(GROWTH_GOALS_FILE)) return { stages: DEFAULT_GROWTH_STAGES }
  try {
    const d = JSON.parse(fs.readFileSync(GROWTH_GOALS_FILE, 'utf-8'))
    if (!Array.isArray(d.stages) || d.stages.length === 0) return { stages: DEFAULT_GROWTH_STAGES }
    return { stages: d.stages }
  } catch { return { stages: DEFAULT_GROWTH_STAGES } }
}

export function saveGrowthGoals(goals: { stages: number[] }): void {
  ensureDir()
  atomicWrite(GROWTH_GOALS_FILE, JSON.stringify(goals, null, 2))
}

export function loadPurchaseLog(): PurchaseRecord[] {
  ensureDir()
  if (!fs.existsSync(PURCHASE_LOG_FILE)) return []
  try { return JSON.parse(fs.readFileSync(PURCHASE_LOG_FILE, 'utf-8')) }
  catch { return [] }
}

export function savePurchaseLog(records: PurchaseRecord[]): void {
  ensureDir()
  atomicWrite(PURCHASE_LOG_FILE, JSON.stringify(records, null, 2))
}
