'use client'

import { useEffect, useState, useRef } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { formatWon } from '@/lib/utils'
import { track } from '@/lib/firebase'
import { ampTrack } from '@/lib/amplitude'

// ── 지난 주문 메뉴 ───────────────────────────────────────────────────────────
//
// 카테고리 탭 바로 아래, 메뉴판 맨 위에 붙는 가로 스크롤 줄.
//
// 왜 만들었나: 침산점 실측으로 **주문수량의 92%가 메뉴판 7번째 이후**에 있었다.
// 1위 메뉴가 19번째, 2위가 59번째, 3위가 89번째다. 한 이용자는 89번째 메뉴를
// 28번 시켰다 — 매번 88개를 지나쳐 내려온 셈이다.
//
// 앞서 검색을 먼저 넣었는데 그건 "찾을 의지가 있는 사람"만 돕는다. 실제 불편은
// "늘 먹던 걸 또 고르는데 매번 스크롤한다"라서, 지난 주문을 위로 올리는 게 직접 닿는다.
//
// 데이터는 recent_menus_for_orderer RPC 로 받는다(anon 은 orders 를 못 읽는다).
// 숨김·품절 메뉴는 서버에서 빠진다 — 못 시키는 걸 맨 위에 올리면 안 된다.

export interface RecentMenu {
  menu_id:         string
  name:            string
  base_price:      number
  image_url:       string | null
  category_id:     string
  times:           number
  last_ordered_at: string
}

/** '어제' · '3일 전' · '2주 전' — 날짜보다 "얼마 전"이 고르는 데 도움이 된다 */
function sinceLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return '오늘'
  if (days === 1) return '어제'
  if (days < 7)   return `${days}일 전`
  if (days < 30)  return `${Math.floor(days / 7)}주 전`
  return `${Math.floor(days / 30)}개월 전`
}

/**
 * 데모(공개 데모 링크 · sunpos QR오더 미리보기)에서 쓸 가짜 '지난 주문'.
 *
 * 데모 세션은 거래처코드가 0000…0000 이라 주문 이력이 0건이고, 그러면 아래
 * `items.length === 0` 에 걸려 **영역이 통째로 안 그려진다.** 제품에서 가장 눈에
 * 띄는 기능이 하필 데모에서만 안 보였다 — 점주에게 보여주는 화면인데.
 *
 * 그래서 그 매장의 **진짜 메뉴**로 목록을 만든다(미리보기를 보는 점주가 자기 가게
 * 메뉴를 봐야 와닿는다). 사진 있는 것 우선 — 사진이 없으면 '사진 준비 중'이 떠서
 * 데모가 초라해진다.
 *
 * 숫자는 **고정값**이다. 랜덤이면 볼 때마다 달라져서 미리보기로 못 쓴다.
 */
const DEMO_TIMES = [4, 3, 2, 2, 1]
const DEMO_DAYS  = [1, 3, 8, 16, 24]   // '어제 · 3일 전 · 1주 전 · 2주 전 · 3주 전'

function demoRecentMenus(
  pool: { code: string; name: string; price: number; imageUrl?: string; cat: string; recommended?: boolean; popular?: boolean }[],
): RecentMenu[] {
  const ranked = [...pool]
    .filter(m => !!m.imageUrl)
    .sort((a, b) => Number(!!b.recommended || !!b.popular) - Number(!!a.recommended || !!a.popular))
  const picked = (ranked.length >= 3 ? ranked : pool).slice(0, DEMO_TIMES.length)
  return picked.map((m, i) => ({
    menu_id:         m.code,
    name:            m.name,
    base_price:      m.price,
    image_url:       m.imageUrl ?? null,
    category_id:     m.cat,
    times:           DEMO_TIMES[i],
    last_ordered_at: new Date(Date.now() - DEMO_DAYS[i] * 86_400_000).toISOString(),
  }))
}

export default function RecentMenus({
  accountCode, ordererName, onPick, onShown, demoPool,
}: {
  accountCode: string
  /** 카카오 로그인 상태면 비워도 된다 — RPC 가 auth.uid() 로 찾는다 */
  ordererName?: string
  onPick:  (menuId: string, meta: { rank: number; times: number; isTop: boolean }) => void
  /** 영역이 실제로 그려졌을 때 1회 — 노출 대비 클릭률을 재기 위해 */
  onShown?: (count: number) => void
  /** 데모 세션일 때만 — 이 매장의 실제 메뉴. 넘어오면 RPC 대신 가짜 목록을 만든다 */
  demoPool?: { code: string; name: string; price: number; imageUrl?: string; cat: string; recommended?: boolean; popular?: boolean }[]
}) {
  const scrolledRef = useRef(false)
  const [items,   setItems]   = useState<RecentMenu[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (demoPool) {
      // 데모는 서버에 물어볼 게 없다. anon 으로 orders 를 못 읽기도 하고,
      // 애초에 이 거래처엔 주문이 없다.
      setItems(demoPool.length > 0 ? demoRecentMenus(demoPool) : [])
      setLoading(false)
      return
    }
    if (!accountCode) { setLoading(false); return }
    // 주문자가 바뀌면 이전 사람 목록을 **응답을 기다리지 않고 즉시** 치운다.
    // 남겨두면 두 가지가 터진다:
    //   1) 주문자를 A→B 로 바꾼 직후, B 화면에 A 의 지난주문이 그대로 떠 있다.
    //      같은 거래처 안이어도 "누가 뭘 먹었는지"라서 남의 것이다.
    //   2) 그 사이 카드를 누르면 personProps(ordererName) 가 빈 객체라
    //      orderer_key 없이 이벤트가 찍혀 사람별 분해에서 빠진다.
    //      실제로 '직접 입력'(setOrderer('')) 직후 눌린 클릭 8건이 그렇게 유실됐다.
    setItems([])
    setLoading(true)
    let cancelled = false
    getSupabaseClient()
      .rpc('recent_menus_for_orderer', {
        p_account_code: accountCode,
        p_orderer_name: ordererName || null,
        p_limit: 6,
      })
      .then(({ data, error }: { data: unknown; error: unknown }) => {
        if (cancelled) return
        if (error) { console.error('[RecentMenus]', error); setItems([]) }
        else setItems((data ?? []) as RecentMenu[])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [accountCode, ordererName, demoPool])

  useEffect(() => {
    if (!loading && items.length > 0) onShown?.(items.length)
    // onShown 은 노출 1회만 — items 가 바뀔 때만 다시 쏜다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, items.length])

  // 처음 시키는 사람에겐 아무것도 안 보여준다. 빈 줄이 자리만 먹는다
  if (loading || items.length === 0) return null

  // '가장 많이 주문함' 뱃지를 달 카드 하나.
  // 목록은 최근 주문순이라 최다 주문 메뉴가 몇 번째에 올지는 그때그때 다르다.
  // 2번 이상일 때만 — 1번 시킨 걸 "가장 많이"라고 부르면 말이 안 된다.
  // 동점이면 앞선 것(= 더 최근에 먹은 것) 하나만 가져간다.
  const topIdx = items.reduce(
    (best, m, i) => (m.times >= 2 && m.times > (items[best]?.times ?? 0) ? i : best),
    -1,
  )

  return (
    <div className="pt-4 pb-1">
      <div className="px-5 mb-2.5">
        <span className="text-[15px] font-bold text-ink">지난번 주문한</span>
      </div>

      {/* 가로 스크롤을 했는지 — 첫 화면에 보이는 2~3장으로 끝나는지, 더 밀어서 보는지.
          onScroll 은 한 번만 쏜다(scrolledRef). 손가락 한 번에 수십 번 불리는 이벤트라
          그대로 보내면 로그가 스크롤 기록으로 뒤덮인다. */}
      <div
        className="flex gap-3 overflow-x-auto px-5 pb-2 scrollbar-hide"
        style={{ scrollbarWidth: 'none' }}
        onScroll={e => {
          if (scrolledRef.current) return
          if (e.currentTarget.scrollLeft < 8) return
          scrolledRef.current = true
          if (demoPool) return   // 데모 트래픽은 경험1 지표에서 뺀다
          const p = { account_code: accountCode, count: items.length }
          track('recent_menus_scroll', p)
          ampTrack('recent_menus_scroll', p)
        }}
      >
        {items.map((m, i) => (
          <button
            key={m.menu_id}
            onClick={() => onPick(m.menu_id, { rank: i + 1, times: m.times, isTop: i === topIdx })}
            className="flex-shrink-0 w-[124px] flex flex-col items-start text-left active:scale-[0.97] transition-transform"
          >
            <div className="relative w-[124px] h-[124px] rounded-2xl overflow-hidden bg-gray-bg mb-2">
              {m.image_url
                ? <img src={m.image_url} alt={m.name} loading="lazy" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-[11px] text-gray-text">사진 준비 중</div>}
              {/* 초록은 '추천' 배지와 같은 밝은 #16a84c (menu-badges.tsx).
                  CTA 초록(--green #017333)은 "누르는 것"에 쓰는 색이라, 누를 수 없는
                  라벨에 쓰면 버튼처럼 읽힌다. */}
              {/* pt/pb 가 다른 건 오타가 아니다. 이 글꼴(Apple SD Gothic Neo)은 한글이
                  쓰지 않는 디센더 자리를 잡아둬서, py 를 똑같이 주면 CSS 상으로는 가운데인데
                  보이는 글자는 0.6px 위로 뜬다. 그만큼 아래로 내린 값이고, 박스 높이(19px)는
                  그대로다. */}
              {i === topIdx && (
                <span className="absolute left-1.5 top-1.5 px-1.5 pt-[2.5px] pb-[1.5px] rounded-lg bg-[#16a84c] text-white text-[10px] font-bold whitespace-nowrap">
                  가장 많이 주문함
                </span>
              )}
            </div>
            <div className="text-[13px] font-semibold text-ink leading-tight line-clamp-2 mb-0.5">
              {m.name}
            </div>
            <div className="text-[13px] font-bold text-ink">{formatWon(m.base_price)}</div>
            <div className="text-[11px] text-gray-text mt-0.5">{sinceLabel(m.last_ordered_at)}</div>
          </button>
        ))}
      </div>

      {/* 이 영역과 아래 카테고리를 가르는 바.
          카테고리 쪽 바는 '첫 카테고리 위'에는 긋지 않기로 해서(탭 바로 밑에 회색 띠가
          붙어 보였다), 그 자리를 여기가 받는다. 지난 주문이 없는 손님은 이 영역 자체가
          안 그려지니 바도 같이 사라진다 — 그게 맞다. */}
      <div className="h-2 bg-gray-50 mt-3" />
    </div>
  )
}
