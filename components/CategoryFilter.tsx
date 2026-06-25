import type { Category } from '@/lib/types'

const CATEGORIES = [
  { id: 'all' as const, label: '전체' },
  { id: 'fashion' as const, label: '👗 패션' },
  { id: 'beauty' as const, label: '💄 뷰티' },
  { id: 'food' as const, label: '🍱 식품' },
  { id: 'life' as const, label: '🏠 생활용품' },
  { id: 'kids' as const, label: '🧸 유아동' },
  { id: 'health' as const, label: '💊 건강' },
  { id: 'pet' as const, label: '🐾 반려동물' },
  { id: 'digital' as const, label: '📱 디지털' },
]

interface CategoryFilterProps {
  current: Category | 'all'
  onSelect: (cat: Category | 'all') => void
}

export default function CategoryFilter({ current, onSelect }: CategoryFilterProps) {
  return (
    <div className="category-wrap">
      {CATEGORIES.map(cat => (
        <button
          key={cat.id}
          className={`cat-btn ${current === cat.id ? 'active' : ''}`}
          onClick={() => onSelect(cat.id)}
        >
          {cat.label}
        </button>
      ))}
    </div>
  )
}
