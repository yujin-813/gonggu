'use client'
import Link from 'next/link'
import type { Post } from '@/lib/types'
import { getPeriodState, badgeFromState } from '@/lib/period'
import { categoryIcon } from '@/lib/categoryIcons'
import { track } from '@/lib/track'
import { getDealVerdict } from '@/lib/dealGrade'
import GradeIcon from './GradeIcon'
import { Users } from 'lucide-react'

// 홈에서 "제목 + 더보기 + 작은 카드 가로줄"로 훑어보는 영역.
// 전체 크기 PostCard는 정보가 많아 한 화면에 두세 개밖에 안 들어가는데, 홈은 "무엇이 있는지"
// 빠르게 보고 관심 있는 쪽으로 들어가는 자리라 작은 카드가 맞다. 상세 판단 정보(가격 비교,
// 구매 판단 문구)는 눌러서 들어간 상세 페이지에서 보여준다.

interface Props {
  title: string
  /** 운영자가 직접 고른 영역 — 크기는 같게 두고 배경으로만 구분한다 */
  highlight?: boolean
  /** 제목 왼쪽 아이콘 — 이모지는 기기마다 모양이 달라 쓰지 않는다 */
  icon?: React.ReactNode
  /** 우측 "더보기"가 향하는 곳 — 없으면 버튼을 숨긴다 */
  moreHref?: string
  posts: Post[]
}

export default function DealStrip({ title, icon, moreHref, posts, highlight }: Props) {
  if (posts.length === 0) return null

  return (
    <section className={`strip ${highlight ? "strip-pick" : ""}`}>
      <div className="strip-head">
        <h2 className="strip-title">{icon}{title}</h2>
        {moreHref && <Link href={moreHref} className="strip-more">더보기 →</Link>}
      </div>

      <div className="strip-scroll">
        {posts.map(p => {
          const badge = badgeFromState(getPeriodState(p))
          const v = getDealVerdict(p)
          const display = v.display
          const CatIcon = categoryIcon(p.cat)
          return (
            <Link
              key={p.id}
              href={`/post/${p.id}`}
              className="strip-card"
              onClick={() => track('click', { postId: p.id, clickType: 'detail' })}
            >
              <div className="strip-thumb">
                {p.img
                  ? <img src={p.img} alt={p.title} loading="lazy" />
                  : <div className="strip-thumb-empty"><CatIcon size={22} strokeWidth={1.5} /></div>}
                {/* 좌상단은 판정이 차지한다 — 홈을 훑을 때 판정 배지가 반복해서 보여야
                    "가격을 판정해주는 곳"이라는 게 전달된다. 마감은 아래 작은 칩으로 내린다. */}
                <span className={`strip-grade grade-solid-${display.key}`}>
                  <GradeIcon state={display.key} size={11} />{display.label}
                </span>
                {badge && <span className={`strip-badge ${badge.cls}`}>{badge.txt}</span>}
              </div>
              <p className="strip-name">{p.title}</p>
              {(v.fromPrice ?? p.price) > 0 && (
                <p className="strip-price">
                  {v.fromPrice ? `${v.fromPrice.toLocaleString()}원부터` : `${p.price.toLocaleString()}원`}
                </p>
              )}
            </Link>
          )
        })}
      </div>
    </section>
  )
}

/** 인플루언서별 영역 — 상품이 아니라 사람을 보여주므로 카드 모양이 다르다 */
export function InfluencerStrip({
  influencers,
}: {
  influencers: { account: string; name: string; count: number; img: string | null }[]
}) {
  if (influencers.length === 0) return null
  return (
    <section className="strip">
      <div className="strip-head">
        <h2 className="strip-title"><Users size={17} strokeWidth={2.5} />인플루언서별 공구</h2>
        <Link href="/influencers" className="strip-more">더보기 →</Link>
      </div>
      <div className="strip-scroll">
        {influencers.map(inf => (
          <Link
            key={inf.account}
            href={`/influencer/${encodeURIComponent(inf.account.replace('@', ''))}`}
            className="strip-card strip-card-influencer"
          >
            <div className="strip-avatar">
              {inf.img
                ? <img src={inf.img} alt="" loading="lazy" />
                : <span>{inf.name.slice(0, 2)}</span>}
            </div>
            <p className="strip-name">{inf.name}</p>
            <p className="strip-sub">공구 {inf.count}개</p>
          </Link>
        ))}
      </div>
    </section>
  )
}
