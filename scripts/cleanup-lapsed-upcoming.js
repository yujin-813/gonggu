#!/usr/bin/env node
/**
 * 오픈일이 지났는데 정보가 하나도 안 채워진 오픈 예정 공구를 지운다.
 *
 * 인플루언서가 "다음에 이거 팝니다" 예고만 하고 실제 판매 페이지를 안 올리는 경우가
 * 있다(또는 수집기가 그 페이지를 못 찾은 경우). 오픈일이 지나도 가격·이미지·구매링크가
 * 계속 비어 있으면, 그 예고는 실현되지 않은 것으로 본다.
 *
 * 대상: status='upcoming' AND 오픈일이 지남 AND price·img·purchase_url이 전부 비어 있음.
 * 이 셋 중 하나라도 있으면 안 지운다 — 수집기가 뭔가는 건졌다는 뜻이라 사람이 봐야 한다.
 * published=false인 것만 나온다(둘 이상 채워져야 공개되므로 이 조건에 걸리는 published=true는
 * 원래 없다).
 *
 * 사용법:
 *   node scripts/cleanup-lapsed-upcoming.js            # 미리보기만 (기본)
 *   node scripts/cleanup-lapsed-upcoming.js --apply     # 실제 삭제 (백업 후)
 */
const fs = require('fs')
const path = require('path')

const FILE = path.join(__dirname, '..', 'data', 'posts.json')
const APPLY = process.argv.includes('--apply')

const posts = JSON.parse(fs.readFileSync(FILE, 'utf-8'))
const today = new Date().toISOString().slice(0, 10)

const isLapsedEmpty = p =>
  p.status === 'upcoming' &&
  p.start_date &&
  String(p.start_date).slice(0, 10) < today &&
  !p.price && !p.img && !p.purchase_url

const targets = posts.filter(isLapsedEmpty)
const kept = posts.filter(p => !isLapsedEmpty(p))

console.log(`status=upcoming 전체        ${posts.filter(p => p.status === 'upcoming').length}건`)
console.log(`삭제 대상 (오픈일 지남 + 정보 없음)   ${targets.length}건\n`)

for (const p of targets) {
  console.log(`  ${(p.start_date || '').padEnd(12)} ${(p.title || '').slice(0, 40)}  (published=${p.published})`)
}

if (!APPLY) {
  console.log('\n미리보기입니다. 실제로 삭제하려면 --apply 를 붙이세요.')
  process.exit(0)
}

const backup = `${FILE}.bak-${new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')}`
fs.copyFileSync(FILE, backup)
console.log(`\n백업: ${path.basename(backup)}`)

const tmp = `${FILE}.${process.pid}.tmp`
fs.writeFileSync(tmp, JSON.stringify(kept, null, 2))
fs.renameSync(tmp, FILE)
console.log(`✅ ${targets.length}건 삭제 완료 (${posts.length} → ${kept.length}건)`)
