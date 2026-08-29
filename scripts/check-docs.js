#!/usr/bin/env node
/**
 * docs/03-SYSTEM.md가 주장하는 숫자를 지금 데이터로 다시 재서, 어긋난 것만 알린다.
 *
 * 문서는 코드를 고칠 때 흔들리는 것은 잘 막지만, 아무도 코드를 안 고쳤는데 데이터가
 * 움직여서 문서가 낡는 것은 못 막는다. 네이버 API 폐지를 3주 동안 아무도 몰랐던 것과
 * 같은 모양의 고장이다. 그래서 문서가 스스로 낡았다고 말하게 한다.
 *
 * 기대값은 이 파일이 아니라 문서에서 뽑는다 — 숫자를 여기에 베껴 두면 고쳐야 할 곳이
 * 두 곳이 되고, 그게 기술부채 #5와 같은 문제를 하나 더 만드는 일이다.
 *
 * 판정·공개 여부 규칙도 다시 구현하지 않고 lib/의 TS를 그대로 불러 쓴다.
 *
 *   node scripts/check-docs.js         어긋난 것만
 *   node scripts/check-docs.js --all   전부
 */
const fs = require('fs')
const path = require('path')
const ts = require('typescript')

const ROOT = path.join(__dirname, '..')

// --- lib/의 TS를 그대로 require 하기 위한 훅 (규칙을 여기에 다시 옮겨 적지 않으려고) ---
const compile = (module_, filename) => {
  const src = fs.readFileSync(filename, 'utf8')
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText
  module_._compile(out, filename)
}
require.extensions['.ts'] = compile
require.extensions['.tsx'] = compile

// tsconfig의 "@/*" → 프로젝트 루트
const Module = require('module')
const origResolve = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith('@/')) request = path.join(ROOT, request.slice(2))
  return origResolve.call(this, request, ...rest)
}

const { getDealVerdict } = require(path.join(ROOT, 'lib/dealGrade.ts'))
const { isCustomerVisible } = require(path.join(ROOT, 'lib/period.ts'))
const sitemap = require(path.join(ROOT, 'app/sitemap.ts')).default

// --- 데이터 ---
const DOC = fs.readFileSync(path.join(ROOT, 'docs/03-SYSTEM.md'), 'utf8')
const posts = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/posts.json'), 'utf8'))
const jsonAt = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'))

const count = fn => posts.filter(fn).length
const statusCount = s => count(p => (p.status || null) === s)
const lines = files =>
  files.reduce((n, f) => n + fs.readFileSync(f, 'utf8').split('\n').length - 1, 0)
const walk = (dir, filter) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const full = path.join(dir, e.name)
        return e.isDirectory() ? walk(full, filter) : filter(full) ? [full] : []
      })
    : []

const visible = posts.filter(isCustomerVisible)

// --- 문서가 주장하는 것들 ---
// [이름, 문서에서 기대값을 뽑는 정규식, 실측 함수, 종류]
//
// 종류를 나누는 이유: sitemap URL 수처럼 수집이 돌 때마다 움직이는 게 정상인 값까지
// 실패로 치면 매번 빨간 줄이 떠서 결국 아무도 안 보게 된다. 그러면 이 스크립트가
// 막으려던 고장(조용히 낡는 것)을 그대로 다시 만드는 셈이다.
//
//   fixed  — 저절로 안 움직인다. 어긋나면 문서가 낡았다는 뜻. 정확히 일치해야 한다
//   moving — 매일 움직인다. 문서 값 대비 20% 넘게 벌어질 때만 알린다
//   server — 운영 서버에만 진짜 데이터가 있다. 로컬에서는 건너뛴다
const MOVING_TOL = 0.2
const ON_SERVER = ROOT.startsWith('/home/')

const CHECKS = [
  ['lib/ 줄 수',            /`lib\/` ([\d,]+)줄/,                          () => lines(walk(path.join(ROOT, 'lib'), () => true)), 'fixed'],
  ['app/admin+components 줄 수', /`app\/admin` \+ `components\/` ([\d,]+)줄/, () => lines([...walk(path.join(ROOT, 'app/admin'), f => f.endsWith('.tsx')), ...walk(path.join(ROOT, 'components'), f => f.endsWith('.tsx'))]), 'fixed'],
  ['파이썬 줄 수',           /파이썬 ([\d,]+)줄/,                            () => lines(fs.readdirSync(ROOT).filter(f => f.endsWith('.py')).map(f => path.join(ROOT, f))), 'fixed'],
  ['게시물 총건수',          /게시물 ([\d,]+)건 \(공개/,                      () => posts.length, 'moving'],
  ['published: true',       /게시물 [\d,]+건 \(공개 ([\d,]+)건\)/,           () => count(p => p.published === true), 'moving'],
  ['인플루언서 소스',        /인플루언서 소스 ([\d,]+)개/,                     () => jsonAt('influencer_sources.json').length, 'fixed'],
  ['analytics 일수',        /analytics ([\d,]+)일치/,                       () => Object.keys(jsonAt('analytics.json').daily || {}).length, 'server'],
  ['sitemap URL 수',        /sitemap\.xml\(([\d,]+) URL\)/,                 () => sitemap().length, 'moving'],
  ['status: needs_review',  /\| `needs_review` \| [^|]*\| ([\d,]+)/,        () => statusCount('needs_review'), 'moving'],
  ['status: excluded',      /\| `excluded` \| [^|]*\| ([\d,]+)/,            () => statusCount('excluded'), 'moving'],
  ['status: published',     /\| `published` \| [^|]*\| ([\d,]+)/,           () => statusCount('published'), 'moving'],
  ['status: upcoming',      /\| `upcoming` \| [^|]*\| ([\d,]+)/,            () => statusCount('upcoming'), 'moving'],
  ['status: ready',         /\| `ready` \| [^|]*\| ([\d,]+)/,               () => statusCount('ready'), 'moving'],
  ['status: candidate',     /\| `candidate` \| [^|]*\| ([\d,]+)/,           () => statusCount('candidate'), 'fixed'],
  ['status 없음',            /\| \(없음\) \| [^|]*\| ([\d,]+)/,             () => statusCount(null), 'fixed'],
  ['status↔published 불일치', /([\d,]+)건 차이가 있다/,                     () => count(p => p.published === true && p.status !== 'published' && p.status !== 'upcoming'), 'fixed'],
  ['posts.json 크기(MB)',   /posts\.json +[\d,]+건 · ([\d.]+)MB/,           () => (fs.statSync(path.join(ROOT, 'data/posts.json')).size / 1024 ** 2).toFixed(1), 'moving'],
  ['market_price 보유',     /`market_price` 보유 ([\d,]+)건/,                () => count(p => p.market_price), 'moving'],
  // 판정기를 표방하는 제품의 핵심 지표라 등급 규칙을 다시 쓰지 않고 getDealVerdict()를 그대로 쓴다
  ['고객에게 보이는 공구',    /보이는 공구 ([\d,]+)건 중 pending/,                    () => visible.length, 'moving'],
  ['그중 pending',          /보이는 공구 [\d,]+건 중 pending ([\d,]+)건/,           () => visible.filter(p => getDealVerdict(p).display.key === 'pending').length, 'moving'],
]

// --- 비교 ---
const showAll = process.argv.includes('--all')
const num = s => Number(String(s).replace(/,/g, ''))

const rows = CHECKS.map(([name, re, measure, tier]) => {
  if (tier === 'server' && !ON_SERVER) return { name, tier, skipped: true }
  const m = DOC.match(re)
  let actual
  try { actual = measure() } catch (e) { return { name, tier, err: e.message } }
  if (!m) return { name, tier, actual, missing: true }
  const expected = m[1]
  const drift = num(expected) === 0 ? (num(actual) === 0 ? 0 : 1) : Math.abs(num(actual) - num(expected)) / num(expected)
  const ok = tier === 'moving' ? drift <= MOVING_TOL : num(expected) === num(actual)
  return { name, tier, expected, actual, ok, drift }
})

const bad = rows.filter(r => !r.ok && !r.skipped)
const pad = s => String(s).padEnd(24, ' ')
const pct = d => `${d > 0 ? '+' : ''}${Math.round(d * 100)}%`

for (const r of showAll ? rows : bad) {
  if (r.skipped) console.log(`–  ${pad(r.name)} 건너뜀 (운영 서버에서만 유효)`)
  else if (r.err) console.log(`⚠️  ${pad(r.name)} 측정 실패 — ${r.err}`)
  else if (r.missing) console.log(`⚠️  ${pad(r.name)} 문서에서 못 찾음 (문서 구조가 바뀌었나?) — 실측 ${r.actual}`)
  else if (!r.ok) console.log(`✗  ${pad(r.name)} 문서 ${r.expected} → 실측 ${r.actual}` + (r.tier === 'moving' ? `  (${pct(num(r.actual) / num(r.expected) - 1)})` : ''))
  else console.log(`✓  ${pad(r.name)} ${r.actual}`)
}

const checked = rows.filter(r => !r.skipped).length
console.log(
  bad.length === 0
    ? `\n문서와 실측이 맞습니다 (${checked}항목).`
    : `\n${checked}항목 중 ${bad.length}개가 어긋납니다 — docs/03-SYSTEM.md를 고쳐주세요.`,
)
process.exit(bad.length === 0 ? 0 : 1)
