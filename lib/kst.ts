/**
 * 서버가 UTC로 돈다(EC2 기본 타임존, `Etc/UTC` 확인됨). 공구 일정은 전부 한국 시간
 * 기준이라, 날짜 경계를 다루는 곳은 전부 이 파일을 거쳐야 한다.
 *
 * 예전엔 `lib/period.ts`의 `daysLeft()`가 `new Date()`를 서버 로컬(=UTC) 자정 기준으로
 * 그대로 썼다. UTC 15:00~23:59(KST 00:00~08:59, 한국 새벽)에는 KST 날짜가 UTC 날짜보다
 * 하루 앞서서, 그 9시간 동안 "오늘 오픈"·D-day·마감 판정이 하루 밀려 보였다. 예를 들어
 * KST 새벽 2시에 마감인 공구가 실제로는 이미 끝났는데 "오늘 마감"으로 계속 떠 있었다.
 *
 * `lib/landing.ts`의 `kstToday()`가 원래 이 자리에 있었다 — 클라이언트에서도 쓰려고
 * `lib/siteUrl.ts`를 뺀 것과 같은 이유로, `period.ts`가 `landing.ts`를 import하면
 * 순환 참조가 생겨서 여기로 옮기고 `landing.ts`는 다시 내보낸다.
 */
export function kstNow(): Date {
  return new Date(Date.now() + 9 * 60 * 60 * 1000)
}

export function kstToday(): string {
  return kstNow().toISOString().slice(0, 10)
}
