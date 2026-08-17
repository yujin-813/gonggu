// 인포크 링크 제목은 "[콩콩맘X레벨릭스] 썼다 지웠다 워크북 4종 특별할인 08월 14일 ~ 08월 16일"
// 처럼 인플루언서명·프로모션 문구·기간이 상품명에 섞여 있다. 그대로 검색창에 넣으면
// 아무것도 안 나와서 사람이 매번 손으로 고쳐 쓰게 된다.
//
// inpock.py의 clean_market_query()와 같은 취지의 정리를 관리자 화면에서도 쓰기 위해 옮겨왔다.
// 완벽하게 발라내지는 못하므로 결과를 그대로 쓰라고 강요하지 않고, 원본과 함께 보여주고
// 복사만 편하게 해준다.

const PROMO_WORDS = [
  '구매하기', '바로가기', '구매링크', '신청하기', '주문하기', '보러가기', '주문링크',
  '회원가입', '카카오채널', '카톡채널', '중복할인', '특별기획전', '단독특가', '신제품출시',
  '공동구매', '한정수량', '선착순', '공구', '오픈', '특가', '모음전', '기획전',
  '특별할인', '골라담기', '최저가', '역대급', '초특가', '단독',
]

/** 검색창에 넣기 좋은 형태로 제목을 정리한다 */
export function cleanSearchQuery(title: string): string {
  let t = title || ''
  // 괄호류는 통째로 — 보통 인플루언서명이나 프로모션 조건이지 상품명이 아니다
  t = t.replace(/[([{【（][^)\]}】）]*[)\]}】）]/g, ' ')
  for (const w of PROMO_WORDS) t = t.split(w).join(' ')
  t = t.replace(/(최대)?할인\s*\d+\s*%/g, ' ')
  t = t.replace(/\d+\s*차\b/g, ' ')
  // 기간 표기 — "08월 14일 ~ 08월 16일", "8/15까지"
  t = t.replace(/\d{1,2}\s*월\s*\d{1,2}\s*일/g, ' ')
  t = t.replace(/\d{1,2}\s*\/\s*\d{1,2}\s*(까지)?/g, ' ')
  t = t.replace(/~+/g, ' ')
  // 이모지·특수문자
  t = t.replace(/[^\w\s가-힣]/g, ' ')
  return t.replace(/\s+/g, ' ').trim()
}

/**
 * 파트너스 검색에 넣을 문구 — 브랜드가 따로 확인돼 있으면 앞에 붙인다.
 * 브랜드명 없이 상품명만 넣으면 엉뚱한 상품이 잡히는 경우가 많다.
 */
export function partnerSearchQuery(post: { title: string; brand?: string | null }): string {
  const cleaned = cleanSearchQuery(post.title)
  const brand = (post.brand || '').trim()
  if (!brand) return cleaned
  // 이미 제목 안에 브랜드가 들어 있으면 중복해서 붙이지 않는다
  if (cleaned.toLowerCase().includes(brand.toLowerCase())) return cleaned
  return `${brand} ${cleaned}`.trim()
}
