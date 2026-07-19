import { NextRequest, NextResponse } from 'next/server'
import { loadCollections, saveCollections } from '@/lib/store'
import type { Collection } from '@/lib/types'

function isExpired(c: Collection): boolean {
  return !!c.expiresAt && new Date(c.expiresAt) < new Date()
}

export async function GET(request: NextRequest) {
  const adminMode = request.nextUrl.searchParams.get('admin') === '1'
  let collections = loadCollections()
  if (!adminMode) collections = collections.filter(c => c.productIds.length > 0 && !isExpired(c))
  return NextResponse.json({ collections })
}

export async function POST(request: NextRequest) {
  const data = await request.json()
  if (!data.title) return NextResponse.json({ error: '필수 필드 누락: title' }, { status: 400 })

  const collections = loadCollections()
  const id = (data.id?.trim() || data.title).toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || `col-${Date.now()}`
  if (collections.some(c => c.id === id)) {
    return NextResponse.json({ error: `이미 존재하는 id입니다: ${id}` }, { status: 409 })
  }

  const newCollection: Collection = {
    id,
    title: data.title,
    description: data.description || '',
    emoji: data.emoji || '🛍️',
    color: data.color || '#FF4B7B',
    productIds: Array.isArray(data.productIds) ? data.productIds.map(Number) : [],
    expiresAt: data.expiresAt || null,
    createdAt: new Date().toISOString(),
  }
  collections.unshift(newCollection)
  saveCollections(collections)
  return NextResponse.json({ success: true, collection: newCollection }, { status: 201 })
}
