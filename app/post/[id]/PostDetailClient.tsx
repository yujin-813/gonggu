'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { Post, PurchaseLink } from '@/lib/types'
import { ArrowLeft } from 'lucide-react'
import PostCard from '@/components/PostCard'
import Toast from '@/components/Toast'
import EndedDealNotice from '@/components/EndedDealNotice'
import BetterPriceNotice from '@/components/BetterPriceNotice'
import UpcomingNotice from '@/components/UpcomingNotice'
import ShareInvite from '@/components/ShareInvite'
import { track } from '@/lib/track'

interface Props {
  post: Post
  /** 마감이 지난 공구 — 페이지는 유지하되 화면을 종료 상태로 바꾼다 */
  ended?: boolean
  /** 아직 안 열린 공구 — 오픈일을 캘린더에 담아 준다 */
  upcoming?: boolean
  /** 진행 중인데 다른 곳이 더 싼 공구(아쉽딜) — 공구 버튼은 그대로 두고 대체 구매처를 함께 보여준다 */
  betterPrice?: boolean
  /** 추천 목록이 진짜 비슷한 것인지, 같은 카테고리를 채운 것인지 — 제목 문구가 달라진다 */
  relatedKind?: 'similar' | 'influencer' | 'category'
  categoryLabel?: string
  purchaseLinks?: PurchaseLink[]
  related?: Post[]
}

export default function PostDetailClient({ post, ended = false, upcoming = false, betterPrice = false, relatedKind = 'category', categoryLabel = '', purchaseLinks = [], related = [] }: Props) {
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set())
  const [toast, setToast] = useState({ message: '', visible: false })

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('gonggu_bookmarks') || '[]')
    setBookmarks(new Set(saved))
    track('view')
    // 종료된 공구에도 상세 조회가 계속 잡히는지 봐야 "아직 수요가 있는 상품"을 가려낼 수 있다
    track('click', { postId: post.id, clickType: 'detail' })
  }, [post.id])

  function showToast(message: string) {
    setToast({ message, visible: true })
  }

  function toggleBookmark(id: number) {
    setBookmarks(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id); showToast('찜을 해제했어요') }
      else { next.add(id); showToast('찜 목록에 추가했어요!'); track('bookmark', { postId: id }) }
      localStorage.setItem('gonggu_bookmarks', JSON.stringify([...next]))
      return next
    })
  }

  function recordRecentlyViewed(id: number) {
    const prev: number[] = JSON.parse(localStorage.getItem('gonggu_recent') || '[]')
    const next = [id, ...prev.filter(x => x !== id)].slice(0, 20)
    localStorage.setItem('gonggu_recent', JSON.stringify(next))
  }

  return (
    <>
      <header>
        <div className="header-inner">
          <Link href="/" className="back-btn"><ArrowLeft size={16} /></Link>
          <div className="logo">
            <img src="/logo-symbol.png" alt="" className="logo-symbol" width={20} height={20} />
            <span className="logo-text">꿀공구</span>
          </div>
        </div>
      </header>

      {/* 마감 공구는 "지금 어디서 사나"가 제일 급하다. 검색으로 들어온 사람이 공구 카드
          (제목·구성·판정)를 다 지나야 구매 버튼을 만나던 걸 위로 올렸다. */}
      {/* 살 곳이 확인된 마감 공구는 구매 영역만 위로 올리고 추천은 아래에 둔다.
          살 곳이 없으면 위쪽 박스가 "확인되지 않았어요" 한 줄뿐이라 허전해서, 추천까지 함께
          위로 올린다 — 그 사람에게 지금 줄 수 있는 게 그것뿐이다. */}
      {/* 아직 안 열린 공구는 "언제 열리나"가 유일하게 줄 수 있는 정보다 — 맨 위에 둔다 */}
      {upcoming && <UpcomingNotice post={post} />}

      {ended && (
        <EndedDealNotice post={post} purchaseLinks={purchaseLinks} related={related}
          relatedKind={relatedKind} categoryLabel={categoryLabel}
          section={purchaseLinks.length > 0 ? 'buy' : undefined} />
      )}

      <div className="feed" style={{ paddingBottom: 100, paddingTop: 12 }}>
        <PostCard
          post={post}
          isBookmarked={bookmarks.has(post.id)}
          onToggleBookmark={toggleBookmark}
          onJoin={id => { track('join', { postId: id, clickType: 'groupbuy' }); recordRecentlyViewed(id) }}
          onShare={(id, result) => {
            if (result === 'clipboard') showToast('링크가 복사되었어요')
            track('share', { postId: id })
          }}
          endedCompact={ended}
        />
      </div>

      {ended && purchaseLinks.length > 0 && (
        <EndedDealNotice post={post} purchaseLinks={purchaseLinks} related={related}
          relatedKind={relatedKind} categoryLabel={categoryLabel} section="related" />
      )}
      {!ended && betterPrice && <BetterPriceNotice post={post} purchaseLinks={purchaseLinks} />}

      {/* 공유는 재방문 없이도 효용이 있고 우리에겐 신규 유입이 된다. 31일간 0회였던 건
          버튼이 이미지 위 라벨 없는 아이콘 하나였기 때문으로 보인다 */}
      {!upcoming && <ShareInvite post={post} />}

      <div style={{ padding: '0 16px 24px', textAlign: 'center' }}>
        <Link href="/" style={{ fontSize: 13, color: '#6366f1', fontWeight: 600, textDecoration: 'none' }}>
          다른 공구도 보러 가기 →
        </Link>
      </div>

      <Toast
        message={toast.message}
        visible={toast.visible}
        onHide={() => setToast(t => ({ ...t, visible: false }))}
      />
    </>
  )
}
