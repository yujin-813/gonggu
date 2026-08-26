import { SITE_URL } from './siteUrl'

// IndexNow — 신규등록·가격변경·마감상태 변경이 있을 때 "이 URL이 바뀌었다"고 검색엔진에
// 바로 알린다. 빙·네이버·야후 등이 이 API를 같이 쓴다(https://www.indexnow.org). 크롤러가
// 알아서 재방문할 때까지 기다리는 대신, 바뀐 순간 알려서 색인 반영을 앞당긴다.
//
// 키는 비밀값이 아니라 "이 사이트 소유자가 보낸 요청이 맞다"는 확인용 토큰이다 —
// public/<key>.txt에 키 값 그대로 올려두는 게 프로토콜 요구사항이다.
const INDEXNOW_KEY = 'c530a4c136fc0181be30eefe13626e3b'
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'

/**
 * urls를 IndexNow에 통보한다. 실패해도 조용히 넘어간다 — 검색엔진 알림은 있으면 좋은
 * 보너스지 저장 자체를 막을 이유가 아니다(외부 API가 느리거나 죽어도 관리자 저장은
 * 그대로 성공해야 한다).
 */
export async function pingIndexNow(urls: string[]): Promise<void> {
  const list = urls.filter(Boolean)
  if (list.length === 0) return
  try {
    const host = new URL(SITE_URL).host
    await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host,
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
        urlList: list,
      }),
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    // 조용히 무시 — 다음 정기 크롤링이 대신한다
  }
}

export function postUrl(id: number): string {
  return `${SITE_URL}/post/${id}`
}
