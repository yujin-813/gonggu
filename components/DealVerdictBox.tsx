'use client'
import type { Post } from '@/lib/types'
import { getDealVerdict, rateText, type VerdictDisplay } from '@/lib/dealGrade'
import GradeIcon from './GradeIcon'

// "이 공구 진짜 싼가?"에 답하는 블록. 공구가와 다른 판매처 가격을 나란히 놓고 판정을 붙인다.
// 숫자를 먼저 보여주고 판정을 뒤에 두는 순서인데, 판정만 있으면 "그래서 왜?"가 남고
// 숫자만 있으면 직접 계산해야 하기 때문이다.
//
// 비교 가격이 없을 때도 레이아웃은 똑같이 유지한다. 회색 안내문 하나로 끝내면 옆 카드와
// 정보 밀도가 너무 달라져서 "정보가 빠진 실패 상태"로 읽히는데, 실제로는 아직 확인하지 못한
// "판정 대기"일 뿐이다.

export function GradeBadge({ display, size = 'md' }: { display: VerdictDisplay; size?: 'sm' | 'md' }) {
  return (
    <span className={`grade-badge grade-${display.key} grade-${size}`}>
      <GradeIcon state={display.key} size={size === 'sm' ? 11 : 13} />
      {display.label}
    </span>
  )
}

export default function DealVerdictBox({ post }: { post: Post }) {
  const v = getDealVerdict(post)

  return (
    <div className={`verdict-box verdict-${v.display.key}`}>
      <div className="verdict-head-row">
        <span className="verdict-label">꿀공구 판정</span>
        <GradeBadge display={v.display} />
      </div>

      <table className="verdict-table">
        <tbody>
          <tr className="verdict-row-main">
            {/* 여러 상품 공구의 price는 최저가가 아니라 대표 가격이다 — 그렇게 밝힌다 */}
            <th>{v.display.key === 'multi' ? '대표 공구가' : '공구가'}</th>
            <td>{post.price ? `${post.price.toLocaleString()}원` : '—'}</td>
          </tr>
          {v.comparePrices.length > 0 ? (
            v.comparePrices.map(c => (
              <tr key={c.label}>
                <th>{c.label}</th>
                <td>{c.price.toLocaleString()}원</td>
              </tr>
            ))
          ) : (
            // 비교가 줄을 지우지 않고 "—"로 남긴다 — 줄이 통째로 사라지면 표가 무너져
            // 다른 카드와 모양이 달라진다
            <tr>
              <th>비교가</th>
              <td className="verdict-empty">—</td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="verdict-rate">
        {v.discountRate !== null
          ? <>{v.referenceLabel} 대비 <strong>약 {rateText(v.discountRate)}</strong></>
          : <strong>{
              v.display.key === 'exclusive' ? '여기서만 만나볼 수 있어요'
              : v.display.key === 'multi' ? '상품별로 가격이 달라요'
              : '아직 가격 비교가 어려워요'
            }</strong>}
      </p>

      <p className="verdict-line">{v.customLine || v.display.line}</p>

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
