// 인증 토큰 계산 — Edge(middleware)와 Node(API 라우트) 양쪽에서 사용하므로
// fs 등 Node 전용 모듈을 import하지 않고 Web Crypto만 사용한다.

export const AUTH_COOKIE = 'dj_admin'

// ADMIN_PASSWORD로부터 결정론적 토큰을 만든다.
// 비밀번호가 노출돼도 역산이 불가능하고, 서버는 동일 계산으로 검증한다.
export async function computeToken(secret: string): Promise<string> {
  const data = new TextEncoder().encode(`dealjoa-admin:${secret}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// 타이밍 공격 완화를 위한 상수 시간 비교
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
