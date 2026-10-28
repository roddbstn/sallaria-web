'use client'

import { useState, useEffect, useRef, useCallback, Suspense, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSessionStore } from '@/lib/store/session'
import RecentMenus from '@/components/menu/recent-menus'
import OrdererSheet from '@/components/order/orderer-sheet'
import { useCartStore } from '@/lib/store/cart'
import { getSupabaseClient } from '@/lib/supabase/client'
import { formatWon, isLowBalance, isNegativeBalance, entrySourceBreakdown } from '@/lib/utils'
import MenuCard from '@/components/menu/menu-card'
import { track } from '@/lib/firebase'
import { ampTrack } from '@/lib/amplitude'
import { personProps } from '@/lib/person-key'
import MenuDetailClient from './[code]/menu-detail-client'
import type { Category, Menu } from '@/lib/types'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { mapDbMenu } from '@/lib/mappers'
import NoticeModal from '@/components/notice/notice-modal'
import { DELIVERY_FEE_NOTICE_ID, isNoticeDismissed, dismissNotice } from '@/lib/notice'
import LoadingTimer from '@/components/ui/loading-timer'

export default function MenuPage() {
  return (
    <Suspense>
      <MenuPageInner />
    </Suspense>
  )
}

function MenuPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedItemCode = searchParams.get('item')
  const account = useSessionStore(s => s.account)
  const orderer = useSessionStore(s => s.orderer)
  const setOrderer = useSessionStore(s => s.setOrderer)
  const setPhone   = useSessionStore(s => s.setPhone)
  const [ordererSheet, setOrdererSheet] = useState(false)
  const cartItems = useCartStore(s => s.items)

  const [categories, setCategories] = useState<Category[]>([])
  const [menus, setMenus] = useState<Menu[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [activeCategory, setActiveCategory] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [catBarShadow,  setCatBarShadow]  = useState(false)
  const [searchBarShadow, setSearchBarShadow] = useState(false)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const tabButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const tabsRef = useRef<HTMLDivElement>(null)
  const isScrollingToRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)  // 내부 스크롤 컨테이너
  const categoryClickCountRef = useRef(0)  // 메뉴 선택 전 카테고리 탭 클릭 횟수

  // ── 검색 상태 ──────────────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchActiveCategory, setSearchActiveCategory] = useState('')
  const [searchShowDropdown, setSearchShowDropdown] = useState(false)
  const searchInputRef    = useRef<HTMLInputElement>(null)
  const searchScrollRef   = useRef<HTMLDivElement>(null)
  const searchSectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const searchTabRefs     = useRef<Record<string, HTMLButtonElement | null>>({})
  const searchTabsRef     = useRef<HTMLDivElement>(null)
  const searchIsScrolling = useRef(false)

  // 검색 결과: 품절 제외 + 메뉴명 필터 (빈 쿼리면 전체)
  const searchResults = useMemo(() => {
    const q = searchQuery.trim()
    return menus.filter(m => !m.isSoldOut && (q === '' || m.name.includes(q)))
  }, [menus, searchQuery])

  // 검색 결과에 메뉴가 있는 카테고리만
  const searchCategories = useMemo(() => {
    const ids = new Set(searchResults.map(m => m.cat))
    return categories.filter(c => ids.has(c.id))
  }, [categories, searchResults])

  // hydration 완료 여부 추적
  const [hydrated, setHydrated] = useState(() => useSessionStore.persist.hasHydrated())
  useEffect(() => {
    if (useSessionStore.persist.hasHydrated()) { setHydrated(true); return }
    const unsub = useSessionStore.persist.onFinishHydration(() => setHydrated(true))
    return () => unsub()
  }, [])

  // 공지 팝업 — PIN 세션과 무관하게, 매장별로 "다시 보지 않기" 여부 확인.
  // 데모 세션(sunpos QR오더 미리보기 iframe)에서는 실제 손님이 아니므로 공지를 띄우지 않는다.
  const [showNotice, setShowNotice] = useState(false)
  useEffect(() => {
    if (!account?.storeId || account.isDemo) return
    if (!isNoticeDismissed(DELIVERY_FEE_NOTICE_ID, account.storeId)) setShowNotice(true)
  }, [account?.storeId, account?.isDemo])

  // 잔액 실시간 구독 (Supabase Realtime)
  const setAccount = useSessionStore(s => s.setAccount)
  useEffect(() => {
    if (!account) return
    const supabase = getSupabaseClient()

    const currentAccount = account
    // accounts 테이블 직접 조회 금지 — RPC로만 (anon이 전체 거래처를 긁어갈 수 없도록).
    // 2026-10-27: get_account_public → account_balance 로 바꿨다.
    // 전자는 PIN 을 안 봐서, account_code(= QR URL 에 그대로 있는 값)만 알면
    // 아무나 남의 잔액을 볼 수 있었다. 후자는 PIN 을 대조한다.
    supabase
      .rpc('account_balance', { p_account_code: currentAccount.code, p_pin: currentAccount.pin ?? '' })
      .then(({ data }: { data: number | null }) => {
        if (typeof data === 'number' && data !== currentAccount.balance) {
          setAccount({ ...currentAccount, balance: data })
        }
      })

    const channel: RealtimeChannel = supabase
      .channel(`balance-${account.code}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'accounts',
          filter: `account_code=eq.${account.code}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const newBalance = payload.new['current_balance']
          if (typeof newBalance === 'number') {
            setAccount({ ...currentAccount, balance: newBalance })
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.code])

  // DB에서 카테고리 + 메뉴 로딩
  useEffect(() => {
    if (!account) return
    async function load() {
      setLoading(true)
      setFetchError(false)
      try {
        const supabase = getSupabaseClient()

        // 카테고리 + 메뉴를 한 번에 받는다(qr_menu_board). 전엔 categories 를 받아야
        // 그 id 로 menus 를 칠 수 있어 왕복이 반드시 두 번이었다.
        // RPC 는 SECURITY INVOKER 라 RLS 가 그대로 적용되고, 반환 모양도 기존
        // PostgREST 중첩 결과와 같아서 mapDbMenu 를 고칠 필요가 없다.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: board, error: boardError } = await (supabase as any)
          .rpc('qr_menu_board', { p_store_id: account?.storeId ?? null })
        if (boardError) throw boardError

        const catData = (board?.categories ?? []) as { id: string; name: string }[]
        if (catData.length === 0) return

        const cats: Category[] = catData.map(c => ({ id: c.id, name: c.name }))
        setCategories(cats)
        setActiveCategory(cats[0].id)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setMenus(((board?.menus ?? []) as any[]).map(mapDbMenu))
      } catch {
        setFetchError(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [account, retryCount])

  // categories를 ref로 유지 — spy 클로저에서 항상 최신 값을 읽기 위해
  const categoriesRef = useRef<Category[]>([])
  useEffect(() => { categoriesRef.current = categories }, [categories])

  // 스크롤 감지 + 스파이 — loading 끝난 뒤 scrollRef가 DOM에 붙으면 한 번 실행
  const firedDepths = useRef(new Set<number>())
  useEffect(() => {
    if (loading) return
    const container = scrollRef.current
    if (!container) return
    const TABS_H = 56
    const el = container  // TypeScript closure narrowing용

    function onScroll() {
      const top = el.scrollTop
      setShowScrollTop(top > 300)
      setCatBarShadow(top > 10)
      // 스크롤 깊이 트래킹 (25/50/75/90%)
      const pct = Math.floor((top / (el.scrollHeight - el.clientHeight)) * 100)
      for (const milestone of [25, 50, 75, 90]) {
        if (pct >= milestone && !firedDepths.current.has(milestone)) {
          firedDepths.current.add(milestone)
          track('scroll_depth', { depth: milestone, page: 'menu' })
          ampTrack('scroll_depth', { depth: milestone, page: 'menu' })
        }
      }
      // 카테고리 스파이
      if (isScrollingToRef.current) return
      const cats = categoriesRef.current
      if (cats.length === 0) return
      const baseTop = el.getBoundingClientRect().top + TABS_H
      let current = cats[0].id
      for (const cat of cats) {
        const el = sectionRefs.current[cat.id]
        if (!el) continue
        if (el.getBoundingClientRect().top <= baseTop) current = cat.id
      }
      setActiveCategory(current)
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [loading])

  // 활성 탭 자동 수평 스크롤 — 탭이 탭바 밖으로 나가면 따라옴
  useEffect(() => {
    const btn = tabButtonRefs.current[activeCategory]
    const bar = tabsRef.current
    if (!btn || !bar) return
    const btnLeft  = btn.offsetLeft
    const btnRight = btnLeft + btn.offsetWidth
    const barLeft  = bar.scrollLeft
    const barRight = barLeft + bar.offsetWidth
    if (btnLeft < barLeft + 16) {
      bar.scrollTo({ left: btnLeft - 16, behavior: 'smooth' })
    } else if (btnRight > barRight - 16) {
      bar.scrollTo({ left: btnRight - bar.offsetWidth + 16, behavior: 'smooth' })
    }
  }, [activeCategory])

  // 검색 모달 열릴 때 input 포커스
  useEffect(() => {
    if (!searchOpen) return
    const t = setTimeout(() => searchInputRef.current?.focus(), 150)
    return () => clearTimeout(t)
  }, [searchOpen])

  // 검색 결과 바뀔 때 첫 번째 카테고리로 active 초기화
  useEffect(() => {
    if (searchOpen && searchCategories.length > 0) {
      setSearchActiveCategory(searchCategories[0].id)
    }
  }, [searchOpen, searchCategories])

  // 검색 모달 내 스크롤 스파이
  useEffect(() => {
    if (!searchOpen) return
    const container = searchScrollRef.current
    if (!container) return
    function spy() {
      if (searchIsScrolling.current) return
      if (searchCategories.length === 0) return
      const tabsBottom = searchTabsRef.current?.getBoundingClientRect().bottom ?? 56
      let current = searchCategories[0].id
      for (const cat of searchCategories) {
        const el = searchSectionRefs.current[cat.id]
        if (!el) continue
        if (el.getBoundingClientRect().top <= tabsBottom) current = cat.id
      }
      setSearchActiveCategory(current)
      setSearchBarShadow((container?.scrollTop ?? 0) > 10)
    }
    setSearchBarShadow(false)
    container.addEventListener('scroll', spy, { passive: true })
    return () => { container.removeEventListener('scroll', spy); setSearchBarShadow(false) }
  }, [searchOpen, searchCategories])

  // 검색 모달 활성 탭 자동 수평 스크롤
  useEffect(() => {
    if (!searchOpen) return
    const btn = searchTabRefs.current[searchActiveCategory]
    const bar = searchTabsRef.current
    if (!btn || !bar) return
    const btnLeft  = btn.offsetLeft
    const btnRight = btnLeft + btn.offsetWidth
    const barLeft  = bar.scrollLeft
    const barRight = barLeft + bar.offsetWidth
    if (btnLeft < barLeft + 16) {
      bar.scrollTo({ left: btnLeft - 16, behavior: 'smooth' })
    } else if (btnRight > barRight - 16) {
      bar.scrollTo({ left: btnRight - bar.offsetWidth + 16, behavior: 'smooth' })
    }
  }, [searchActiveCategory, searchOpen])

  const scrollToSearchCategory = useCallback((catId: string) => {
    const el = searchSectionRefs.current[catId]
    const container = searchScrollRef.current
    if (!el || !container) return
    searchIsScrolling.current = true
    setSearchActiveCategory(catId)
    const tabsBottom = searchTabsRef.current?.getBoundingClientRect().bottom ?? 56
    const elTop = el.getBoundingClientRect().top
    container.scrollTo({ top: container.scrollTop + (elTop - tabsBottom), behavior: 'smooth' })
    setTimeout(() => { searchIsScrolling.current = false }, 800)
  }, [])

  // sunpos(점주용 데스크톱 앱)가 이 페이지를 QR오더 미리보기 iframe으로 띄웠을 때만 부모 창이
  // 존재함 — 손님이 QR코드를 찍거나 링크로 직접 열면 최상위 탭이라 window.parent === window라서
  // 아무 효과도 없음. targetOrigin을 '*'로 둔 건 sunpos 쪽 origin을 미리 알 수 없어서이고,
  // 보내는 내용이 카테고리 id 하나뿐이라 민감정보 유출 우려는 없음(수신측에서 발신 origin 검증함).
  const notifySunposCategoryChange = useCallback((catId: string) => {
    if (typeof window === 'undefined' || window.parent === window) return
    window.parent.postMessage({ type: 'SUNPOS_CATEGORY_CHANGED', categoryId: catId }, '*')
  }, [])

  const scrollToCategory = useCallback((catId: string, source: 'tab' | 'dropdown' = 'tab') => {
    const el = sectionRefs.current[catId]
    const container = scrollRef.current
    if (!el || !container) return
    const catName = categoriesRef.current.find(c => c.id === catId)?.name ?? catId
    track(source === 'dropdown' ? 'category_dropdown_select' : 'category_tab_click', { category_name: catName })
    ampTrack(source === 'dropdown' ? 'category_dropdown_select' : 'category_tab_click', { category_name: catName })
    categoryClickCountRef.current += 1
    isScrollingToRef.current = true
    setActiveCategory(catId)
    setShowDropdown(false)
    notifySunposCategoryChange(catId)

    // 탭바 하단 기준으로 스크롤 위치 계산 — 구분선 top이 탭바 bottom에 정확히 닿도록
    const tabsBottom = tabsRef.current?.getBoundingClientRect().bottom ?? 60
    const elTop = el.getBoundingClientRect().top
    const scrollTop = container.scrollTop + (elTop - tabsBottom)
    container.scrollTo({ top: scrollTop, behavior: 'smooth' })
    setTimeout(() => { isScrollingToRef.current = false }, 800)
  }, [notifySunposCategoryChange])

  // sunpos 부모 창에서 왼쪽 카테고리를 클릭하면 이 iframe도 그 카테고리로 스크롤 — 반대 방향 동기화.
  // 일반 탭/링크로 열린 경우엔 메시지를 보낼 부모가 없으므로 이 리스너가 등록돼 있어도 아무 일도
  // 일어나지 않는다(이 페이지가 iframe 안에 있을 때만 의미 있는 메시지가 도착함).
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type !== 'SUNPOS_SELECT_CATEGORY') return
      const catId = e.data.categoryId as string | null
      if (!catId) return
      const el = sectionRefs.current[catId]
      const container = scrollRef.current
      if (!el || !container) return
      isScrollingToRef.current = true
      setActiveCategory(catId)
      const tabsBottom = tabsRef.current?.getBoundingClientRect().bottom ?? 60
      const elTop = el.getBoundingClientRect().top
      container.scrollTo({ top: container.scrollTop + (elTop - tabsBottom), behavior: 'smooth' })
      setTimeout(() => { isScrollingToRef.current = false }, 800)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const menusByCat = useCallback((catId: string) => {
    if (catId === '__popular__') return menus.filter(m => m.popular)
    return menus.filter(m => m.cat === catId)
  }, [menus])

  const qty = cartItems.reduce((s, i) => s + i.qty, 0)
  const subtotal = cartItems.reduce((s, i) => s + i.subtotal, 0)

  if (!hydrated) return null
  if (!account) {
    return (
      <div className="flex flex-col min-h-screen bg-surface">
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <p className="text-[16px] font-semibold text-ink mb-2">세션이 만료되었습니다</p>
          <p className="text-[13px] text-gray-text">QR 코드를 다시 스캔해 주세요.</p>
        </div>
        <div className="px-5 pb-10 pt-4">
          <a href="/" className="block w-full py-4 rounded-2xl bg-ink text-white text-[15px] font-bold text-center">
            처음으로
          </a>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-surface">
        <LoadingTimer size={44} />
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-8 text-center bg-surface gap-3">
        <p className="text-[16px] font-semibold text-ink">메뉴를 불러오지 못했습니다</p>
        <p className="text-[13px] text-gray-text">네트워크 상태를 확인하고 다시 시도해주세요.</p>
        <button
          onClick={() => setRetryCount(c => c + 1)}
          className="mt-2 px-6 py-2.5 rounded-full bg-green text-white text-[14px] font-semibold"
        >
          다시 시도
        </button>
      </div>
    )
  }

  return (
    // fixed + centered: 430px 안에서 뷰포트 전체 높이를 점유 → sticky/overflow 동작 유지
    <div
      className="fixed top-0 bottom-0 w-full max-w-[430px] flex flex-col bg-surface"
      style={{ left: '50%', transform: 'translateX(-50%)', paddingTop: 'env(safe-area-inset-top)' }}
    >

      {/* 공지 팝업 — 메뉴 목록 진입 즉시 노출 */}
      {showNotice && (
        <NoticeModal
          onConfirm={() => setShowNotice(false)}
          onDontShowAgain={() => { dismissNotice(DELIVERY_FEE_NOTICE_ID, account?.storeId); setShowNotice(false) }}
        />
      )}

      {/* ── 내부 스크롤 컨테이너 ── */}
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>

        {/* 헤더 (스크롤 시 사라짐) */}
        <div className="bg-surface pt-14 px-6 pb-0">
          {/* 매장명과 주문자를 **같은 윗변**에 세운다.
              주문자를 아래 회색 박스 안에 넣었더니 거래처·잔액과 같은 무게로 읽혀서,
              "바꿀 수 있는 것"이라는 게 안 보였다. 박스 밖 우상단이 그 자리다. */}
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-[26px] font-bold text-ink min-w-0 truncate">{account.storeName ?? ''}</h1>
            {account.type !== '개인' && (
              <div className="flex-shrink-0 flex items-center gap-1.5">
                {orderer && (
                  <span className="text-[13px] text-[#222222] font-medium max-w-[120px] truncate">{orderer}</span>
                )}
                <button
                  onClick={() => {
                    track('orderer_change_open', { account_code: account.code })
                    ampTrack('orderer_change_open', { account_code: account.code })
                    setOrdererSheet(true)
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[#EDEDED] text-[13px] font-normal text-[#222222] active:bg-[#E0E0E0] transition-colors"
                >
                  {orderer ? '변경' : '주문자 선택'}
                </button>
              </div>
            )}
          </div>

          {/* 잔액이 음수면 이 박스를 아래로 늘려 경고를 **상시** 붙인다.
              토스트나 모달로 띄웠다가 닫히면 그만인 안내와 다르다 — 잔액이 마이너스인 동안
              주문할 때마다 보여야 하고, 잔액 숫자 바로 아래에 있어야 "이 숫자 때문"임이 읽힌다. */}
          <div className={`mt-3 mb-4 rounded-xl px-4 py-3 ${
            isNegativeBalance(account.balance) ? 'bg-[#FFF0F0]' : 'bg-gray-50'
          }`}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-light text-gray-text min-w-0 truncate">{account.name}</span>
              <div className="flex-shrink-0 text-right">
                <div className="text-[15px] font-light text-ink">선결제 잔액</div>
                <div className={[
                  'text-[16px] font-bold',
                  isLowBalance(account.balance) ? 'text-danger' : 'text-ink',
                ].join(' ')}>
                  {formatWon(account.balance)}
                </div>
              </div>
            </div>

            {isNegativeBalance(account.balance) && (
              <p className="mt-3 pt-3 border-t border-[#F5C6C6] text-[12px] text-[#C92A2A] leading-relaxed">
                빠른 시일 내에 선결제 금액을 충전해주세요.<br />
                미정산 금액에 대한 불이익이 발생할 수 있어요
              </p>
            )}
          </div>
        </div>

        {/* 카테고리 탭 (sticky — 내부 컨테이너 기준으로 동작) */}
        <div className="sticky top-0 z-10 bg-surface" style={{ position: 'sticky' }}>
          <div className="flex items-center">
            <div
              ref={tabsRef}
              className="flex gap-2 overflow-x-auto px-5 py-3 flex-1 scrollbar-hide"
              style={{ scrollbarWidth: 'none' }}
            >
              {categories.map(cat => (
                <button
                  key={cat.id}
                  ref={el => { tabButtonRefs.current[cat.id] = el }}
                  onClick={() => scrollToCategory(cat.id)}
                  className={[
                    'flex-shrink-0 px-[18px] py-[9px] text-[14px] font-semibold transition-colors',
                    'rounded-[27.5px]',
                    activeCategory === cat.id
                      ? 'bg-ink text-white'
                      : 'bg-gray-bg text-gray-text',
                  ].join(' ')}
                >
                  {cat.name}
                </button>
              ))}
            </div>
            <button
              onClick={() => { if (!showDropdown) { track('category_dropdown_open'); ampTrack('category_dropdown_open'); } setShowDropdown(v => !v) }}
              className="flex-shrink-0 w-10 h-10 mr-4 bg-surface border border-[#E0E0E0] rounded-full flex items-center justify-center text-gray-text"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
              aria-label="전체 카테고리"
            >
              <svg
                className="transition-transform duration-200"
                style={{ transform: showDropdown ? 'rotate(-90deg)' : 'rotate(90deg)', width: 22, height: 22 }}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              >
                <polyline points="9 6 15 12 9 18" />
              </svg>
            </button>
          </div>
          {/* 스크롤 시 아랫변 gradient 그림자 — overflow 컨테이너 안에서도 흰 콘텐츠 위에 보임 */}
          <div
            style={{
              position: 'absolute', bottom: -6, left: 0, right: 0, height: 6,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.05), transparent)',
              opacity: catBarShadow ? 1 : 0,
              transition: 'opacity 0.2s',
              pointerEvents: 'none',
            }}
          />
        </div>

        {/* 지난 주문 — 카테고리 탭 바로 아래. 처음 시키는 사람에겐 아무것도 안 보인다 */}
        {account?.code && (
          <RecentMenus
            accountCode={account.code}
            ordererName={orderer}
            // 데모에선 이 매장의 실제 메뉴로 가짜 '지난 주문'을 만든다(추가 쿼리 없음 —
            // menus 는 이 화면이 이미 들고 있다). 데모가 아니면 undefined 라 평소대로 RPC 를 탄다.
            demoPool={account.isDemo ? menus : undefined}
            onShown={count => {
              // ⚠️ 데모 트래픽은 로그에서 뺀다. recent_menus_* 는 경험1의 노출 대비 클릭률
              //    분모·분자라, 미리보기를 열어본 횟수가 섞이면 지표가 오염된다.
              if (account.isDemo) return
              track('recent_menus_shown', { count })
              ampTrack('recent_menus_shown', { count })
            }}
            onPick={(menuId, meta) => {
              // Menu.code 가 곧 menus.id 다 (lib/mappers.ts: code = row.id)
              const menu = menus.find(m => m.code === menuId)
              if (!menu) return
              // 스크롤을 거치지 않고 고른 경우라 scroll_pct 는 0 이다.
              // 일반 menu_card_click 과 구분해서 봐야 비교가 된다.
              const payload = {
                menu_name: menu.name, menu_code: menu.code,
                rank: meta.rank,          // 지난주문 줄에서 몇 번째 카드였나
                times: meta.times,        // 그 사람이 몇 번 시킨 메뉴인가
                is_top: meta.isTop,       // '가장 많이 주문함' 뱃지가 달린 카드였나
                source: 'recent',
                ...personProps(orderer),
              }
              if (!account.isDemo) {
                track('recent_menu_click', payload)
                ampTrack('recent_menu_click', payload)
                // 뱃지 달린 카드를 고른 경우는 따로도 한 번 — 퍼널에서 바로 분모/분자로 쓰려고
                if (meta.isTop) {
                  track('recent_menu_top_click', payload)
                  ampTrack('recent_menu_top_click', payload)
                }
              }
              // ?from= 은 상세 화면의 add_to_cart 가 "어느 목록에서 들어왔는지"를 알기 위한 것.
              // 클릭 시점엔 아는 정보인데 상세는 오버레이라 컴포넌트가 달라서, URL 로 넘긴다.
              router.push(`/menu?item=${menu.code}&from=recent`)
            }}
          />
        )}

        {/* 메뉴 목록 */}
        <div className="pb-[100px]">
          {categories.filter(c => menusByCat(c.id).length > 0).map((cat, i) => {
            const catMenus = menusByCat(cat.id)

            return (
              <div key={cat.id}>
                {/* 카테고리 사이를 가르는 바. **첫 카테고리 위에는 긋지 않는다** —
                    바로 위가 카테고리 탭이라(지난 주문이 없는 손님은 더더욱), 거기에
                    바가 붙으면 탭이 회색 띠를 깔고 앉은 것처럼 보인다.
                    스크롤 위치 계산에 ref 가 필요하므로 엘리먼트는 남기고 모양만 없앤다. */}
                <div
                  ref={el => { sectionRefs.current[cat.id] = el }}
                  data-cat={cat.id}
                  className={i === 0 ? 'h-0' : 'h-2 bg-gray-50 mt-2'}
                />
                <div className="px-5 pt-5 pb-1">
                  <h2 className="text-[20px] font-bold text-ink">{cat.name}</h2>
                </div>

                <div className="px-5">
                  {catMenus.map(menu => (
                    <MenuCard
                      key={menu.code}
                      menu={menu}
                      onClick={() => {
                        const el = scrollRef.current
                        const scrollPct = el ? Math.round((el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100) : 0
                        const catClicks = categoryClickCountRef.current
                        categoryClickCountRef.current = 0
                        track('menu_card_click', { menu_name: menu.name, menu_code: menu.code, scroll_pct: scrollPct, category_click_count: catClicks })
                        ampTrack('menu_card_click', { menu_name: menu.name, menu_code: menu.code, scroll_pct: scrollPct, category_click_count: catClicks })
                        router.push(`/menu?item=${menu.code}&from=list`)
                      }}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 맨 위로 버튼 */}
      {showScrollTop && (
        <button
          onClick={() => { ampTrack('scroll_to_top'); scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }) }}
          className="fixed right-5 z-20 w-10 h-10 bg-surface border border-gray-border rounded-full shadow-md flex items-center justify-center text-gray-text text-[13px]"
          style={{ bottom: qty > 0 ? '160px' : '80px' }}
          aria-label="맨 위로"
        >
          ↑
        </button>
      )}

      {/* 검색 플로팅 버튼 */}
      <button
        onClick={() => {
          const p = personProps(orderer)
          track('search_open', p); ampTrack('search_open', p)
          setSearchQuery(''); setSearchOpen(true)
        }}
        className="fixed right-5 z-20 w-10 h-10 bg-ink text-white rounded-full shadow-lg flex items-center justify-center"
        style={{ bottom: qty > 0 ? '100px' : '20px' }}
        aria-label="메뉴 검색"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>

      {/* 카테고리 모달 */}
      {showDropdown && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/50"
          onClick={() => setShowDropdown(false)}
        >
          <div
            className="bg-surface rounded-2xl w-[90vw] max-w-[380px] px-5 py-5 mx-4"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-[13px] font-bold text-ink mb-3 text-center">카테고리</p>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => scrollToCategory(cat.id, 'dropdown')}
                  className={[
                    'whitespace-nowrap py-2 px-3 text-[12px] font-semibold rounded-xl transition-colors',
                    activeCategory === cat.id
                      ? 'bg-ink text-white'
                      : 'bg-gray-50 text-gray-text',
                  ].join(' ')}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 장바구니 바 */}
      {qty > 0 && (
        <div
          className="flex-shrink-0 px-5 py-4 bg-surface"
          style={{ boxShadow: '0 -4px 20px rgba(0,0,0,0.08)' }}
        >
          <button
            onClick={() => {
              // 담긴 항목의 유입 경로 구성비를 같이 보낸다 — 담기→주문 기여도를 재려면
              // 이 단계부터 경로가 안 끊겨야 한다
              // item_count 는 이 이벤트에서 예전부터 **총 수량**(qty)이었다. 과거 데이터와
              // 끊기지 않게 그 의미를 유지하고, breakdown 의 동명 필드(= 줄 수)는 덮어쓴다.
              const p = { ...entrySourceBreakdown(cartItems), item_count: qty }
              track('cart_bar_click', p); ampTrack('cart_bar_click', p)
              router.push('/cart')
            }}
            className="w-full py-[16px] bg-ink text-white rounded-xl font-bold text-[15px] flex items-center justify-between px-5"
          >
            <span className="bg-surface/20 rounded-lg px-2 py-0.5 text-[13px]">{qty}개</span>
            <span>장바구니 보기</span>
            <span>{formatWon(subtotal)}</span>
          </button>
        </div>
      )}

      {/* ── 검색 모달 ── */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          style={{ animation: 'backdropFadeIn 0.2s ease', paddingTop: 'env(safe-area-inset-top)' }}
          onClick={() => { ampTrack('search_modal_close', { trigger: 'backdrop' }); setSearchOpen(false) }}
        >
          <div
            className="absolute left-0 right-0 bottom-0 bg-surface rounded-t-2xl flex flex-col overflow-hidden"
            style={{
              top: 'calc(48px + env(safe-area-inset-top))',
              animation: 'searchModalOpen 0.3s cubic-bezier(0.34, 1.4, 0.64, 1)',
              transformOrigin: 'bottom right',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* 헤더 + 검색 입력 (스크롤 시 아랫변 그림자) */}
            <div className="flex-shrink-0 relative">
              <div style={{ position: 'absolute', bottom: -6, left: 0, right: 0, height: 6, background: 'linear-gradient(to bottom, rgba(0,0,0,0.05), transparent)', opacity: searchBarShadow ? 1 : 0, transition: 'opacity 0.2s', pointerEvents: 'none', zIndex: 1 }} />
            {/* 헤더 */}
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <h2 className="text-[18px] font-extrabold text-ink">메뉴 검색</h2>
              <button
                onClick={() => { ampTrack('search_modal_close', { trigger: 'button' }); setSearchOpen(false) }}
                className="w-9 h-9 flex items-center justify-center text-gray-text"
                aria-label="닫기"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            {/* 검색 입력 */}
            <div className="px-5 pb-3">
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#727272" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onFocus={() => {
                    const p = personProps(orderer)
                    track('search_field_focus', p); ampTrack('search_field_focus', p)
                  }}
                  onKeyDown={e => {
                    // 엔터 = "찾아달라"는 분명한 의사표시. 글자를 치다 만 것과 구분된다.
                    if (e.key !== 'Enter') return
                    const q = searchQuery.trim()
                    if (!q) return
                    const p = { query: q, query_len: q.length, ...personProps(orderer) }
                    track('search_submit', p); ampTrack('search_submit', p)
                  }}
                  placeholder="메뉴 이름을 입력하세요"
                  className="flex-1 bg-transparent outline-none text-[15px] text-ink placeholder:text-gray-text"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="text-gray-text text-[16px] leading-none">✕</button>
                )}
              </div>
            </div>

            </div>{/* end 헤더+검색 wrapper */}

            {/* 스크롤 영역 (카테고리 탭 + 메뉴 목록) */}
            <div ref={searchScrollRef} className="flex-1 overflow-y-auto bg-surface">

              {/* 카테고리 탭 sticky */}
              {searchCategories.length > 0 && (
                <div className="sticky top-0 z-10 bg-surface" style={{ position: 'sticky' }}>
                  <div className="flex items-center">
                    <div
                      ref={searchTabsRef}
                      className="flex gap-2 overflow-x-auto px-5 py-3 flex-1"
                      style={{ scrollbarWidth: 'none' }}
                    >
                      {searchCategories.map(cat => (
                        <button
                          key={cat.id}
                          ref={el => { searchTabRefs.current[cat.id] = el }}
                          onClick={() => { ampTrack('search_category_tab_click', { category_id: cat.id, category_name: cat.name }); scrollToSearchCategory(cat.id) }}
                          className={[
                            'flex-shrink-0 px-[18px] py-[9px] text-[14px] font-semibold transition-colors rounded-[27.5px]',
                            searchActiveCategory === cat.id
                              ? 'bg-ink text-white'
                              : 'bg-gray-bg text-gray-text',
                          ].join(' ')}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => { ampTrack('search_category_dropdown_open'); setSearchShowDropdown(v => !v) }}
                      className="flex-shrink-0 w-10 h-10 mr-4 bg-surface border border-[#E0E0E0] rounded-full flex items-center justify-center text-gray-text"
                      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
                      aria-label="전체 카테고리"
                    >
                      <svg
                        className="transition-transform duration-200"
                        style={{ transform: searchShowDropdown ? 'rotate(-90deg)' : 'rotate(90deg)', width: 22, height: 22 }}
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      >
                        <polyline points="9 6 15 12 9 18" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {/* 메뉴 목록 */}
              {searchCategories.length > 0 ? (
                <div className="pb-10">
                  {searchCategories.map(cat => (
                    <div key={cat.id}>
                      <div
                        ref={el => { searchSectionRefs.current[cat.id] = el }}
                        className="h-2 bg-gray-50 mt-2"
                      />
                      <div className="px-5 pt-5 pb-1">
                        <h2 className="text-[20px] font-bold text-ink">{cat.name}</h2>
                      </div>
                      <div className="px-5">
                        {searchResults.filter(m => m.cat === cat.id).map((menu, si) => (
                          <MenuCard
                            key={menu.code}
                            menu={menu}
                            onClick={() => {
                              const sp = {
                                menu_name: menu.name, menu_code: menu.code,
                                query: searchQuery.trim(), rank: si + 1,
                                ...personProps(orderer),
                              }
                              track('search_menu_click', sp)
                              ampTrack('search_menu_click', sp)
                              setSearchOpen(false)
                              router.push(`/menu?item=${menu.code}&from=search`)
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : searchQuery.trim() ? (
                <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
                  <p className="text-[40px] mb-4">🔍</p>
                  <p className="text-[16px] font-semibold text-ink">검색 결과가 없습니다</p>
                  <p className="text-[13px] text-gray-text mt-1">다른 키워드로 검색해 보세요</p>
                </div>
              ) : null}
            </div>

            {/* 검색 내 카테고리 드롭다운 */}
            {searchShowDropdown && (
              <div
                className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 rounded-t-2xl"
                onClick={() => setSearchShowDropdown(false)}
              >
                <div
                  className="bg-surface rounded-2xl w-[90%] max-w-[380px] px-5 py-5"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[13px] font-bold text-ink">카테고리</p>
                    <button
                      onClick={() => setSearchShowDropdown(false)}
                      className="w-8 h-8 flex items-center justify-center text-gray-text"
                      aria-label="닫기"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {searchCategories.map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => { scrollToSearchCategory(cat.id); setSearchShowDropdown(false) }}
                        className={[
                          'whitespace-nowrap py-2 px-3 text-[12px] font-semibold rounded-xl transition-colors',
                          searchActiveCategory === cat.id
                            ? 'bg-ink text-white'
                            : 'bg-gray-50 text-gray-text',
                        ].join(' ')}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 주문자 변경 — 루트에서 PIN 직후 올라오는 것과 **같은 시트**.
          여기선 이미 고른 사람이 있으므로 바깥을 눌러 닫을 수 있다(onClose). */}
      {account && (
        <OrdererSheet
          open={ordererSheet}
          accountCode={account.code}
          pin={account.pin ?? ''}
          currentName={orderer || undefined}
          onClose={() => setOrdererSheet(false)}
          onPick={async m => {
            setOrdererSheet(false)
            setOrderer(m.name)
            try {
              const { data: phone } = await getSupabaseClient().rpc('member_contact', {
                p_account_code: account.code,
                p_pin:          account.pin ?? '',
                p_member_id:    m.id,
              })
              setPhone(typeof phone === 'string' ? phone : '')
            } catch { setPhone('') }
          }}
          onSkip={() => {
            // 직접 입력하겠다는 뜻 — 세션의 주문자를 비워 체크아웃이 입력칸을 다시 펼치게 한다
            setOrdererSheet(false)
            setOrderer('')
            setPhone('')
          }}
        />
      )}

      {/* 메뉴 상세 오버레이 — ?item=code 파라미터가 있을 때 표시 */}
      {selectedItemCode && (
        <div className="fixed top-0 bottom-0 w-full max-w-[430px] z-50 bg-surface" style={{ left: '50%', transform: 'translateX(-50%)', paddingTop: 'env(safe-area-inset-top)' }}>
          <Suspense>
            <MenuDetailClient code={selectedItemCode} />
          </Suspense>
        </div>
      )}
    </div>
  )
}
