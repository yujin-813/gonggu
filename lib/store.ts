import fs from 'fs'
import path from 'path'
import type { Post, ScraperStatus } from './types'

// 배포 환경에서 git pull로 덮어쓰이지 않도록 data/ 디렉토리 사용
const DATA_DIR   = path.join(process.cwd(), 'data')
const POSTS_FILE  = path.join(DATA_DIR, 'posts.json')
const STATUS_FILE = path.join(DATA_DIR, 'scraper_status.json')

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

export function loadPosts(): Post[] {
  ensureDir()
  if (!fs.existsSync(POSTS_FILE)) return []
  try { return JSON.parse(fs.readFileSync(POSTS_FILE, 'utf-8')) }
  catch { return [] }
}

export function savePosts(posts: Post[]): void {
  ensureDir()
  fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2), 'utf-8')
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
  fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2), 'utf-8')
}
