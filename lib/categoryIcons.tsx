import {
  LayoutGrid, Package, Sparkles, UtensilsCrossed,
  House, Baby, Pill, ShoppingBag,
  type LucideIcon, CalendarClock } from 'lucide-react'
import type { Category } from './types'

type CatKey = Category | 'all' | 'evergreen' | 'upcoming'

// 탭 노출 순서 그대로 — 전체 · 상시딜 · 유아동 · 생활 · 식품 · 건강 · 뷰티
export const CATEGORY_ORDER: CatKey[] = ['all', 'upcoming', 'evergreen', 'kids', 'life', 'food', 'health', 'beauty']

export const CATEGORY_ICON: Record<CatKey, LucideIcon> = {
  all: LayoutGrid,
  upcoming: CalendarClock,
  evergreen: Package,
  kids: Baby,
  life: House,
  food: UtensilsCrossed,
  health: Pill,
  beauty: Sparkles,
}

export const CATEGORY_LABEL: Record<CatKey, string> = {
  all: '전체',
  upcoming: '오픈예정',
  evergreen: '상시딜',
  kids: '유아동',
  life: '생활',
  food: '식품',
  health: '건강',
  beauty: '뷰티',
}

export function categoryIcon(cat?: string): LucideIcon {
  return (cat && (CATEGORY_ICON as Record<string, LucideIcon>)[cat]) || ShoppingBag
}
