'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionStore } from '@/lib/store/session'
import { useCartStore } from '@/lib/store/cart'
import { getSupabaseClient } from '@/lib/supabase/client'
import { formatWon } from '@/lib/utils'
import MenuCard from '@/components/menu/menu-card'
import type { Category, Menu, MenuOptionGroup } from '@/lib/types'
import type { RealtimeChannel } from '@supabase/supabase-js'

// DB row → Menu 타입 변환
function mapDbMenu(row: any): Menu {
  const options: MenuOptionGroup[] = (row.menu_option_groups ?? [])
    .sort((a: any, b: any) => a.display_order - b.display_order)
    .map((mog: any) => {
      const og = mog.option_groups
      return {
        group: og.name,
        required: og.is_required,
        multi: og.is_multi,
        items: (og.option_items ?? [])
          .filter((it: any) => !it.is_hidden)
          .sort((a: any, b: any) => a.display_order - b.display_order)
          .map((it: any) => ({
            id: it.id,
            name: it.name,
            plus: it.extra_price,
            isSoldOut: it.is_sold_out,
          })),
      }
    })

  return {
    code:      row.id,
    cat:       row.category_id,
    name:      row.name,
    desc:      row.description ?? '',
    price:     row.base_price,
    emoji:     '🍽️',
    imageUrl:  row.image_url ?? undefined,
    popular:   row.is_popular,
    isSoldOut: row.is_sold_out,
    isHidden:  row.is_hidden,
    options,
  }
}

export default function MenuPage() {
  const router = useRouter()
  const account = useSessionStore(s => s.account)
  const orderer = useSessionStore(s => s.orderer)
  const totalQty = useCartStore(s => s.totalQty)
  const totalSubtotal = useCartStore(s => s.totalSubtotal)

  const [categories, setCategories] = useState<Category[]>([])
  const [menus, setMenus] = useState<Menu[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const tabsRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const isScrollingToRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)  // 내부 스크롤 컨테이너

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
      const supabase = getSupabaseClient()

      let catQuery = supabase
        .from('categories')
        .select('id, name, display_order')
        .order('display_order', { ascending: true })
      if (account?.storeId) catQuery = catQuery.eq('store_id', account.storeId)
      const { data: catData } = await catQuery

      if (!catData || catData.length === 0) {
        setLoading(false)
        return
      }

      const cats: Category[] = catData.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))
      const allCats: Category[] = [{ id: '__popular__', name: '인기 메뉴' }, ...cats]
      setCategories(allCats)
      setActiveCategory(allCats[0].id)

      const catIds = cats.map(c => c.id)
      const { data: menuData } = await supabase
        .from('menus')
        .select(`
          id, category_id, name, description, base_price, image_url,
          is_popular, is_sold_out, is_hidden, display_order,
          menu_option_groups (
            display_order,
            option_groups (
              id, name, is_required, is_multi, max_select,
              option_items ( id, name, extra_price, is_sold_out, is_hidden, display_order )
            )
          )
        `)
        .in('category_id', catIds)
        .eq('is_hidden', false)
        .order('display_order', { ascending: true })

      setMenus((menuData ?? []).map(mapDbMenu))
      setLoading(false)
    }
    load()
  }, [account])

  // 스크롤 감지 — window 대신 내부 컨테이너 사용
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => setShowScrollTop(el.scrollTop > 300)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // IntersectionObserver — root를 내부 스크롤 컨테이너로 설정
  useEffect(() => {
    if (categories.length === 0) return
    const container = scrollRef.current
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (isScrollingToRef.current) return
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const catId = entry.target.getAttribute('data-cat')
            if (catId) setActiveCategory(catId)
          }
        })
      },
      { root: container, threshold: 0.3, rootMargin: '-60px 0px -60% 0px' }
    )

    Object.values(sectionRefs.current).forEach(el => {
      if (el) observerRef.current?.observe(el)
    })

    return () => observerRef.current?.disconnect()
  }, [categories])

  const scrollToCategory = useCallback((catId: string) => {
    const el = sectionRefs.current[catId]
    const container = scrollRef.current
    if (!el || !container) return
    isScrollingToRef.current = true
    setActiveCategory(catId)
    setShowDropdown(false)

    const tabsHeight = 52
    const containerTop = container.getBoundingClientRect().top
    const elTop = el.getBoundingClientRect().top
    const scrollTop = container.scrollTop + (elTop - containerTop) - tabsHeight
    container.scrollTo({ top: scrollTop, behavior: 'smooth' })
    setTimeout(() => { isScrollingToRef.current = false }, 800)
  }, [])

  const menusByCat = useCallback((catId: string) => {
    if (catId === '__popular__') return menus.filter(m => m.popular)
    return menus.filter(m => m.cat === catId)
  }, [menus])

  const qty = totalQty()
  const subtotal = totalSubtotal()

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

  return (
    // fixed inset-0: 뷰포트 전체를 점유 → 내부 overflow-y-auto 높이가 확정되어 sticky 동작
    <div
      className="fixed inset-0 flex flex-col bg-white"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* ── 내부 스크롤 컨테이너 ── */}
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>

        {/* 헤더 (스크롤 시 사라짐) */}
        <div className="bg-white pt-14 px-6 pb-0">
          <h1 className="text-[26px] font-bold text-[#1E1E1E]">{account.storeName ?? '샐러리아'}</h1>

          <div className="mt-3 mb-4 bg-[#F5F5F5] rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-[13px] text-[#727272]">
              <span className="font-semibold text-[#1E1E1E]">{account.name}</span>
              {orderer && <span className="ml-1 text-[#727272]">· {orderer}</span>}
            </span>
            <div className="text-right">
              <div className="text-[11px] text-[#727272]">선결제 잔액</div>
              <div className={[
                'text-[14px] font-bold',
                account.balance < 30000 ? 'text-[#C92A2A]' : 'text-[#017333]',
              ].join(' ')}>
                {formatWon(account.balance)}
              </div>
            </div>
          </div>
        </div>

        {/* 카테고리 탭 (sticky — 내부 컨테이너 기준으로 동작) */}
        <div className="sticky top-0 z-10 bg-white border-b border-[#F0F0F0]">
          <div className="flex items-center">
            <div
              ref={tabsRef}
              className="flex gap-2 overflow-x-auto px-5 py-3 flex-1 scrollbar-hide"
              style={{ scrollbarWidth: 'none' }}
            >
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => scrollToCategory(cat.id)}
                  className={[
                    'flex-shrink-0 px-[14px] py-[7px] text-[13px] font-semibold transition-colors',
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
              onClick={() => setShowDropdown(v => !v)}
              className="flex-shrink-0 w-8 h-8 mr-4 bg-[#FAFAFA] border border-[#D7D7D7] rounded-full flex items-center justify-center text-[#727272] text-[11px]"
              aria-label="전체 카테고리"
            >
              {showDropdown ? '▲' : '▼'}
            </button>
          </div>

          {showDropdown && (
            <div className="bg-white border-b border-[#F0F0F0] px-5 pb-4 pt-2">
              <div className="grid grid-cols-4 gap-2">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => scrollToCategory(cat.id)}
                    className={[
                      'py-2 px-1 text-[12px] font-semibold rounded-lg transition-colors',
                      activeCategory === cat.id
                        ? 'bg-[#1E1E1E] text-white'
                        : 'bg-[#FAFAFA] text-[#727272]',
                    ].join(' ')}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 메뉴 목록 */}
        <div className="pb-[100px]">
          {categories.map(cat => {
            const catMenus = menusByCat(cat.id)
            if (catMenus.length === 0) return null

            return (
              <div
                key={cat.id}
                ref={el => { sectionRefs.current[cat.id] = el }}
                data-cat={cat.id}
              >
                <div className="h-2 bg-[#F5F5F5] mt-2" />
                <div className="px-5 pt-5 pb-1">
                  <h2 className="text-[15px] font-bold text-[#1E1E1E]">{cat.name}</h2>
                </div>

                <div className="px-5">
                  {catMenus.map(menu => (
                    <MenuCard
                      key={menu.code}
                      menu={menu}
                      onClick={() => router.push(`/menu/${menu.code}`)}
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
          className="absolute right-5 z-20 w-10 h-10 bg-white border border-[#D7D7D7] rounded-full shadow-md flex items-center justify-center text-[#727272] text-[13px]"
          style={{ bottom: qty > 0 ? '90px' : '20px' }}
          aria-label="맨 위로"
        >
          ↑
        </button>
      )}

      {/* 장바구니 바 */}
      {qty > 0 && (
        <div
          className="flex-shrink-0 px-5 py-4 bg-white"
          style={{ boxShadow: '0 -4px 20px rgba(0,0,0,0.08)' }}
        >
          <button
            onClick={() => router.push('/cart')}
            className="w-full py-[16px] bg-[#1E1E1E] text-white rounded-xl font-bold text-[15px] flex items-center justify-between px-5"
          >
            <span className="bg-white/20 rounded-lg px-2 py-0.5 text-[13px]">{qty}개</span>
            <span>장바구니 보기</span>
            <span>{formatWon(subtotal)}</span>
          </button>
        </div>
      )}
    </div>
  )
}
