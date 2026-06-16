'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionStore } from '@/lib/store/session'
import { useCartStore } from '@/lib/store/cart'
import { CATEGORIES, MENUS } from '@/lib/mock-data'
import { formatWon } from '@/lib/utils'
import MenuCard from '@/components/menu/menu-card'

// 인기 메뉴 필터 포함 실제 렌더링 카테고리
const RENDER_CATS = CATEGORIES.filter(c => c.id !== 'all')

export default function MenuPage() {
  const router = useRouter()
  const account = useSessionStore(s => s.account)
  const orderer = useSessionStore(s => s.orderer)
  const totalQty = useCartStore(s => s.totalQty)
  const totalSubtotal = useCartStore(s => s.totalSubtotal)

  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].id)
  const [showDropdown, setShowDropdown] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const tabsRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const isScrollingToRef = useRef(false)

  // 세션 가드
  useEffect(() => {
    if (!account) router.replace('/')
  }, [account, router])

  // 스크롤 감지 (scroll-to-top 버튼)
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 300)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // IntersectionObserver로 카테고리 탭 스크롤 스파이
  useEffect(() => {
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
      { threshold: 0.3, rootMargin: '-60px 0px -60% 0px' }
    )

    Object.values(sectionRefs.current).forEach(el => {
      if (el) observerRef.current?.observe(el)
    })

    return () => observerRef.current?.disconnect()
  }, [])

  const scrollToCategory = useCallback((catId: string) => {
    const el = sectionRefs.current[catId]
    if (!el) return
    isScrollingToRef.current = true
    setActiveCategory(catId)
    setShowDropdown(false)

    const headerHeight = 130 // 헤더 + 탭 높이 대략
    const top = el.getBoundingClientRect().top + window.scrollY - headerHeight
    window.scrollTo({ top, behavior: 'smooth' })
    setTimeout(() => { isScrollingToRef.current = false }, 800)
  }, [])

  // 카테고리별 메뉴 그룹
  const menusByCat = useCallback((catId: string) => {
    if (catId === 'popular') return MENUS.filter(m => m.popular && !m.isHidden)
    return MENUS.filter(m => m.cat === catId && !m.isHidden)
  }, [])

  const qty = totalQty()
  const subtotal = totalSubtotal()

  if (!account) return null

  return (
    <div className="bg-white min-h-screen">
      {/* ── 헤더 ── */}
      <div className="bg-white pt-14 px-6 pb-0">
        <h1 className="text-[26px] font-bold text-[#1E1E1E]">샐러리아 침산점</h1>

        {/* 사용자 배지 */}
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

      {/* ── 카테고리 탭 (sticky) ── */}
      <div className="sticky top-0 z-10 bg-white border-b border-[#F0F0F0]">
        <div className="flex items-center">
          {/* 가로 스크롤 탭 */}
          <div
            ref={tabsRef}
            className="flex gap-2 overflow-x-auto px-5 py-3 flex-1 scrollbar-hide"
            style={{ scrollbarWidth: 'none' }}
          >
            {CATEGORIES.map(cat => (
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
          {/* 드롭다운 버튼 */}
          <button
            onClick={() => setShowDropdown(v => !v)}
            className="flex-shrink-0 w-8 h-8 mr-4 bg-[#FAFAFA] border border-[#D7D7D7] rounded-full flex items-center justify-center text-[#727272] text-[11px]"
            aria-label="전체 카테고리"
          >
            {showDropdown ? '▲' : '▼'}
          </button>
        </div>

        {/* 드롭다운 오버레이 */}
        {showDropdown && (
          <div className="bg-white border-b border-[#F0F0F0] px-5 pb-4 pt-2">
            <div className="grid grid-cols-4 gap-2">
              {CATEGORIES.map(cat => (
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

      {/* ── 메뉴 목록 ── */}
      <div className="pb-[100px]">
        {RENDER_CATS.map(cat => {
          const menus = menusByCat(cat.id)
          if (menus.length === 0) return null

          return (
            <div
              key={cat.id}
              ref={el => { sectionRefs.current[cat.id] = el }}
              data-cat={cat.id}
            >
              {/* 섹션 구분선 + 제목 */}
              <div className="h-2 bg-[#F5F5F5] mt-2" />
              <div className="px-5 pt-5 pb-1">
                <h2 className="text-[15px] font-bold text-[#1E1E1E]">{cat.name}</h2>
              </div>

              {/* 메뉴 카드 목록 */}
              <div className="px-5">
                {menus.map(menu => (
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

      {/* ── 스크롤 탑 버튼 ── */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-[90px] right-5 w-10 h-10 bg-white border border-[#D7D7D7] rounded-full shadow-md flex items-center justify-center text-[#727272] text-[13px] z-20"
          aria-label="맨 위로"
        >
          ↑
        </button>
      )}

      {/* ── 장바구니 바 ── */}
      {qty > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-30"
          style={{ maxWidth: '430px', margin: '0 auto' }}
        >
          <div
            className="mx-0 px-5 py-4 bg-white"
            style={{ boxShadow: '0 -4px 20px rgba(0,0,0,0.08)' }}
          >
            <button
              onClick={() => router.push('/cart')}
              className="w-full py-[16px] bg-[#017333] text-white rounded-xl font-bold text-[15px] flex items-center justify-between px-5"
            >
              <span className="bg-white/20 rounded-lg px-2 py-0.5 text-[13px]">{qty}개</span>
              <span>장바구니 보기</span>
              <span>{formatWon(subtotal)}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
