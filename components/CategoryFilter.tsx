import Link from 'next/link'
import { CATEGORY_KEYS, type Category } from '@/lib/types'
import { CATEGORY_ICON, CATEGORY_LABEL, CATEGORY_ORDER } from '@/lib/categoryIcons'

interface CategoryFilterProps {
  current: Category | 'all' | 'evergreen' | 'upcoming'
  onSelect: (cat: Category | 'all' | 'evergreen' | 'upcoming') => void
}

export default function CategoryFilter({ current, onSelect }: CategoryFilterProps) {
  return (
    <div className="category-wrap">
      {CATEGORY_ORDER.map(id => {
        const Icon = CATEGORY_ICON[id]
        const label = CATEGORY_LABEL[id]
        const className = `cat-btn ${current === id ? 'active' : ''}`

        // 실제 카테고리는 전용 페이지(/category/kids 등)로 보낸다. 그 페이지에는 소개 문구와
        // 구조화 데이터가 들어 있어 검색에도 잡히고, 주소가 남아 공유·뒤로가기가 된다.
        // 제자리에서 목록만 갈아끼우면 그 셋이 다 사라진다.
        if (CATEGORY_KEYS.includes(id as Category)) {
          return (
            <Link key={id} href={`/category/${id}`} className={className} onClick={() => onSelect(id)}>
              <Icon size={14} strokeWidth={2.25} />
              {label}
            </Link>
          )
        }

        // 전체·오픈예정·상시딜은 대응하는 페이지가 없어 홈에서 거르는 방식을 유지한다
        return (
          <button key={id} className={className} onClick={() => onSelect(id)}>
            <Icon size={14} strokeWidth={2.25} />
            {label}
          </button>
        )
      })}
    </div>
  )
}
