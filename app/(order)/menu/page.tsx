'use client'

import { useState, useEffect, useRef, useCallback, Suspense, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSessionStore } from '@/lib/store/session'
import { useCartStore } from '@/lib/store/cart'
import { getSupabaseClient } from '@/lib/supabase/client'
import { formatWon } from '@/lib/utils'
import MenuCard from '@/components/menu/menu-card'
import { track } from '@/lib/firebase'
import MenuDetailClient from './[code]/menu-detail-client'
import type { Category, Menu } from '@/lib/types'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { mapDbMenu } from '@/lib/mappers'

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

  // 잔액 실시간 구독 (Supabase Realtime)
  const setAccount = useSessionStore(s => s.setAccount)
  useEffect(() => {
    if (!account) return
    const supabase = getSupabaseClient()

    const currentAccount = account
    supabase
      .from('accounts')
      .select('current_balance')
      .eq('account_code', currentAccount.code)
      .maybeSingle()
      .then(({ data }: { data: { current_balance: number } | null }) => {
        if (data && data.current_balance !== currentAccount.balance) {
          setAccount({ ...currentAccount, balance: data.current_balance })
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

        let catQuery = supabase
          .from('categories')
          .select('id, name, display_order')
          .eq('is_active', true)
          .order('display_order', { ascending: true })
        if (account?.storeId) catQuery = catQuery.eq('store_id', account.storeId)
        const { data: catData, error: catError } = await catQuery
        if (catError) throw catError

        if (!catData || catData.length === 0) {
          return
        }

        const cats: Category[] = catData.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))
        setCategories(cats)
        setActiveCategory(cats[0].id)

        const catIds = cats.map(c => c.id)
        const { data: menuData, error: menuError } = await supabase
          .from('menus')
          .select(`
            id, category_id, name, description, base_price, image_url,
            is_popular, is_recommended, is_new, is_sold_out, is_hidden, display_order,
            menu_option_groups (
              display_order,
              option_groups (
                id, name, is_required, is_multi, max_select, is_sold_out, is_hidden,
                option_items ( id, name, extra_price, is_sold_out, is_hidden, display_order )
              )
            )
          `)
          .in('category_id', catIds)
          .eq('is_hidden', false)
          .order('display_order', { ascending: true })
        if (menuError) throw menuError

        setMenus((menuData ?? []).map(mapDbMenu))
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

  const scrollToCategory = useCallback((catId: string, source: 'tab' | 'dropdown' = 'tab') => {
    const el = sectionRefs.current[catId]
    const container = scrollRef.current
    if (!el || !container) return
    const catName = categoriesRef.current.find(c => c.id === catId)?.name ?? catId
    track(source === 'dropdown' ? 'category_dropdown_select' : 'category_tab_click', { category_name: catName })
    isScrollingToRef.current = true
    setActiveCategory(catId)
    setShowDropdown(false)

    // 탭바 하단 기준으로 스크롤 위치 계산 — 구분선 top이 탭바 bottom에 정확히 닿도록
    const tabsBottom = tabsRef.current?.getBoundingClientRect().bottom ?? 60
    const elTop = el.getBoundingClientRect().top
    const scrollTop = container.scrollTop + (elTop - tabsBottom)
    container.scrollTo({ top: scrollTop, behavior: 'smooth' })
    setTimeout(() => { isScrollingToRef.current = false }, 800)
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
      <div className="flex flex-col items-center justify-center min-h-screen px-8 text-center bg-white">
        <p className="text-[16px] font-semibold text-[#1E1E1E] mb-2">세션이 만료되었습니다</p>
        <p className="text-[13px] text-[#727272] mb-6">QR 코드를 다시 스캔해 주세요.</p>
        <a href="/" className="text-[14px] font-semibold text-[#017333] underline">처음으로</a>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white">
        <div className="w-8 h-8 border-4 border-[#017333] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-[14px] text-[#727272]">메뉴를 불러오는 중...</p>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-8 text-center bg-white gap-3">
        <p className="text-[16px] font-semibold text-[#1E1E1E]">메뉴를 불러오지 못했습니다</p>
        <p className="text-[13px] text-[#727272]">네트워크 상태를 확인하고 다시 시도해주세요.</p>
        <button
          onClick={() => setRetryCount(c => c + 1)}
          className="mt-2 px-6 py-2.5 rounded-full bg-[#017333] text-white text-[14px] font-semibold"
        >
          다시 시도
        </button>
      </div>
    )
  }

  return (
    // fixed + centered: 430px 안에서 뷰포트 전체 높이를 점유 → sticky/overflow 동작 유지
    <div
      className="fixed top-0 bottom-0 w-full max-w-[430px] flex flex-col bg-white"
      style={{ left: '50%', transform: 'translateX(-50%)', paddingTop: 'env(safe-area-inset-top)' }}
    >

      {/* ── 내부 스크롤 컨테이너 ── */}
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>

        {/* 헤더 (스크롤 시 사라짐) */}
        <div className="bg-white pt-14 px-6 pb-0">
          <h1 className="text-[26px] font-bold text-[#1E1E1E]">{account.storeName ?? ''}</h1>

          <div className="mt-3 mb-4 bg-[#F5F5F5] rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-[13px] text-[#727272]">
              <span className="text-[15px] font-semibold text-[#1E1E1E]">{account.name}</span>
              {orderer && <span className="ml-1 text-[#727272]">· {orderer}</span>}
            </span>
            <div className="text-right">
              <div className="text-[13px] text-[#727272]">선결제 잔액</div>
              <div className={[
                'text-[16px] font-bold',
                account.balance < 30000 ? 'text-[#C92A2A]' : 'text-[#017333]',
              ].join(' ')}>
                {formatWon(account.balance)}
              </div>
            </div>
          </div>
        </div>

        {/* 카테고리 탭 (sticky — 내부 컨테이너 기준으로 동작) */}
        <div className="sticky top-0 z-10 bg-white" style={{ position: 'sticky' }}>
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
                      ? 'bg-[#1E1E1E] text-white'
                      : 'bg-[#FAFAFA] text-[#727272]',
                  ].join(' ')}
                >
                  {cat.name}
                </button>
              ))}
            </div>
            <button
              onClick={() => { if (!showDropdown) track('category_dropdown_open'); setShowDropdown(v => !v) }}
              className="flex-shrink-0 w-10 h-10 mr-4 bg-white border border-[#E0E0E0] rounded-full flex items-center justify-center text-[#727272]"
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

        {/* 메뉴 목록 */}
        <div className="pb-[100px]">
          {categories.map(cat => {
            const catMenus = menusByCat(cat.id)
            if (catMenus.length === 0) return null

            return (
              <div key={cat.id}>
                <div
                  ref={el => { sectionRefs.current[cat.id] = el }}
                  data-cat={cat.id}
                  className="h-2 bg-[#F5F5F5] mt-2"
                />
                <div className="px-5 pt-5 pb-1">
                  <h2 className="text-[20px] font-bold text-[#1E1E1E]">{cat.name}</h2>
                </div>

                <div className="px-5">
                  {catMenus.map(menu => (
                    <MenuCard
                      key={menu.code}
                      menu={menu}
                      onClick={() => { track('menu_card_click', { menu_name: menu.name, menu_code: menu.code }); router.push(`/menu?item=${menu.code}`) }}
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
          onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed right-5 z-20 w-10 h-10 bg-white border border-[#D7D7D7] rounded-full shadow-md flex items-center justify-center text-[#727272] text-[13px]"
          style={{ bottom: qty > 0 ? '160px' : '80px' }}
          aria-label="맨 위로"
        >
          ↑
        </button>
      )}

      {/* 검색 플로팅 버튼 */}
      <button
        onClick={() => { setSearchQuery(''); setSearchOpen(true) }}
        className="fixed right-5 z-20 w-10 h-10 bg-[#1E1E1E] text-white rounded-full shadow-lg flex items-center justify-center"
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
            className="bg-white rounded-2xl w-[90vw] max-w-[380px] px-5 py-5 mx-4"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-[13px] font-bold text-[#1E1E1E] mb-3 text-center">카테고리</p>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => scrollToCategory(cat.id, 'dropdown')}
                  className={[
                    'whitespace-nowrap py-2 px-3 text-[12px] font-semibold rounded-xl transition-colors',
                    activeCategory === cat.id
                      ? 'bg-[#1E1E1E] text-white'
                      : 'bg-[#F5F5F5] text-[#727272]',
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
          className="flex-shrink-0 px-5 py-4 bg-white"
          style={{ boxShadow: '0 -4px 20px rgba(0,0,0,0.08)' }}
        >
          <button
            onClick={() => { track('cart_bar_click', { item_count: qty }); router.push('/cart') }}
            className="w-full py-[16px] bg-[#1E1E1E] text-white rounded-xl font-bold text-[15px] flex items-center justify-between px-5"
          >
            <span className="bg-white/20 rounded-lg px-2 py-0.5 text-[13px]">{qty}개</span>
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
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="absolute left-0 right-0 bottom-0 bg-white rounded-t-2xl flex flex-col overflow-hidden"
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
              <h2 className="text-[18px] font-extrabold text-[#1E1E1E]">메뉴 검색</h2>
              <button
                onClick={() => setSearchOpen(false)}
                className="w-9 h-9 flex items-center justify-center text-[#727272]"
                aria-label="닫기"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            {/* 검색 입력 */}
            <div className="px-5 pb-3">
              <div className="flex items-center gap-2 bg-[#F5F5F5] rounded-xl px-4 py-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#727272" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="메뉴 이름을 입력하세요"
                  className="flex-1 bg-transparent outline-none text-[15px] text-[#1E1E1E] placeholder:text-[#727272]"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="text-[#727272] text-[16px] leading-none">✕</button>
                )}
              </div>
            </div>

            </div>{/* end 헤더+검색 wrapper */}

            {/* 스크롤 영역 (카테고리 탭 + 메뉴 목록) */}
            <div ref={searchScrollRef} className="flex-1 overflow-y-auto bg-white">

              {/* 카테고리 탭 sticky */}
              {searchCategories.length > 0 && (
                <div className="sticky top-0 z-10 bg-white" style={{ position: 'sticky' }}>
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
                          onClick={() => scrollToSearchCategory(cat.id)}
                          className={[
                            'flex-shrink-0 px-[18px] py-[9px] text-[14px] font-semibold transition-colors rounded-[27.5px]',
                            searchActiveCategory === cat.id
                              ? 'bg-[#1E1E1E] text-white'
                              : 'bg-[#FAFAFA] text-[#727272]',
                          ].join(' ')}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setSearchShowDropdown(v => !v)}
                      className="flex-shrink-0 w-10 h-10 mr-4 bg-white border border-[#E0E0E0] rounded-full flex items-center justify-center text-[#727272]"
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
                        className="h-2 bg-[#F5F5F5] mt-2"
                      />
                      <div className="px-5 pt-5 pb-1">
                        <h2 className="text-[20px] font-bold text-[#1E1E1E]">{cat.name}</h2>
                      </div>
                      <div className="px-5">
                        {searchResults.filter(m => m.cat === cat.id).map(menu => (
                          <MenuCard
                            key={menu.code}
                            menu={menu}
                            onClick={() => {
                              track('search_menu_click', { menu_name: menu.name, query: searchQuery.trim() })
                              setSearchOpen(false)
                              router.push(`/menu?item=${menu.code}`)
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
                  <p className="text-[16px] font-semibold text-[#1E1E1E]">검색 결과가 없습니다</p>
                  <p className="text-[13px] text-[#727272] mt-1">다른 키워드로 검색해 보세요</p>
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
                  className="bg-white rounded-2xl w-[90%] max-w-[380px] px-5 py-5"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[13px] font-bold text-[#1E1E1E]">카테고리</p>
                    <button
                      onClick={() => setSearchShowDropdown(false)}
                      className="w-8 h-8 flex items-center justify-center text-[#727272]"
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
                            ? 'bg-[#1E1E1E] text-white'
                            : 'bg-[#F5F5F5] text-[#727272]',
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

      {/* 메뉴 상세 오버레이 — ?item=code 파라미터가 있을 때 표시 */}
      {selectedItemCode && (
        <div className="fixed top-0 bottom-0 w-full max-w-[430px] z-50 bg-white" style={{ left: '50%', transform: 'translateX(-50%)', paddingTop: 'env(safe-area-inset-top)' }}>
          <Suspense>
            <MenuDetailClient code={selectedItemCode} />
          </Suspense>
        </div>
      )}
    </div>
  )
}
