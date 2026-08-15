import { Sparkles, ThumbsUp, Eye, TriangleAlert, type LucideProps } from 'lucide-react'
import type { DealGradeKey } from '@/lib/dealGrade'

// 등급 아이콘은 여기서만 정한다 — 카드·상세·목록이 서로 다른 그림을 쓰면 같은 등급인지
// 알아보기 어렵다. (이모지는 기기마다 모양이 달라 쓰지 않는다)
export const GRADE_ICON: Record<DealGradeKey, React.ComponentType<LucideProps>> = {
  honey: Sparkles,
  good: ThumbsUp,
  hmm: Eye,
  meh: TriangleAlert,
}

export default function GradeIcon({ grade, size = 13 }: { grade: DealGradeKey; size?: number }) {
  const Icon = GRADE_ICON[grade]
  return <Icon size={size} strokeWidth={2.5} />
}
