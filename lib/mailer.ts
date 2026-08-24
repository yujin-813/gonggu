import nodemailer from 'nodemailer'

/**
 * 제휴 문의 메일 발송.
 *
 * SMTP 계정이 없으면 조용히 실패하지 않고 그 사실을 로그로 남긴다 — 서버 콘솔을 안 보면
 * 아무도 모르는 채로 문의가 계속 안 보내질 수 있다. 다만 이메일 발송 실패가 사용자 제출
 * 자체를 막지는 않는다 — data/inquiries.json에 먼저 저장한 뒤(lib/inquiries.ts) 메일은
 * "보너스"로 시도한다. 메일 서버가 죽어도 문의는 안 사라진다.
 *
 * 필요한 환경변수 (.env.local, 서버):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS — 발신 계정
 *   INQUIRY_TO_EMAIL — 받는 주소 (없으면 SMTP_USER로 보낸다)
 *
 * 네이버 메일을 쓴다면: 네이버 메일 설정 > POP3/IMAP/SMTP 설정에서 SMTP를 켜야 하고,
 * 2단계 인증을 쓰면 일반 비밀번호가 아니라 애플리케이션 비밀번호를 따로 발급해야 한다.
 *   SMTP_HOST=smtp.naver.com  SMTP_PORT=465
 */
let transporter: ReturnType<typeof nodemailer.createTransport> | null | undefined

function getTransporter() {
  if (transporter !== undefined) return transporter
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    console.warn('[mailer] SMTP_HOST/PORT/USER/PASS가 없어 메일 발송을 건너뜁니다. 문의는 data/inquiries.json에는 저장됩니다.')
    transporter = null
    return transporter
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT, 10),
    secure: parseInt(SMTP_PORT, 10) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })
  return transporter
}

export async function sendInquiryEmail(opts: {
  kind: string
  name: string
  contact: string
  link?: string | null
  product?: string | null
  message: string
}): Promise<boolean> {
  const t = getTransporter()
  if (!t) return false

  const to = process.env.INQUIRY_TO_EMAIL || process.env.SMTP_USER
  const kindLabel = { influencer: '인플루언서', brand: '브랜드', company: '업체' }[opts.kind] || opts.kind

  try {
    await t.sendMail({
      from: process.env.SMTP_USER,
      to,
      replyTo: /.+@.+\..+/.test(opts.contact) ? opts.contact : undefined,
      subject: `[꿀공구 제휴 문의] ${kindLabel} · ${opts.name}`,
      text: [
        `구분: ${kindLabel}`,
        `이름: ${opts.name}`,
        `연락처: ${opts.contact}`,
        opts.link ? `인스타그램/사이트: ${opts.link}` : null,
        opts.product ? `공구 상품: ${opts.product}` : null,
        '',
        '제안 내용:',
        opts.message,
      ].filter(Boolean).join('\n'),
    })
    return true
  } catch (e) {
    console.error('[mailer] 발송 실패:', e)
    return false
  }
}
