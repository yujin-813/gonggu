import { NextResponse } from 'next/server'
import { loadPosts, loadScraperStatus } from '@/lib/store'

export async function GET() {
  const status = loadScraperStatus()
  const posts = loadPosts()

  return NextResponse.json({
    ...status,
    total_posts: posts.length,
  })
}
