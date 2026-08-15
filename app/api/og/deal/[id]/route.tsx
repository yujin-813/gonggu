import { ImageResponse } from 'next/og'
import { loadPosts } from '@/lib/store'
import { isPagePublic, getPeriodState, fmtDate } from '@/lib/period'
import { getDealVerdict, rateText } from '@/lib/dealGrade'

// 카카오톡·DM으로 보냈을 때 링크를 누르기 전에 이미 "싼지 아닌지"가 읽히는 이미지.
// 상품 사진만 보내면 그냥 광고로 보이지만, 가격 비교와 판정이 그려져 있으면 받는 사람이
// 열어볼 이유가 생긴다. 이게 이 서비스가 입소문 나는 경로다.
//
// 카카오 피드 썸네일 권장 비율(2:1)에 맞춘다.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const W = 800
const H = 400

const GRADE_COLOR: Record<string, { bg: string; fg: string }> = {
  honey: { bg: '#FFF3D6', fg: '#B45309' },
  good:  { bg: '#DCFCE7', fg: '#15803D' },
  hmm:   { bg: '#FEF9C3', fg: '#854D0E' },
  meh:   { bg: '#FFF1F2', fg: '#BE123C' },
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  const post = Number.isNaN(id) ? null : loadPosts().find(p => p.id === id)

  if (!post || !isPagePublic(post)) {
    return new ImageResponse(
      (
        <div style={{
          width: '100%', height: '100%', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: '#F8F8F8', color: '#AAAAAA', fontSize: 30,
        }}>
          꿀공구
        </div>
      ),
      { width: W, height: H },
    )
  }

  const v = getDealVerdict(post)
  const color = v.grade ? GRADE_COLOR[v.grade.key] : { bg: '#F1F5F9', fg: '#475569' }
  const period = getPeriodState(post)
  const dday =
    period.kind === 'range' || period.kind === 'deadline_only'
      ? period.daysLeft < 0 ? '마감됨' : period.daysLeft === 0 ? '오늘 마감' : `마감 D-${period.daysLeft}`
      : period.kind === 'upcoming' ? `${fmtDate(period.startDate)} 오픈 예정` : ''

  // 비교 가격은 두 개까지만 — 더 넣으면 글자가 작아져서 폰에서 안 읽힌다
  const compares = v.comparePrices.slice(0, 2)

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: '#FFFFFF', padding: '36px 40px', fontFamily: 'sans-serif',
      }}>
        {/* 머리 — 브랜드와 판정 등급 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 22, fontWeight: 800, color: '#F0A500' }}>
            꿀공구 판정
          </div>
          {v.grade && (
            <div style={{
              display: 'flex', alignItems: 'center',
              background: color.bg, color: color.fg,
              fontSize: 28, fontWeight: 800,
              padding: '8px 20px', borderRadius: 999,
            }}>
              {v.grade.label}
            </div>
          )}
        </div>

        {/* 상품명 */}
        <div style={{
          display: 'flex', marginTop: 22, fontSize: 34, fontWeight: 800, color: '#1A1A1A',
          lineHeight: 1.25, maxHeight: 88, overflow: 'hidden',
        }}>
          {post.title.length > 42 ? `${post.title.slice(0, 42)}…` : post.title}
        </div>

        {/* 가격 비교 — 공구가를 크게, 다른 판매처를 옆에 작게 */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28, marginTop: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 19, color: '#888888', fontWeight: 600 }}>공구가</span>
            <span style={{ fontSize: 52, fontWeight: 900, color: '#1A1A1A', lineHeight: 1.1 }}>
              {post.price.toLocaleString()}원
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 8 }}>
            {compares.map(c => (
              <span key={c.label} style={{ fontSize: 21, color: '#888888' }}>
                {c.label} {c.price.toLocaleString()}원
              </span>
            ))}
          </div>
        </div>

        {/* 바닥 — 할인율과 마감 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 22, paddingTop: 18, borderTop: '2px solid #EEEEEE',
        }}>
          <span style={{ fontSize: 26, fontWeight: 800, color: color.fg }}>
            {v.discountRate !== null
              ? `${v.referenceLabel} 대비 약 ${rateText(v.discountRate)}`
              : '가격 비교 정보 없음'}
          </span>
          {dday && <span style={{ fontSize: 22, fontWeight: 700, color: '#888888' }}>{dday}</span>}
        </div>
      </div>
    ),
    { width: W, height: H },
  )
}
