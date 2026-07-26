'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useCartStore } from '@/lib/store/cart'
import { useSessionStore } from '@/lib/store/session'
import CartItemComponent from '@/components/cart/CartItem'
import CartSummary from '@/components/cart/CartSummary'
import { formatWon } from '@/lib/utils'
import { track } from '@/lib/firebase'

export default function CartPage() {
  const router = useRouter()
  const {
    items,
    removeItem,
    updateItem,
    totalSubtotal,
    deliveryFee,
    totalAmount,
  } = useCartStore()
  const { account } = useSessionStore()

  const isEmpty = items.length === 0
  const currentBalance = account?.balance ?? 0

  // 장바구니 진입 트래킹
  useEffect(() => {
    track('cart_view', { item_count: items.length })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isDisabled = isEmpty

  function handleConfirm() {
    if (isDisabled) return
    track('cart_to_checkout', { item_count: items.length, total: totalAmount() })
    router.push('/checkout')
  }

  function handleQtyChange(cartId: string, qty: number) {
    const item = items.find((i) => i.cartId === cartId)
    if (!item) return
    const prev = item.qty
    track('cart_item_qty_change', { menu_name: item.menuName, direction: qty > prev ? 'up' : 'down', new_qty: qty })
    updateItem(cartId, qty, item.selectedOptions)
  }

  function handleRemove(cartId: string) {
    const item = items.find((i) => i.cartId === cartId)
    if (item) track('cart_item_remove', { menu_name: item.menuName })
    removeItem(cartId)
  }

  function handleEditOption(cartId: string) {
    const item = items.find((i) => i.cartId === cartId)
    if (!item) return
    track('cart_edit_option', { menu_name: item.menuName })
    router.push(`/menu?item=${item.menuCode}&edit=${cartId}`)
  }

  const subtotal = totalSubtotal()
  const fee = deliveryFee()
  const total = totalAmount()

  return (
    <div className="screen">
      {/* Header */}
      <header className="flex items-center h-14 px-5 border-b border-[#D7D7D7] flex-shrink-0">
        <button
          onClick={() => router.back()}
          className="-ml-3 p-3 rounded-full hover:bg-[#F5F5F5] transition-colors"
          aria-label="뒤로가기"
        >
          <svg width="9" height="15" viewBox="0 0 9 15" fill="none"><path d="M8 1L1 7.5L8 14" stroke="#1E1E1E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h1 className="flex-1 text-center text-base font-bold text-[#1E1E1E] pr-9">
          장바구니
        </h1>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full py-20 text-[#727272]">
            <p className="text-4xl mb-3">🛒</p>
            <p className="text-sm">장바구니가 비어있어요.</p>
            <button
              onClick={() => { track('cart_empty_go_menu'); router.push('/menu') }}
              className="mt-5 px-6 py-3 bg-[#017333] text-white text-sm font-bold rounded-xl active:opacity-80 transition-opacity"
            >
              메뉴 보러가기
            </button>
          </div>
        ) : (
          <>
            {/* 장바구니 아이템 목록 */}
            <div className="mt-2">
              {items.map((item, index) => (
                <CartItemComponent
                  key={item.cartId}
                  item={item}
                  index={index}
                  onQtyChange={handleQtyChange}
                  onRemove={handleRemove}
                  onEditOption={handleEditOption}
                />
              ))}
            </div>

            {/* 주문 요약 */}
            <CartSummary
              subtotal={subtotal}
              deliveryFee={fee}
              total={total}
              currentBalance={currentBalance}
            />

            {/* 잔액 음수 안내 */}
            {currentBalance - total < 0 && (
              <p className="mt-2 text-xs text-[#C92A2A] font-semibold text-center">
                잔액이 부족하지만 주문은 가능합니다. 다음 충전 시 정산됩니다.
              </p>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <footer className="flex-shrink-0 px-4 py-4 border-t border-[#D7D7D7] bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        {account && (
          <div className="flex items-center justify-between mb-3 text-sm">
            <span className="font-semibold text-[#1E1E1E]">{account.name}</span>
            <span
              className={`font-semibold ${currentBalance < 0 ? 'text-[#C92A2A]' : 'text-[#017333]'}`}
            >
              잔액 {formatWon(currentBalance)}
            </span>
          </div>
        )}
        <button
          onClick={handleConfirm}
          disabled={isDisabled}
          className={`w-full py-4 rounded-xl font-bold text-white text-base transition-colors ${
            isDisabled ? 'bg-[#CCC] cursor-not-allowed' : 'bg-[#1E1E1E] active:scale-95'
          }`}
        >
          확인
        </button>
      </footer>
    </div>
  )
}
