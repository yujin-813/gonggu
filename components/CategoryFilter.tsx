import type { Category } from '@/lib/types'
import { CATEGORY_ICON, CATEGORY_LABEL, CATEGORY_ORDER } from '@/lib/categoryIcons'

interface CategoryFilterProps {
  current: Category | 'all' | 'evergreen'
  onSelect: (cat: Category | 'all' | 'evergreen') => void
}

export default function CategoryFilter({ current, onSelect }: CategoryFilterProps) {
  return (
    <div className="category-wrap">
      {CATEGORY_ORDER.map(id => {
        const Icon = CATEGORY_ICON[id]
        return (
          <button
            key={id}
            className={`cat-btn ${current === id ? 'active' : ''}`}
            onClick={() => onSelect(id)}
          >
            <Icon size={14} strokeWidth={2.25} />
            {CATEGORY_LABEL[id]}
          </button>
        )
      })}
    </div>
  )
}
