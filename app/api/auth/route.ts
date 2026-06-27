import { NextRequest, NextResponse } from 'next/server'
import { AUTH_COOKIE, computeToken, safeEqual } from '@/lib/auth'

const COOKIE_MAX_AGE = 60 * 60 * 12 // 12시간

// 로그인: 비밀번호 검증 후 httpOnly 쿠키 발급
export async function POST(request: NextRequest) {
  const { password } = await request.json().catch(() => ({ password: '' }))
  const correct = process.env.ADMIN_PASSWORD

  if (!correct) {
    return NextResponse.json({ error: 'ADMIN_PASSWORD가 .env.local에 설정되지 않았습니다' }, { status: 500 })
  }
  if (typeof password !== 'string' || password !== correct) {
    return NextResponse.json({ error: '비밀번호가 틀렸습니다' }, { status: 401 })
  }

  const token = await computeToken(correct)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })
  return res
}

// 현재 세션이 유효한지 확인 (클라이언트가 로그인 상태 판단용)
export async function GET(request: NextRequest) {
  const secret = process.env.ADMIN_PASSWORD
  const token = request.cookies.get(AUTH_COOKIE)?.value
  const authed = !!secret && !!token && safeEqual(token, await computeToken(secret))
  return NextResponse.json({ authed })
}

// 로그아웃: 쿠키 제거
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(AUTH_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
