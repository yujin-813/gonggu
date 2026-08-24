#!/usr/bin/env node
/**
 * 오픈 예정 공구를 고객에게 공개한다.
 *
 * status='upcoming' 55건이 전부 published=false라 홈에도 상세에도 안 나왔다. 상세 조회가
 * 전 건 0회였던 이유다. 카테고리와 "곧 열려요" 영역을 만들어도 채울 게 없다.
 *
 * ⚠️ 이 공구들은 제목·오픈일·인플루언서만 있고 가격·이미지·구매 링크가 없다. 인포크에 올라온
 *    예고 블록이라 아직 상품 페이지가 없어서다. 카드에는 제목과 오픈일만 뜬다 — 없는 가격을
 *    지어내지 않으므로 거짓은 아니지만, 얇은 페이지라는 건 알고 공개하는 것이다.
 *
 * 오픈일이 이미 지난 것은 건드리지 않는다. 그건 예고가 아니라 관리자가 아직 정리 못 한
 * 것이고, 공개하면 "오픈 예정"이 아닌 채로 나간다.
 *
 * 사용법:
 *   node scripts/publish-upcoming.js            # 미리보기만 (기본)
 *   node scripts/publish-upcoming.js --apply    # 실제 저장 (백업 후)
 */
const fs = require('fs')
const path = require('path')

const FILE = path.join(__dirname, '..', 'data', 'posts.json')
const APPLY = process.argv.includes('--apply')

const posts = JSON.parse(fs.readFileSync(FILE, 'utf-8'))
const today = new Date().toISOString().slice(0, 10)

const targets = posts.filter(p =>
  p.status === 'upcoming' &&
  p.published === false &&
  // 오픈일이 아직 안 지난 것만. 날짜가 없는 자리표시자도 오픈 예정으로 본다(period.ts와 같은 규칙)
  (!p.start_date || String(p.start_date).slice(0, 10) >= today),
)

console.log(`status=upcoming 전체        ${posts.filter(p => p.status === 'upcoming').length}건`)
console.log(`그중 비공개                 ${posts.filter(p => p.status === 'upcoming' && p.published === false).length}건`)
console.log(`공개 대상 (오픈일 안 지남)   ${targets.length}건\n`)

for (const p of targets.slice(0, 10)) {
  console.log(`  ${(p.start_date || '날짜미정').padEnd(12)} ${(p.title || '').slice(0, 40)}`)
}
if (targets.length > 10) console.log(`  … 외 ${targets.length - 10}건`)

if (!APPLY) {
  console.log('\n미리보기입니다. 실제로 저장하려면 --apply 를 붙이세요.')
  process.exit(0)
}

const backup = `${FILE}.bak-${new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')}`
fs.copyFileSync(FILE, backup)
console.log(`\n백업: ${path.basename(backup)}`)

for (const p of targets) p.published = true

// 저장은 임시 파일에 쓴 뒤 rename — 도중에 죽어도 원본이 안 깨진다
const tmp = `${FILE}.${process.pid}.tmp`
fs.writeFileSync(tmp, JSON.stringify(posts, null, 2))
fs.renameSync(tmp, FILE)
console.log(`✅ ${targets.length}건 공개 완료`)
