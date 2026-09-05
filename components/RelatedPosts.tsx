import Link from 'next/link'
import type { Post } from '@/lib/types'
import { isExpired } from '@/lib/period'

interface Props {
  posts: Post[]
  kind: 'similar' | 'influencer' | 'category'
}

/**
 * 진행 중 공구 하단 "비슷한 공구". 마감 페이지(EndedDealNotice)와 같은 관련도 등급을
 * 쓰지만 카테고리 폴백이 없어서(app/post/[id]/page.tsx의 getActiveRelated 참고), 후보가
 * 없으면 그냥 아무것도 안 그린다 — "없어요" 문구도 안 보여준다. 잘 팔리는 딜 밑에 빈말을
 * 붙일 이유가 없다(원칙 2).
 */
export default function RelatedPosts({ posts, kind }: Props) {
  if (posts.length === 0) return null
  return (
    <section className="ended-related" style={{ marginTop: 8 }}>
      <h2 className="ended-related-title">
        {kind === 'similar' ? '이런 건 어때요?' : '같은 인플루언서의 다른 공구'}
      </h2>
      <ul className="ended-related-list">
        {posts.map(r => (
          <li key={r.id}>
            <Link href={`/post/${r.id}`} className="ended-related-item">
              {r.img && <img src={r.img} alt="" loading="lazy" />}
              <span className="ended-related-info">
                <span className="ended-related-name">{r.title}</span>
                <span className="ended-related-meta">
                  {r.price > 0 && <span className="ended-related-price">{r.price.toLocaleString()}원</span>}
                  {isExpired(r) && <span className="ended-related-buyable">지금 살 수 있어요</span>}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
