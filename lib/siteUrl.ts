/**
 * 사이트 주소 — 클라이언트에서도 안전하게 쓸 수 있는 자리.
 *
 * 원래 lib/landing.ts에 있었는데 그 파일은 lib/store를 거쳐 fs를 읽는다. 클라이언트
 * 컴포넌트가 SITE_URL 하나 때문에 landing을 import하면 전 페이지가 500이 난다.
 * landing.ts는 여기서 다시 내보내므로 기존 import는 그대로 동작한다.
 */
export const SITE_URL = 'https://xn--ob0bwir5d.shop'
