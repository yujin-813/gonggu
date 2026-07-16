#!/usr/bin/env node
/**
 * 찜한 공구의 마감이 임박(오늘/내일)하면 구독한 브라우저에 푸시 알림을 보낸다.
 * cron으로 주기적으로 실행 — 이미 알린 상품은 다시 보내지 않는다(notifiedPostIds로 추적).
 *
 * 사용법: node scripts/send-deadline-alerts.js
 */
const fs = require('fs')
const path = require('path')

// cron 실행 시 .env.local 이 자동 로드되지 않으므로 직접 주입 (Python 스크립트들과 동일한 방식)
const envFile = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const idx = t.indexOf('=')
    const k = t.slice(0, idx).trim()
    const v = t.slice(idx + 1).trim()
    if (!(k in process.env)) process.env[k] = v
  }
}

const webpush = require('web-push')

const DATA_DIR = path.join(__dirname, '..', 'data')
const SUBS_FILE = path.join(DATA_DIR, 'push_subscriptions.json')
const POSTS_FILE = path.join(DATA_DIR, 'posts.json')

function loadJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) }
  catch { return fallback }
}

function saveJson(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, file)
}

function daysLeft(deadline) {
  if (!deadline) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(deadline); d.setHours(0, 0, 0, 0)
  if (Number.isNaN(d.getTime())) return null
  return Math.ceil((d.getTime() - today.getTime()) / 86400000)
}

async function main() {
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com'
  if (!vapidPublic || !vapidPrivate) {
    console.log('VAPID 키가 설정되지 않아 건너뜁니다.')
    return
  }
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  const subs = loadJson(SUBS_FILE, [])
  const posts = loadJson(POSTS_FILE, [])
  const postById = new Map(posts.map(p => [p.id, p]))

  let sent = 0
  let removed = 0
  const survivors = []

  for (const rec of subs) {
    let stillValid = true
    const notified = new Set(rec.notifiedPostIds || [])

    for (const postId of rec.bookmarkedPostIds || []) {
      if (notified.has(postId)) continue
      const post = postById.get(postId)
      if (!post) continue
      // 상시딜/소진시마감/마감일 미확인 상품은 "마감 임박" 자체가 성립하지 않으므로 건너뜀
      if (post.is_evergreen_deal || post.is_always_on || post.sale_until_sold_out) continue
      const dl = daysLeft(post.deadline)
      if (dl === null || dl < 0 || dl > 1) continue // 오늘(0)·내일(1) 마감인 것만

      const body = dl === 0 ? `오늘 마감이에요! ${post.price?.toLocaleString?.() || ''}원` : `내일 마감이에요! ${post.price?.toLocaleString?.() || ''}원`
      const payload = JSON.stringify({
        title: `⏰ ${post.title.slice(0, 40)}`,
        body,
        url: '/',
      })

      try {
        await webpush.sendNotification(rec.subscription, payload)
        notified.add(postId)
        sent++
      } catch (err) {
        const status = err && err.statusCode
        if (status === 404 || status === 410) {
          // 구독이 만료/취소됨 — 이 구독 자체를 제거
          stillValid = false
          break
        }
        console.error('push 실패:', post.id, err && err.message)
      }
    }

    if (stillValid) {
      survivors.push({ ...rec, notifiedPostIds: [...notified] })
    } else {
      removed++
    }
  }

  saveJson(SUBS_FILE, survivors)
  console.log(`완료: ${sent}건 발송, 만료 구독 ${removed}건 정리`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
