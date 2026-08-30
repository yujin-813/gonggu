import Link from 'next/link'
import type { Post } from '@/lib/types'
import { priceQA, periodQA } from '@/lib/postLongtail'

interface Props {
  post: Post
  /** 브랜드 랜딩 페이지는 상품 2건 이상인 브랜드만 있다 — 없는 브랜드로 링크를 걸면
   * 깨진 링크가 되므로 서버(page.tsx)가 미리 확인해 내려준다 */
  brandPageExists: boolean
}

// 검색어를 나열하는 대신, 실제로 있는 데이터로 자연스러운 문장·Q&A를 만든다. 데이터가
// 없는 항목은 아예 안 만든다(원칙 1·2) — 항목마다 독립적으로 판단한다.
export default function PostLongtailInfo({ post, brandPageExists }: Props) {
  const mention = post.influencer_name && post.brand
  const qas = [priceQA(post), periodQA(post)].filter((qa): qa is NonNullable<typeof qa> => qa !== null)

  if (!mention && qas.length === 0) return null

  return (
    <div style={{ padding: '0 16px 16px', fontSize: 13.5, color: '#475569', lineHeight: 1.7 }}>
      {mention && (
        <p style={{ margin: '0 0 10px' }}>
          <Link href={`/influencer/${encodeURIComponent(post.account.replace('@', ''))}`} style={{ color: '#6366f1', fontWeight: 700, textDecoration: 'none' }}>
            {post.influencer_name}
          </Link>
          님이 진행한{' '}
          {brandPageExists ? (
            <Link href={`/brand/${encodeURIComponent(post.brand!)}`} style={{ color: '#6366f1', fontWeight: 700, textDecoration: 'none' }}>
              {post.brand}
            </Link>
          ) : (
            <strong style={{ color: '#334155' }}>{post.brand}</strong>
          )}
          {' '}공구예요.
        </p>
      )}
      {qas.map((qa, i) => (
        <div key={i} style={{ marginBottom: i < qas.length - 1 ? 8 : 0 }}>
          <p style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>Q. {qa.q}</p>
          <p style={{ margin: '2px 0 0' }}>{qa.a}</p>
        </div>
      ))}
    </div>
  )
}
