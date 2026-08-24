import { NextResponse } from 'next/server'
import { loadPosts } from '@/lib/store'
import { SITE_URL } from '@/lib/landing'
import { dateOnly } from '@/lib/period'

/**
 * 오픈 예정 공구를 캘린더에 담아 준다.
 *
 * 알림을 우리가 보내지 않는다. 웹 푸시는 우리 방문자 대부분에게 닿지 않는다 — iOS는 홈
 * 화면에 추가해야만 되고, 네이버앱·인스타 인앱 브라우저는 Service Worker가 막힌다(그래서
 * 3주째 구독자가 2명이다). 캘린더는 어디서나 되고, 발송도 구독자 관리도 필요 없다.
 *
 * **종일 일정으로 만든다.** 오픈 "시각"은 우리가 모른다. 오전 10시 같은 값을 지어 넣으면
 * 화면에 없는 사실이 적힌다 — 마감일을 모를 때 날짜를 만들지 않기로 한 것과 같다(D-026).
 * 대신 VALARM으로 그날 아침 9시에 울리게만 한다.
 */

/** RFC 5545 TEXT 이스케이프 — 쉼표·세미콜론·역슬래시·줄바꿈 */
function esc(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/**
 * 75옥텟 넘는 줄은 접어야 한다. 한글은 한 글자가 3바이트라 제목이 조금만 길어도 넘고,
 * 안 접으면 일부 캘린더 앱이 파일을 통째로 거부한다.
 */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= 73) return line
  const out: string[] = []
  let buf = Buffer.alloc(0)
  for (const ch of line) {
    const b = Buffer.from(ch, 'utf8')
    if (buf.length + b.length > (out.length === 0 ? 73 : 72)) {
      out.push(buf.toString('utf8'))
      buf = Buffer.alloc(0)
    }
    buf = Buffer.concat([buf, b])
  }
  if (buf.length) out.push(buf.toString('utf8'))
  return out.join('\r\n ')
}

function ymd(dateStr: string): string {
  return dateOnly(dateStr).replace(/-/g, '')
}

function nextDay(dateStr: string): string {
  const d = new Date(`${dateOnly(dateStr)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  const post = loadPosts().find(p => p.id === id)
  if (!post || !post.start_date) {
    return NextResponse.json({ error: '오픈일이 없는 공구예요' }, { status: 404 })
  }

  // 캘린더에서 눌러 들어온 방문을 따로 세려면 utm이 필요하다
  const url = `${SITE_URL}/post/${post.id}?utm_source=calendar&utm_medium=reminder`
  const who = post.influencer_name || (post.account || '').replace('@', '')
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//gonggu//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:gonggu-${post.id}@gonggu.asknuggetdata.com`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(post.start_date)}`,
    `DTEND;VALUE=DATE:${nextDay(post.start_date)}`,
    fold(`SUMMARY:${esc(`[꿀공구] ${post.title} 오픈`)}`),
    fold(`DESCRIPTION:${esc(`${who ? `${who} ` : ''}공구가 오늘 열려요.\n${url}`)}`),
    fold(`URL:${url}`),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:PT9H',
    fold(`DESCRIPTION:${esc(`${post.title} 공구가 오늘 열려요`)}`),
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return new NextResponse(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="gonggu-${post.id}.ics"`,
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
