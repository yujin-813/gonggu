import { NextRequest, NextResponse } from 'next/server'
import { loadCollections, saveCollections, loadPosts } from '@/lib/store'
import type { Collection } from '@/lib/types'
import { isCustomerVisible } from '@/lib/period'

type Ctx = { params: { id: string } }

export async function GET(request: NextRequest, { params }: Ctx) {
  const adminMode = request.nextUrl.searchParams.get('admin') === '1'
  const collection = loadCollections().find(c => c.id === params.id)
  if (!collection) return NextResponse.json({ error: '컬렉션을 찾을 수 없습니다' }, { status: 404 })

  const allPosts = loadPosts()
  const postMap = new Map(allPosts.map(p => [p.id, p]))
  // productIds 순서를 그대로 유지 — 관리자가 큐레이션한 순서가 노출 순서
  let posts = collection.productIds.map(id => postMap.get(id)).filter((p): p is NonNullable<typeof p> => !!p)
  if (!adminMode) posts = posts.filter(isCustomerVisible)

  return NextResponse.json({ collection, posts })
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const body = await request.json()
  const collections = loadCollections()
  const idx = collections.findIndex(c => c.id === params.id)
  if (idx === -1) return NextResponse.json({ error: '컬렉션을 찾을 수 없습니다' }, { status: 404 })

  const allowed: (keyof Collection)[] = ['title', 'description', 'emoji', 'color', 'productIds', 'expiresAt']
  const patch: Partial<Collection> = {}
  for (const key of allowed) {
    if (key in body) (patch as Record<string, unknown>)[key] = body[key]
  }
  if (patch.productIds) patch.productIds = patch.productIds.map(Number)
  collections[idx] = { ...collections[idx], ...patch }
  saveCollections(collections)
  return NextResponse.json({ success: true, collection: collections[idx] })
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const collections = loadCollections()
  const filtered = collections.filter(c => c.id !== params.id)
  if (filtered.length === collections.length) {
    return NextResponse.json({ error: '컬렉션을 찾을 수 없습니다' }, { status: 404 })
  }
  saveCollections(filtered)
  return NextResponse.json({ success: true })
}
