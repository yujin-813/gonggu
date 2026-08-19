// Kakao SDK는 layout.tsx에서 전역으로 한 번만 로드하고, 이 파일에서 그 타입을 선언해
// PostCard/컬렉션 상세 등 여러 곳에서 공통으로 쓴다.
declare global {
  interface Window {
    Kakao?: {
      isInitialized: () => boolean
      init: (key: string) => void
      Share: { sendDefault: (opts: Record<string, unknown>) => void }
    }
  }
}

export type ShareResult = 'kakao' | 'native' | 'clipboard' | 'failed'

interface ShareContentOpts {
  title: string
  description: string
  imageUrl?: string
  url: string
  buttonLabel: string
}

// 카카오 SDK 있으면 카카오톡 공유, 없으면 OS 공유 시트(navigator.share), 그것도 없으면
// 클립보드 복사로 단계적으로 대체 — 어떤 경로로 공유됐는지 돌려줘서 호출부가 클립보드일 때만
// "복사됐어요" 토스트를 띄우도록 한다 (카카오/OS 공유는 자체 UI 피드백이 있어서 중복 안내 불필요)
/**
 * 공유 링크에 유입 경로 표시를 붙인다.
 *
 * 인스타그램·카카오톡 인앱 브라우저는 리퍼러를 안 보내서, 이게 없으면 우리 주력 유입이
 * 전부 "직접 방문"으로 뭉쳐 어디서 왔는지 알 수 없다. 이미 utm이 붙어 있으면 건드리지 않는다.
 */
function withUtm(url: string, source: string): string {
  try {
    const u = new URL(url)
    if (u.searchParams.has('utm_source')) return url
    u.searchParams.set('utm_source', source)
    u.searchParams.set('utm_medium', 'share')
    return u.toString()
  } catch {
    return url
  }
}

export async function shareContent(opts: ShareContentOpts): Promise<ShareResult> {
  const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY
  try {
    if (kakaoKey && window.Kakao) {
      if (!window.Kakao.isInitialized()) window.Kakao.init(kakaoKey)
      const kakaoUrl = withUtm(opts.url, 'kakao')
      window.Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: opts.title,
          description: opts.description,
          imageUrl: opts.imageUrl || `${new URL(opts.url).origin}/favicon.ico`,
          link: { mobileWebUrl: kakaoUrl, webUrl: kakaoUrl },
        },
        buttons: [{ title: opts.buttonLabel, link: { mobileWebUrl: kakaoUrl, webUrl: kakaoUrl } }],
      })
      return 'kakao'
    }
    if (navigator.share) {
      await navigator.share({ title: opts.title, text: opts.description, url: withUtm(opts.url, 'share') })
      return 'native'
    }
    await navigator.clipboard.writeText(withUtm(opts.url, 'copy'))
    return 'clipboard'
  } catch {
    // 사용자가 공유를 취소한 경우 등 — 조용히 무시
    return 'failed'
  }
}
