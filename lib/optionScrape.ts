// 상세페이지에서 세트 옵션을 긁어온다. inpock.py의 extract_options()와 같은 규칙이며,
// 수집기는 새 글이 들어올 때만 돌기 때문에 관리자가 화면에서 즉시 다시 긁을 수 있도록
// 여기에도 둔다. 두 곳의 규칙이 갈라지면 "수집기가 넣은 값"과 "가져오기 버튼이 넣은 값"이
// 달라져 어느 쪽이 맞는지 알 수 없게 되므로, 바꿀 때는 양쪽을 같이 고친다.

import type { DealOption } from './types'

const MIN_PRICE = 500          // 이보다 싸면 가격이 아니라 수량·용량 숫자일 가능성이 높다
const MAX_PRICE = 10_000_000
const MAX_COUNT = 40           // 색상 40종처럼 세트가 아닌 단순 변형은 판정에 쓸 값이 아니다

// "(추가옵션) 코튼스왑 1개 2,700원"처럼 본품에 얹는 부속품은 구성이 아니다.
// 이걸 구성으로 세면 가장 싼 값이 2,700원이 되어 "2,700원부터"라는 거짓말이 나온다.
const ADDON_NAME = /추가\s*(옵션|구성|선택|상품)|옵션\s*추가|사은품만|쇼핑백/

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&amp;/g, '&')
}

function cleanName(raw: string): string {
  let n = (raw || '').replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  n = n.replace(/\\\//g, '/').replace(/\\/g, '')   // 카페24 JSON 이스케이프 잔재
  n = decodeEntities(n.replace(/<[^>]+>/g, ''))
  n = n.replace(/^\s*\d+[.)]\s*/, '')              // "1. " 같은 순번
  return n.replace(/\s+/g, ' ').trim().replace(/^[.·\-\s]+|[.·\-\s]+$/g, '')
}

/** 색상·사이즈만 다른 항목을 한 줄로 접는다 — 15줄짜리 구성표는 판단에 도움이 안 된다 */
function collapseVariants(opts: DealOption[]): DealOption[] {
  const groups = new Map<string, DealOption>()
  for (const o of opts) {
    const base = o.name.replace(/\s*[([][^()[\]]{1,20}[)\]]\s*$/, '').trim() || o.name
    const key = `${o.price}|${base}`
    if (!groups.has(key)) groups.set(key, { name: base, price: o.price })
  }
  return groups.size === opts.length ? opts : [...groups.values()]
}

function validate(opts: DealOption[]): DealOption[] {
  const out: DealOption[] = []
  const seen = new Set<string>()
  for (const o of opts) {
    if (!o.name || !o.price) continue
    if (ADDON_NAME.test(o.name)) continue
    if (o.price < MIN_PRICE || o.price > MAX_PRICE) continue
    const key = `${o.name}|${o.price}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name: o.name.slice(0, 120), price: o.price })
  }
  return out.length <= MAX_COUNT ? out : []
}

/** 위즈 계열(mamahome·foryou-home·rara-home·mariettle 등 goods_info.wiz) */
function fromWiz(html: string): DealOption[] {
  const sel = /<select[^>]*od_option1[^>]*>([\s\S]*?)<\/select>/i.exec(html)
  if (!sel) return []
  const out: DealOption[] = []
  for (const m of sel[1].matchAll(/<option([^>]*)>([\s\S]*?)<\/option>/gi)) {
    const val = /value="([^"]*)"/.exec(m[1])
    if (!val || ['', '*', '**', '0'].includes(val[1])) continue
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, '')).trim()
    // "1. 글라스락 햇밥용기 310ml 4조 세트(코코넛밀크)  (17,400원)"
    const pm = /\(\s*([\d,]{3,})\s*원?\s*\)\s*$/.exec(text)
    if (!pm) continue
    out.push({ name: cleanName(text.slice(0, pm.index)), price: parseInt(pm[1].replace(/,/g, ''), 10) })
  }
  return out
}

/** 카페24 — 옵션 배열이 이스케이프된 JSON으로 상세 페이지 안에 박혀 있다 */
function fromCafe24(html: string): DealOption[] {
  const out: DealOption[] = []
  const re = /\\"option_price\\":(\d+),\\"option_name\\":\\".*?\\",\\"option_value\\":\\"(.*?)\\"/g
  for (const m of html.matchAll(re)) {
    out.push({ name: cleanName(m[2]), price: parseInt(m[1], 10) })
  }
  return out
}

export function extractOptionsFromHtml(html: string): DealOption[] {
  for (const parser of [fromWiz, fromCafe24]) {
    let opts: DealOption[]
    try { opts = validate(parser(html)) } catch { continue }
    if (opts.length < 2) continue          // 하나뿐이면 세트 구조가 아니라 단일 상품
    if (new Set(opts.map(o => o.price)).size === 1) continue  // 전부 같은 가격이면 색상 변형
    const collapsed = collapseVariants(opts)
    if (collapsed.length < 2) continue
    return collapsed
  }
  return []
}

export interface ScrapeResult {
  options: DealOption[]
  /** 왜 못 가져왔는지 — 화면에 그대로 보여줘서 다음 수단(붙여넣기)을 안내한다 */
  reason: string | null
}

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

// 여기는 애초에 자동으로 못 긁는다. 시도하고 실패시키기보다 이유를 바로 알려준다.
const KNOWN_BLOCKED: [RegExp, string][] = [
  [/smartstore\.naver|brand\.naver|shopping\.naver/, '네이버는 자동 조회를 차단해요. 옵션 목록을 복사해서 붙여넣어 주세요.'],
  [/srookpay/, '스룩페이는 옵션을 자바스크립트로 그려서 못 읽어요. 복사해서 붙여넣어 주세요.'],
  [/coupang\.com/, '쿠팡은 자동 조회를 차단해요. 복사해서 붙여넣어 주세요.'],
  // 아임웹은 옵션을 단계별로 나눠 불러오는데, 마지막 단계까지 고르고 장바구니에 담아야
  // 가격이 나온다. 남의 쇼핑몰 장바구니에 상품을 담아가며 긁을 수는 없으므로 시도하지 않는다.
  [/\/shop_view\?|imweb\.me/, '이 쇼핑몰은 옵션 가격을 단계별로만 보여줘서 자동으로 못 읽어요. 목록을 복사해서 붙여넣어 주세요.'],
]

// 인증서 체인이 불완전해서 생긴 실패인지 — 그 외의 네트워크 오류까지 검증을 끄고
// 재시도하면 안 되므로 코드로 좁혀 판별한다
const CERT_CHAIN_CODES = new Set([
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'CERT_UNTRUSTED',
])

function isCertChainError(e: unknown): boolean {
  const code = (e as { cause?: { code?: string }; code?: string })?.cause?.code
    ?? (e as { code?: string })?.code
  return !!code && CERT_CHAIN_CODES.has(code)
}

/**
 * 인증서 검증만 끄고 한 번 더 받아온다. Node 기본 모듈만 써서 의존성을 늘리지 않는다.
 * 리다이렉트는 직접 따라간다(최대 5회) — 인포크처럼 중간 링크를 거치는 경우가 있다.
 */
function fetchInsecure(url: string, depth = 0): Promise<{ status: number; body: Buffer; contentType: string }> {
  return new Promise((resolve, reject) => {
    if (depth > 5) return reject(new Error('리다이렉트가 너무 많습니다'))
    const https = require('node:https') as typeof import('node:https')
    const req = https.get(
      url,
      {
        rejectUnauthorized: false,
        headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
        timeout: 12000,
      },
      res => {
        const loc = res.headers.location
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && loc) {
          res.resume()
          return resolve(fetchInsecure(new URL(loc, url).toString(), depth + 1))
        }
        const chunks: Buffer[] = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => resolve({
          status: res.statusCode || 0,
          body: Buffer.concat(chunks),
          contentType: String(res.headers['content-type'] || ''),
        }))
      },
    )
    req.on('timeout', () => req.destroy(new Error('시간 초과')))
    req.on('error', reject)
  })
}

/**
 * 정말 판매가 끝난 페이지인지.
 *
 * 예전에는 본문 아무 데서나 "품절"이 보이면 끝난 걸로 봤는데, 쇼핑몰 솔루션이 한국어 UI
 * 문자열 사전을 자바스크립트로 통째로 심어두는 경우가 있다(아임웹의 LOCALIZE에 "상품 품절",
 * "존재하지 않거나"가 들어 있다). 그래서 멀쩡히 파는 닥터노아 페이지가 "판매가 끝났다"로
 * 잘못 안내됐다. 스크립트·스타일을 걷어낸 본문만 보고, 표현도 오해의 여지가 적은 것만 센다.
 *
 * 애매하면 끝났다고 단정하지 않는다 — 틀린 단정이 "못 읽었어요"보다 더 사람을 헷갈리게 한다.
 */
function looksSoldEnded(html: string): boolean {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
  if (/판매\s*(가\s*)?(종료|중지)(되었|됐|된|입니다)|일시\s*품절|품절된\s*상품|삭제되었거나\s*존재하지\s*않/.test(body)) {
    return true
  }
  // 내린 상품에 텅 빈 응답을 주는 쇼핑몰이 있다(마리에뜰은 133바이트짜리 빈 문서를 준다).
  // 문구가 없어도 사실상 사라진 페이지이므로 같이 묶는다.
  const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length < 200
}

export async function scrapeOptions(url: string): Promise<ScrapeResult> {
  for (const [re, msg] of KNOWN_BLOCKED) {
    if (re.test(url)) return { options: [], reason: msg }
  }

  const init: RequestInit = {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
    redirect: 'follow',
    signal: AbortSignal.timeout(12000),
  }

  let status: number
  let buf: Buffer
  let ctype: string
  try {
    const res = await fetch(url, init)
    status = res.status
    buf = Buffer.from(await res.arrayBuffer())
    ctype = (res.headers.get('content-type') || '').toLowerCase()
  } catch (e) {
    // 국내 자사몰은 중간 인증서를 빼먹고 내려주는 곳이 흔하다(위즈 계열 전부가 그렇다).
    // 브라우저는 알아서 보정해 주지만 서버끼리는 검증에 실패한다. 여기서 읽는 건 공개된
    // 상품 페이지의 가격뿐이고 자격증명은 아무것도 보내지 않으므로, 검증 실패일 때에 한해
    // 한 번 더 시도한다. 대신 값은 관리자가 눈으로 확인한 뒤 저장한다.
    if (!isCertChainError(e)) {
      return { options: [], reason: '판매 페이지에 연결하지 못했어요.' }
    }
    try {
      const r = await fetchInsecure(url)
      status = r.status
      buf = r.body
      ctype = r.contentType.toLowerCase()
    } catch {
      return { options: [], reason: '판매 페이지에 연결하지 못했어요.' }
    }
  }
  if (status < 200 || status >= 300) {
    return { options: [], reason: `판매 페이지가 ${status}로 응답했어요. 공구가 끝났을 수 있어요.` }
  }

  // 국내 자사몰은 EUC-KR이 흔한데 그대로 UTF-8로 읽으면 옵션명이 통째로 깨진다.
  // Content-Type에 charset이 없으면 문서 앞머리의 meta 선언을 직접 본다.
  let charset = /charset=([\w-]+)/.exec(ctype)?.[1]
  if (!charset) {
    const head = buf.subarray(0, 2048).toString('latin1').toLowerCase()
    charset = /euc-kr|ks_c_5601/.test(head) ? 'euc-kr' : 'utf-8'
  }
  let html: string
  try {
    html = new TextDecoder(charset).decode(buf)
  } catch {
    html = buf.toString('utf-8')
  }

  const options = extractOptionsFromHtml(html)
  if (options.length) return { options, reason: null }

  if (looksSoldEnded(html)) {
    return { options: [], reason: '판매가 끝난 페이지예요. 옵션이 남아 있지 않아요.' }
  }
  return { options: [], reason: '이 쇼핑몰에서는 옵션을 못 읽었어요. 목록을 복사해서 붙여넣어 주세요.' }
}
