import {
  LayoutGrid, Package, Shirt, Sparkles, UtensilsCrossed,
  House, Baby, Pill, PawPrint, Smartphone, ShoppingBag,
  type LucideIcon,
} from 'lucide-react'
import type { Category } from './types'

type CatKey = Category | 'all' | 'evergreen'

export const CATEGORY_ICON: Record<CatKey, LucideIcon> = {
  all: LayoutGrid,
  evergreen: Package,
  fashion: Shirt,
  beauty: Sparkles,
  food: UtensilsCrossed,
  life: House,
  kids: Baby,
  health: Pill,
  pet: PawPrint,
  digital: Smartphone,
}

export const CATEGORY_LABEL: Record<CatKey, string> = {
  all: '전체',
  evergreen: '상시딜',
  fashion: '패션',
  beauty: '뷰티',
  food: '식품',
  life: '생활용품',
  kids: '유아동',
  health: '건강',
  pet: '반려동물',
  digital: '디지털',
}

export function categoryIcon(cat?: string): LucideIcon {
  return (cat && (CATEGORY_ICON as Record<string, LucideIcon>)[cat]) || ShoppingBag
}
