'use client'
import { CalendarPlus, CalendarClock } from 'lucide-react'
import type { Post } from '@/lib/types'
import { fmtDate, dateOnly } from '@/lib/period'
import { track } from '@/lib/track'
import { SITE_URL } from '@/lib/siteUrl'

/**
 * 아직 안 열린 공구에 붙는 안내. 오픈일을 캘린더에 담아 준다.
 *
 * **왜 우리가 알림을 안 보내나** — 웹 푸시는 우리 방문자 대부분에게 닿지 않는다. iOS는 홈
 * 화면에 추가해야만 되고, 네이버앱·인스타 인앱 브라우저는 Service Worker가 막힌다. 실제로
 * 푸시 구독자가 3주째 2명이다. 캘린더는 어디서나 되고, 로그인도 권한 허용도 필요 없다.
 *
 * 우리가 얻는 것은 캘린더 일정에 담긴 링크다(utm_source=calendar). 그날 알림을 보고 눌러
 * 들어오면 "캘린더 알림" 유입으로 잡히므로, 이 기능이 실제로 사람을 데려오는지 잴 수 있다.
 */
export default function UpcomingNotice({ post }: { post: Post }) {
  if (!post.start_date) return null

  const open = dateOnly(post.start_date)
  const googleUrl =
    'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    `&text=${encodeURIComponent(`[꿀공구] ${post.title} 오픈`)}` +
    `&dates=${open.replace(/-/g, '')}/${open.replace(/-/g, '')}` +
    `&details=${encodeURIComponent(`${post.influencer_name || ''} 공구가 오늘 열려요.\n${SITE_URL}/post/${post.id}?utm_source=calendar&utm_medium=reminder`)}`

  return (
    <div className="ended-wrap">
      <section className="ended-box">
        <h2 className="ended-title">
          <CalendarClock size={17} strokeWidth={2.5} style={{ verticalAlign: '-3px', marginRight: 6 }} />
          {fmtDate(post.start_date)}에 열려요
        </h2>

        <p className="ended-lead">
          아직 열리지 않은 공구예요. 캘린더에 담아 두면 그날 아침에 알려드려요.
        </p>

        <div className="ended-links">
          <a
            href={`/api/calendar/${post.id}`}
            className="ended-link-btn"
            onClick={() => track('click', { postId: post.id, clickType: 'other' })}
          >
            <CalendarPlus size={15} />
            <span>캘린더에 담기</span>
          </a>
        </div>

        <p className="upcoming-alt">
          <a href={googleUrl} target="_blank" rel="noopener noreferrer"
            onClick={() => track('click', { postId: post.id, clickType: 'other' })}>
            구글 캘린더에 추가 →
          </a>
        </p>

        {/* 없는 사실을 적지 않는다 — 오픈 "시각"은 우리도 모른다 */}
        <p className="ended-caution">
          ※ 오픈 시각은 인플루언서가 정합니다. 날짜만 담아 두고 그날 아침에 알려드려요.
          알림 권한이나 로그인은 필요 없어요.
        </p>
      </section>
    </div>
  )
}
