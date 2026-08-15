'use client'
import type { Post } from '@/lib/types'
import { getDealVerdict, rateText, type DealGradeKey } from '@/lib/dealGrade'

// "이 공구 진짜 싼가?"에 답하는 블록. 공구가와 다른 판매처 가격을 나란히 놓고 등급을 붙인다.
// 숫자를 먼저 보여주고 판정을 뒤에 두는 순서인데, 판정만 있으면 "그래서 왜?"가 남고
// 숫자만 있으면 직접 계산해야 하기 때문이다.

export function GradeBadge({ grade, size = 'md' }: { grade: { emoji: string; label: string; key: DealGradeKey }; size?: 'sm' | 'md' }) {
  return (
    <span className={`grade-badge grade-${grade.key} grade-${size}`}>
      {grade.emoji} {grade.label}
    </span>
  )
}

export default function DealVerdictBox({ post }: { post: Post }) {
  const v = getDealVerdict(post)

  // 다른 판매처 가격을 하나도 모르면 등급을 붙이지 않는다 — 모르는 걸 판정하면 그건 추측이다
  if (!v.grade) {
    if (v.exclusive) {
      return (
        <div className="verdict-box verdict-exclusive">
          <p className="verdict-head">여기서만 만나볼 수 있어요</p>
          <p className="verdict-line">다른 곳에서는 판매하지 않는 공구 전용 상품이에요.</p>
        </div>
      )
    }
    return (
      <div className="verdict-box verdict-unknown">
        <p className="verdict-head">아직 비교할 가격을 못 찾았어요</p>
        <p className="verdict-line">다른 판매처에서 검색되지 않아 저렴한지 판단하기 어려워요.</p>
      </div>
    )
  }

  return (
    <div className={`verdict-box verdict-${v.grade.key}`}>
      <div className="verdict-head-row">
        <span className="verdict-label">꿀공구 판정</span>
        <GradeBadge grade={v.grade} />
      </div>

      <table className="verdict-table">
        <tbody>
          <tr className="verdict-row-main">
            <th>공구가</th>
            <td>{post.price.toLocaleString()}원</td>
          </tr>
          {v.comparePrices.map(c => (
            <tr key={c.label}>
              <th>{c.label}</th>
              <td>{c.price.toLocaleString()}원</td>
            </tr>
          ))}
        </tbody>
      </table>

      {v.discountRate !== null && (
        <p className="verdict-rate">
          {v.referenceLabel} 대비 <strong>약 {rateText(v.discountRate)}</strong>
        </p>
      )}

      <p className="verdict-line">{v.customLine || v.grade.line}</p>

      {v.comparePrices.some(c => c.checkedAt) && (
        <p className="verdict-note">
          ※ 다른 판매처 가격은 확인 시점 기준이라 지금과 다를 수 있어요
          {(() => {
            const at = v.comparePrices.find(c => c.checkedAt)?.checkedAt
            return at ? ` (확인: ${at.slice(0, 10)})` : ''
          })()}
        </p>
      )}
    </div>
  )
}
