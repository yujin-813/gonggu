import fs from 'fs'
import path from 'path'
import type { Post, ScraperStatus } from './types'

// 배포 환경에서 git pull로 덮어쓰이지 않도록 data/ 디렉토리 사용
const DATA_DIR    = path.join(process.cwd(), 'data')
const POSTS_FILE  = path.join(DATA_DIR, 'posts.json')
const STATUS_FILE = path.join(DATA_DIR, 'scraper_status.json')
const PROFILES_FILE = path.join(DATA_DIR, 'tracked_profiles.json')

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

// 임시 파일에 쓴 뒤 rename — 쓰기 도중 프로세스가 죽어도 기존 파일이 손상되지 않는다.
function atomicWrite(file: string, content: string) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, content, 'utf-8')
  fs.renameSync(tmp, file)
}

export function loadPosts(): Post[] {
  ensureDir()
  if (!fs.existsSync(POSTS_FILE)) return []
  try { return JSON.parse(fs.readFileSync(POSTS_FILE, 'utf-8')) }
  catch { return [] }
}

export function savePosts(posts: Post[]): void {
  ensureDir()
  atomicWrite(POSTS_FILE, JSON.stringify(posts, null, 2))
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

// 스크래퍼 키워드 설정
const CONFIG_FILE = path.join(DATA_DIR, 'scraper_config.json')

export interface ScraperConfig {
  include_keywords: string[]
  exclude_keywords: string[]
}

export function loadScraperConfig(): ScraperConfig {
  ensureDir()
  if (!fs.existsSync(CONFIG_FILE)) return { include_keywords: [], exclude_keywords: [] }
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) }
  catch { return { include_keywords: [], exclude_keywords: [] } }
}

export function saveScraperConfig(config: ScraperConfig): void {
  ensureDir()
  atomicWrite(CONFIG_FILE, JSON.stringify(config, null, 2))
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

// 인포크 소스 (inpock.py가 읽는 inpock_sources.json, 핸들 문자열 배열)
const INPOCK_SOURCES_FILE = path.join(DATA_DIR, 'inpock_sources.json')
const INPOCK_STATUS_FILE  = path.join(DATA_DIR, 'inpock_status.json')

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
