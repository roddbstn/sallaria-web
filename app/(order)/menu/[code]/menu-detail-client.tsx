'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionStore } from '@/lib/store/session'
import { useCartStore } from '@/lib/store/cart'
import { MENUS } from '@/lib/mock-data'
import { formatWon, calcSubtotal } from '@/lib/utils'
import type { SelectedOption } from '@/lib/types'
import OptionGroup from '@/components/menu/option-group'

export default function MenuDetailClient({ code }: { code: string }) {
  const router = useRouter()

  const account = useSessionStore(s => s.account)
  const addItem = useCartStore(s => s.addItem)

  const [selectedMap, setSelectedMap] = useState<Record<number, string[]>>({})
  const [qty, setQty] = useState(1)
  const [missingGroups, setMissingGroups] = useState<number[]>([])

  const menu = MENUS.find(m => m.code === code)

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

  if (!menu) {
    if (typeof window !== 'undefined') router.replace('/menu')
    return null
  }

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

    addItem(menu.code, menu.name, menu.price, qty, selectedOptions)
    router.push('/menu')
  }

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* ── 헤더 ── */}
      <div className="fixed top-0 left-0 right-0 z-10 bg-white border-b border-[#F0F0F0]" style={{ maxWidth: '430px', margin: '0 auto', paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center px-4 py-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 text-[14px] font-semibold text-[#1E1E1E]"
          >
            <span className="text-xl">←</span>
            <span>메뉴 선택</span>
          </button>
        </div>
      </div>

      {/* ── 스크롤 영역 ── */}
      <div className="flex-1 pb-[100px] overflow-y-auto" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 57px)' }}>
        <div
          className="w-full bg-[#F5F5F5] flex items-center justify-center"
          style={{ aspectRatio: '16/10' }}
        >
          <span style={{ fontSize: '72px' }}>{menu.emoji}</span>
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
            <span className="text-[#727272]">결제 후 잔액</span>
            <span className={[
              'font-bold',
              afterBalance < 0 ? 'text-[#C92A2A]' : afterBalance < 30000 ? 'text-[#C92A2A]' : 'text-[#017333]',
            ].join(' ')}>
              {afterBalance < 0
                ? `−${formatWon(Math.abs(afterBalance))} (다음 충전 시 정산)`
                : formatWon(afterBalance)}
            </span>
          </div>
        )}

        <button
          onClick={handleAddToCart}
          className="w-full py-[17px] bg-[#1E1E1E] text-white rounded-xl text-base font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
        >
          <span>담기</span>
          <span className="font-bold">{formatWon(subtotal)}</span>
        </button>
      </div>
    </div>
  )
}
