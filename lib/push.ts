import fs from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')
const FILE = path.join(DATA_DIR, 'push_subscriptions.json')

export interface PushSubscriptionRecord {
  visitorId: string
  subscription: unknown // PushSubscriptionJSON
  bookmarkedPostIds: number[]
  notifiedPostIds: number[]
  updatedAt: string
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

export function loadSubscriptions(): PushSubscriptionRecord[] {
  ensureDir()
  if (!fs.existsSync(FILE)) return []
  try { return JSON.parse(fs.readFileSync(FILE, 'utf-8')) }
  catch { return [] }
}

export function saveSubscriptions(records: PushSubscriptionRecord[]) {
  ensureDir()
  const tmp = `${FILE}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(records, null, 2))
  fs.renameSync(tmp, FILE)
}

export function upsertSubscription(visitorId: string, subscription: unknown, bookmarkedPostIds: number[]) {
  const records = loadSubscriptions()
  const idx = records.findIndex(r => r.visitorId === visitorId)
  const now = new Date().toISOString()
  if (idx === -1) {
    records.push({ visitorId, subscription, bookmarkedPostIds, notifiedPostIds: [], updatedAt: now })
  } else {
    records[idx].subscription = subscription
    records[idx].bookmarkedPostIds = bookmarkedPostIds
    records[idx].updatedAt = now
  }
  saveSubscriptions(records)
}

export function removeSubscription(visitorId: string) {
  saveSubscriptions(loadSubscriptions().filter(r => r.visitorId !== visitorId))
}
