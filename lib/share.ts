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
export async function shareContent(opts: ShareContentOpts): Promise<ShareResult> {
  const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY
  try {
    if (kakaoKey && window.Kakao) {
      if (!window.Kakao.isInitialized()) window.Kakao.init(kakaoKey)
      window.Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: opts.title,
          description: opts.description,
          imageUrl: opts.imageUrl || `${new URL(opts.url).origin}/favicon.ico`,
          link: { mobileWebUrl: opts.url, webUrl: opts.url },
        },
        buttons: [{ title: opts.buttonLabel, link: { mobileWebUrl: opts.url, webUrl: opts.url } }],
      })
      return 'kakao'
    }
    if (navigator.share) {
      await navigator.share({ title: opts.title, text: opts.description, url: opts.url })
      return 'native'
    }
    await navigator.clipboard.writeText(opts.url)
    return 'clipboard'
  } catch {
    // 사용자가 공유를 취소한 경우 등 — 조용히 무시
    return 'failed'
  }
}
