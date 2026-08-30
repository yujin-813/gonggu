import type { Post } from './types'
import { getDealVerdict } from './dealGrade'
import { getPeriodState, fmtDate } from './period'

// 상세페이지 롱테일 Q&A — 실제 데이터가 있을 때만 만든다. 검색어를 나열하는 대신 진짜
// 질문·답을 만들어서, "OO 공구 가격 괜찮나요" 같은 질문형 검색과 자연스럽게 맞물리게 한다.
// 서버 페이지(FAQPage 구조화 데이터)와 화면(본문 Q&A)이 같은 함수를 써야 둘이 어긋나지
// 않는다.

export interface QA {
  q: string
  a: string
}

/** "가격 괜찮나요?" — 실제 등급이 매겨진 경우만 만든다. 판정 대기·단독공구·여러 상품은
 * 확신 있는 답이 없으므로 생성하지 않는다(원칙 2) — 등급 판정은 dealGrade.ts만 계산한다. */
export function priceQA(post: Post): QA | null {
  const v = getDealVerdict(post)
  if (v.display.key === 'pending' || v.display.key === 'exclusive' || v.display.key === 'multi') return null
  return { q: '이 공구, 가격은 괜찮은가요?', a: v.display.line }
}

/** "언제까지인가요?" — 마감일을 실제로 아는 경우만 만든다. 마감일 미확인·오픈예정은
 * 확신이 없어 생성하지 않는다. */
export function periodQA(post: Post): QA | null {
  const s = getPeriodState(post)
  switch (s.kind) {
    case 'range':
    case 'deadline_only':
      return { q: '이 공구는 언제까지인가요?', a: `${fmtDate(s.deadline)}까지예요.` }
    case 'evergreen':
      return { q: '이 공구는 언제까지인가요?', a: '마감일 없이 상시로 진행되는 공구예요.' }
    case 'sold_out_only':
      return { q: '이 공구는 언제까지인가요?', a: '마감일은 따로 없고, 소진되면 종료돼요.' }
    default:
      return null
  }
}
