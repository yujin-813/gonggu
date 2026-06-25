import { NextRequest, NextResponse } from 'next/server'
import { writeFile } from 'fs/promises'
import path from 'path'
import { existsSync, mkdirSync } from 'fs'

const UPLOAD_DIR  = path.join(process.cwd(), 'public', 'uploads')
const MAX_BYTES   = 10 * 1024 * 1024   // 10 MB
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
}

export async function POST(request: NextRequest) {
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 })

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'JPG, PNG, WEBP, GIF만 허용됩니다' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: '파일 크기는 10MB 이하여야 합니다' }, { status: 400 })
  }

  const ext      = EXT_MAP[file.type] || 'jpg'
  const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  const filepath = path.join(UPLOAD_DIR, filename)

  const bytes  = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  await writeFile(filepath, buffer, { mode: 0o644 })

  return NextResponse.json({ url: `/uploads/${filename}` })
}
