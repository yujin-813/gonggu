import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { CATEGORY_KEYS, type Category } from '@/lib/types'
import { CATEGORY_ICON, CATEGORY_LABEL, CATEGORY_ORDER } from '@/lib/categoryIcons'

interface CategoryFilterProps {
  current: Category | 'all' | 'evergreen' | 'upcoming'
  onSelect: (cat: Category | 'all' | 'evergreen' | 'upcoming') => void
  /** 'pills'(기본) — 검색창 아래 늘 보이는 가로 스크롤 알약 버튼줄.
   * 'grid' — 햄버거(카테고리) 버튼을 눌렀을 때 뜨는 드롭다운 전용, 2열 카드 그리드
   * (무신사 앱 메뉴 참고, 사장님 요청). 같은 항목·같은 이동 로직을 다르게만 그린다. */
  variant?: 'pills' | 'grid'
}

export default function CategoryFilter({ current, onSelect, variant = 'pills' }: CategoryFilterProps) {
  const wrapClass = variant === 'grid' ? 'category-grid-panel' : 'category-wrap'

  return (
    <div className={wrapClass}>
      {CATEGORY_ORDER.map(id => {
        const Icon = CATEGORY_ICON[id]
        const label = CATEGORY_LABEL[id]
        const active = current === id

        // 실제 카테고리·오픈예정·상시딜은 전용 페이지(/category/kids, /upcoming, /evergreen)로
        // 보낸다. 그 페이지에는 소개 문구와 구조화 데이터가 들어 있어 검색에도 잡히고, 주소가
        // 남아 공유·뒤로가기가 된다. 제자리에서 목록만 갈아끼우면 그게 다 사라지고, 눌러도
        // 페이지 이동이 없어 "반응이 없다"고 느껴졌다.
        const content = variant === 'grid' ? (
          <span className="header-menu-card-title" style={active ? { color: 'var(--brand, #F0A500)' } : undefined}>
            <Icon size={16} strokeWidth={2} /> {label}<ChevronRight size={15} />
          </span>
        ) : (
          <>
            {/* 아이콘을 원 배지로 감싼다 — 데스크톱/좁은 화면에서는 이 원이 그냥 통과되고
                (inline 아이콘), 모바일 그리드에서는 이 원이 아이콘 배경이 된다(쿠팡 홈 카테고리 모양) */}
            <span className="cat-icon-circle"><Icon size={20} strokeWidth={2} /></span>
            <span className="cat-label">{label}</span>
          </>
        )
        const className = variant === 'grid' ? 'header-menu-card' : `cat-btn ${active ? 'active' : ''}`

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
