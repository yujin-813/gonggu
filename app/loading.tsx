import { Loader2 } from 'lucide-react'

// 카테고리를 눌러 다른 페이지로 넘어갈 때 서버 렌더가 끝날 때까지 흰 화면만 보이던 걸
// 막는다 — 다른 곳에서 쓰는 것과 같은 스피너를 그대로 재사용한다.
export default function Loading() {
  return (
    <div className="empty">
      <div className="empty-icon empty-icon-spin"><Loader2 size={36} /></div>
    </div>
  )
}
