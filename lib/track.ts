'use client'
// 세션/방문자ID 발급 및 이벤트 트래킹 — 홈/컬렉션/개별 공구 페이지에서 공통으로 사용

export function getSession(): string {
  let id = sessionStorage.getItem('_dj_sid')
  if (!id) { id = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('_dj_sid', id) }
  return id
}

export function getVisitorId(): string {
  let id = localStorage.getItem('_dj_vid')
  if (!id) { id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); localStorage.setItem('_dj_vid', id) }
  return id
}

// 방문 URL에 ?notrack=1을 한 번 붙이면 이 브라우저는 이후 계속 통계에서 제외된다
// (?notrack=0으로 다시 접속하면 해제) — 테스트를 많이 하는 운영자 본인 브라우저용
function isTrackingDisabled(): boolean {
  return localStorage.getItem('gonggu_no_track') === '1'
}

// 관리자로 로그인된 브라우저(httpOnly 쿠키라 JS로 직접 못 읽어서 서버에 물어봄)는
// 고객 방문으로 잡히면 통계가 왜곡되니 트래킹 대상에서 뺀다 — 모듈 로드당 한 번만 확인.
// 한 번이라도 관리자로 확인되면 notrack 플래그를 남겨서, 로그인 세션이 만료된 뒤에도
// 이 브라우저는 계속 제외된다 (관리자 세션은 12시간이라 그 뒤 방문이 고객으로 잡히던 문제).
// 해제는 기존과 동일하게 ?notrack=0.
//
// 예전엔 이 확인이 끝날 때까지 track()이 기다렸다가 이벤트를 보냈다 — 클릭 한 번에
// /api/auth 왕복 + /api/analytics 왕복 두 번을 순서대로 기다린 셈이다. 쿠팡 링크는
// target="_blank"라 원래 탭이 백그라운드로 밀리는데, 모바일 브라우저는 백그라운드 탭의
// 네트워크 요청을 바로 멈추거나 늦춘다 — 그 사이에 두 번째 왕복(진짜 클릭 기록)이 씹혀서
// 우리 쪽 구매처 클릭수가 쿠팡 파트너스 자체 집계보다 적게 나오는 원인이었다. 이 확인은
// 결과를 기다리지 않고 백그라운드로만 돌린다 — 관리자 여부의 최종 판정은 어차피
// app/api/analytics/route.ts가 서버에서 쿠키·IP까지 다시 확인하므로(D-007) 여기서
// 기다리지 않아도 관리자 트래픽이 새 나가지 않는다.
let adminSessionCheck: Promise<boolean> | null = null
function checkAdminSession() {
  if (adminSessionCheck) return
  adminSessionCheck = fetch('/api/auth')
    .then(r => r.json())
    .then(d => {
      if (d.authed) localStorage.setItem('gonggu_no_track', '1')
      return !!d.authed
    })
    .catch(() => false)
}

// 어떤 버튼을 눌렀는지 — 공구 링크와 대체 구매처(쿠팡/네이버) 클릭을 구분해야
// "공구는 끝났는데 구매 수요는 남아 있다"를 데이터로 확인할 수 있다.
// calendar(캘린더에 담기)는 구매·수수료와 무관해서 따로 둔다 — 'other'에 섞이면
// 수익화 현황의 "구매처 클릭률"이 오염된다. lib/analytics.ts의 ClickType과 같이 맞출 것
export type ClickType = 'groupbuy' | 'coupang' | 'naver' | 'other' | 'detail' | 'calendar'

// 유입 경로는 "이 방문의 첫 진입"에서만 의미가 있다. 사이트 안을 돌아다니면 referrer가
// 우리 도메인으로 바뀌고 URL의 utm도 사라지므로, 처음 들어온 순간 값을 세션에 넣어 두고
// 그 방문 내내 같은 값을 쓴다.
const ENTRY_KEY = '_dj_entry'

function entryInfo(): { referrer: string | null; utmSource: string | null } {
  try {
    const saved = sessionStorage.getItem(ENTRY_KEY)
    if (saved) return JSON.parse(saved)
    const utm = new URLSearchParams(location.search).get('utm_source')
    const ref = document.referrer || null
    const info = {
      referrer: ref && !ref.includes(location.host) ? ref : null,
      utmSource: utm,
    }
    sessionStorage.setItem(ENTRY_KEY, JSON.stringify(info))
    return info
  } catch {
    return { referrer: null, utmSource: null }
  }
}

export function track(type: string, extra?: { postId?: number; clickType?: ClickType; query?: string }) {
  if (isTrackingDisabled()) return
  checkAdminSession()
  const entry = entryInfo()
  fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // 쿠팡·네이버 클릭은 target="_blank"로 새 탭을 열자마자 원래 탭이 백그라운드로
    // 밀린다 — keepalive 없이는 브라우저가 이 요청을 그대로 취소할 수 있다(페이지 이동·
    // 백그라운드 전환 중에도 요청이 살아남게 하는 옵션. 본문이 작아 제한(64KB)에 안 걸림).
    keepalive: true,
    body: JSON.stringify({
      type,
      sessionId: getSession(),
      visitorId: getVisitorId(),
      postId: extra?.postId,
      clickType: extra?.clickType,
      query: extra?.query,
      referrer: entry.referrer,
      utmSource: entry.utmSource,
    }),
  }).catch(() => {})
}
