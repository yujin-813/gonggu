import { NextRequest, NextResponse } from 'next/server'

const TOKEN = 'gonggu-admin-ok'  // sessionStorage에 저장할 값 (서버에서도 검증용)

export async function POST(request: NextRequest) {
  const { password } = await request.json()
  const correct = process.env.ADMIN_PASSWORD

  if (!correct) {
    return NextResponse.json({ error: 'ADMIN_PASSWORD가 .env.local에 설정되지 않았습니다' }, { status: 500 })
  }
  if (password !== correct) {
    return NextResponse.json({ error: '비밀번호가 틀렸습니다' }, { status: 401 })
  }

  return NextResponse.json({ token: TOKEN })
}

export async function GET() {
  return NextResponse.json({ token: TOKEN })
}
