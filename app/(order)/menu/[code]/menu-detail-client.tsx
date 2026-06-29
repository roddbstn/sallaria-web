'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSessionStore } from '@/lib/store/session'
import { useCartStore } from '@/lib/store/cart'
import { getSupabaseClient } from '@/lib/supabase/client'
import { formatWon, calcSubtotal } from '@/lib/utils'
import type { Menu, MenuOptionGroup, SelectedOption } from '@/lib/types'
import OptionGroup from '@/components/menu/option-group'

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

export default function MenuDetailClient({ code }: { code: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editCartId = searchParams.get('edit')   // 장바구니 수정 모드

  const account    = useSessionStore(s => s.account)
  const addItem    = useCartStore(s => s.addItem)
  const updateItem = useCartStore(s => s.updateItem)
  const items      = useCartStore(s => s.items)

  const [menu, setMenu] = useState<Menu | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedMap, setSelectedMap] = useState<Record<number, string[]>>({})
  const [qty, setQty] = useState(1)
  const [missingGroups, setMissingGroups] = useState<number[]>([])

  useEffect(() => {
    async function fetchMenu() {
      setLoading(true)
      const supabase = getSupabaseClient()
      const { data, error } = await supabase
        .from('menus')
        .select(`
          id, category_id, name, description, base_price, image_url,
          is_popular, is_sold_out, is_hidden,
          menu_option_groups (
            display_order,
            option_groups (
              id, name, is_required, is_multi, max_select,
              option_items ( id, name, extra_price, is_sold_out, is_hidden, display_order )
            )
          )
        `)
        .eq('id', code)
        .single()

      if (error || !data) {
        router.replace('/menu')
        return
      }
      const mapped = mapDbMenu(data)
      setMenu(mapped)

      // 편집 모드: 장바구니의 기존 옵션·수량 복원
      const editingItem = editCartId ? items.find(i => i.cartId === editCartId) : null
      if (editingItem) {
        setQty(editingItem.qty)
        const restored: Record<number, string[]> = {}
        editingItem.selectedOptions.forEach(opt => {
          if (!restored[opt.optionGroupIndex]) restored[opt.optionGroupIndex] = []
          restored[opt.optionGroupIndex].push(opt.optionId)
        })
        setSelectedMap(restored)
      } else {
        // 신규 담기: 필수 옵션그룹의 첫 번째 항목 자동 선택
        const initial: Record<number, string[]> = {}
        mapped.options.forEach((group, idx) => {
          if (group.required && group.items.length > 0) {
            const first = group.items.find(it => !it.isSoldOut) ?? group.items[0]
            initial[idx] = [first.id]
          }
        })
        if (Object.keys(initial).length > 0) setSelectedMap(initial)
      }

      setLoading(false)
    }
    fetchMenu()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const handleToggle = useCallback((groupIndex: number, itemId: string) => {
    if (!menu) return
    const group = menu.options[groupIndex]
    if (!group) return

    setSelectedMap(prev => {
      const current = prev[groupIndex] ?? []
      let next: string[]

      if (group.multi) {
        next = current.includes(itemId)
          ? current.filter(id => id !== itemId)
          : [...current, itemId]
      } else {
        next = current[0] === itemId ? [] : [itemId]
      }

      return { ...prev, [groupIndex]: next }
    })

    setMissingGroups(prev => prev.filter(i => i !== groupIndex))
  }, [menu])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="w-8 h-8 border-4 border-[#017333] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!menu) return null

  const selectedOptions: SelectedOption[] = menu.options.flatMap((group, gIdx) =>
    (selectedMap[gIdx] ?? []).flatMap(id => {
      const item = group.items.find(it => it.id === id)
      return item ? [{ optionGroupIndex: gIdx, optionId: id, optionName: item.name, plus: item.plus }] : []
    })
  )

  const subtotal = calcSubtotal(menu.price, selectedOptions, qty)
  const currentBalance = account ? account.balance : 0
  const afterBalance = currentBalance - subtotal

  const validateRequired = (): boolean => {
    const missing: number[] = []
    menu.options.forEach((group, idx) => {
      if (group.required && (selectedMap[idx] ?? []).length === 0) missing.push(idx)
    })
    setMissingGroups(missing)
    return missing.length === 0
  }

  const handleAddToCart = () => {
    if (!validateRequired()) {
      const firstMissingEl = document.querySelector('[data-missing="true"]')
      firstMissingEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    if (editCartId) {
      updateItem(editCartId, qty, selectedOptions)
      router.push('/cart')
    } else {
      addItem(menu.code, menu.name, menu.price, qty, selectedOptions, menu.imageUrl)
      router.push('/menu')
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* ── 헤더 ── */}
      <div className="fixed top-0 left-0 right-0 z-10 bg-white border-b border-[#F0F0F0]" style={{ maxWidth: '430px', margin: '0 auto', paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center px-4 py-4 relative">
          <button
            onClick={() => router.back()}
            className="text-xl text-[#1E1E1E] z-10"
          >
            ←
          </button>
          <span className="absolute inset-0 flex items-center justify-center text-[15px] font-bold text-[#1E1E1E] pointer-events-none">
            메뉴 선택
          </span>
        </div>
      </div>

      {/* ── 스크롤 영역 ── */}
      <div className="flex-1 pb-[100px] overflow-y-auto" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 57px)' }}>
        <div
          className="w-full bg-[#F5F5F5] overflow-hidden flex items-center justify-center"
          style={{ aspectRatio: '16/10' }}
        >
          {menu.imageUrl
            ? <img src={menu.imageUrl} alt={menu.name} className="w-full h-full object-cover" />
            : <span style={{ fontSize: '72px' }}>{menu.emoji}</span>
          }
        </div>

        <div className="px-5 pt-5 pb-4">
          <h1 className="text-[20px] font-[800] text-[#1E1E1E] mb-1">{menu.name}</h1>
          <p className="text-[13px] text-[#727272] leading-relaxed">{menu.desc}</p>
          <p className="text-[18px] font-bold text-[#1E1E1E] mt-3">{formatWon(menu.price)}</p>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-[#F0F0F0]">
          <span className="text-[16px] font-semibold text-[#1E1E1E]">{formatWon(menu.price)}</span>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setQty(q => Math.max(1, q - 1))}
              className="w-9 h-9 rounded-full border border-[#D7D7D7] flex items-center justify-center text-[18px] text-[#1E1E1E]"
              disabled={qty <= 1}
            >
              −
            </button>
            <span className="text-[16px] font-bold w-6 text-center">{qty}</span>
            <button
              onClick={() => setQty(q => q + 1)}
              className="w-9 h-9 rounded-full border border-[#D7D7D7] flex items-center justify-center text-[18px] text-[#1E1E1E]"
            >
              +
            </button>
          </div>
        </div>

        {menu.options.map((group, idx) => (
          <div
            key={idx}
            data-missing={missingGroups.includes(idx) ? 'true' : 'false'}
          >
            <OptionGroup
              group={group}
              groupIndex={idx}
              selectedIds={selectedMap[idx] ?? []}
              onToggle={handleToggle}
              isMissing={missingGroups.includes(idx)}
              basePrice={menu.price}
            />
          </div>
        ))}

        <div className="h-4" />
      </div>

      {/* ── 하단 고정 영역 ── */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-white px-5 py-4 z-10"
        style={{ maxWidth: '430px', margin: '0 auto', boxShadow: '0 -4px 20px rgba(0,0,0,0.08)' }}
      >
        {account && (
          <div className="flex items-center justify-between mb-3 text-[12px]">
            <span className="text-[#727272]">선결제 잔액</span>
            <span className={[
              'font-bold',
              account.balance < 0 ? 'text-[#C92A2A]' : account.balance < 30000 ? 'text-[#C92A2A]' : 'text-[#017333]',
            ].join(' ')}>
              {formatWon(account.balance)}
            </span>
          </div>
        )}

        <button
          onClick={handleAddToCart}
          className="w-full py-[17px] bg-[#1E1E1E] text-white rounded-xl text-base font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
        >
          <span>{editCartId ? '변경하기' : '담기'}</span>
          <span className="font-bold">{formatWon(subtotal)}</span>
        </button>
      </div>
    </div>
  )
}
