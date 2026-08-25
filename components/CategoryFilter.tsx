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

        // 실제 카테고리·오픈예정·상시딜은 전용 페이지(/category/kids, /upcoming, /evergreen)로
        // 보낸다. 그 페이지에는 소개 문구와 구조화 데이터가 들어 있어 검색에도 잡히고, 주소가
        // 남아 공유·뒤로가기가 된다. 제자리에서 목록만 갈아끼우면 그게 다 사라지고, 눌러도
        // 페이지 이동이 없어 "반응이 없다"고 느껴졌다.
        // 아이콘을 원 배지로 감싼다 — 데스크톱/좁은 화면에서는 이 원이 그냥 통과되고(inline
        // 아이콘), 모바일 그리드에서는 이 원이 아이콘 배경이 된다(쿠팡 홈 카테고리 모양)
        const content = (
          <>
            <span className="cat-icon-circle"><Icon size={20} strokeWidth={2} /></span>
            <span className="cat-label">{label}</span>
          </>
        )

        if (CATEGORY_KEYS.includes(id as Category)) {
          return (
            <Link key={id} href={`/category/${id}`} className={className} onClick={() => onSelect(id)}>
              {content}
            </Link>
          )
        }
        if (id === 'upcoming' || id === 'evergreen') {
          return (
            <Link key={id} href={`/${id}`} className={className} onClick={() => onSelect(id)}>
              {content}
            </Link>
          )
        }

        // "전체"만 대응하는 페이지가 없다 — 홈 자체가 전체 목록이므로 홈에서 거르는 방식을 유지한다
        return (
          <button key={id} className={className} onClick={() => onSelect(id)}>
            {content}
          </button>
        )
      })}
    </div>
  )
}
