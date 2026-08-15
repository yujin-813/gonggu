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
// 고객 방문으로 잡히면 통계가 왜곡되니 자동으로 트래킹 대상에서 뺀다 — 모듈 로드당 한 번만 확인.
// 한 번이라도 관리자로 확인되면 notrack 플래그를 남겨서, 로그인 세션이 만료된 뒤에도
// 이 브라우저는 계속 제외된다 (관리자 세션은 12시간이라 그 뒤 방문이 고객으로 잡히던 문제).
// 해제는 기존과 동일하게 ?notrack=0.
let adminSessionCheck: Promise<boolean> | null = null
function isAdminSession(): Promise<boolean> {
  if (!adminSessionCheck) {
    adminSessionCheck = fetch('/api/auth')
      .then(r => r.json())
      .then(d => {
        const authed = !!d.authed
        if (authed) localStorage.setItem('gonggu_no_track', '1')
        return authed
      })
      .catch(() => false)
  }
  return adminSessionCheck
}

// 어떤 버튼을 눌렀는지 — 공구 링크와 대체 구매처(쿠팡/네이버) 클릭을 구분해야
// "공구는 끝났는데 구매 수요는 남아 있다"를 데이터로 확인할 수 있다
export type ClickType = 'groupbuy' | 'coupang' | 'naver' | 'other' | 'detail'

export async function track(type: string, extra?: { postId?: number; clickType?: ClickType }) {
  if (isTrackingDisabled()) return
  if (await isAdminSession()) return
  fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type,
      sessionId: getSession(),
      visitorId: getVisitorId(),
      postId: extra?.postId,
      clickType: extra?.clickType,
    }),
  }).catch(() => {})
}
