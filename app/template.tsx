'use client'

// 카테고리를 눌러 다른 페이지로 넘어갈 때 흰 화면이 잠깐 번쩍이며 "뚝뚝 끊기는" 느낌이 났다.
// layout.tsx는 페이지가 바뀌어도 다시 그려지지 않아 여기서 손쓸 수 없고, template.tsx는
// 이동할 때마다 새로 마운트되므로 여기에 살짝 페이드인을 걸어 전환을 부드럽게 만든다.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-transition">{children}</div>
}
