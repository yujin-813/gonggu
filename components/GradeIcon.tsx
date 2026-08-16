import { Sparkles, ThumbsUp, Eye, TriangleAlert, Search, BadgeCheck, type LucideProps } from 'lucide-react'
import type { VerdictState } from '@/lib/dealGrade'

// 판정 아이콘은 여기서만 정한다 — 카드·상세·목록이 서로 다른 그림을 쓰면 같은 판정인지
// 알아보기 어렵다. (이모지는 기기마다 모양이 달라 쓰지 않는다)
//
// 판정 대기에 Eye(👀)를 쓰면 고민딜과 겹쳐서, "아직 찾는 중"이라는 뜻이 살아 있는
// Search를 썼다.
export const STATE_ICON: Record<VerdictState, React.ComponentType<LucideProps>> = {
  honey: Sparkles,
  good: ThumbsUp,
  hmm: Eye,
  meh: TriangleAlert,
  pending: Search,
  exclusive: BadgeCheck,
}

export default function GradeIcon({ state, size = 13 }: { state: VerdictState; size?: number }) {
  const Icon = STATE_ICON[state]
  return <Icon size={size} strokeWidth={2.5} />
}
