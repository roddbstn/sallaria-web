'use client'

import { useRouter } from 'next/navigation'
import { useCartStore } from '@/lib/store/cart'
import { useSessionStore } from '@/lib/store/session'
import CartItemComponent from '@/components/cart/CartItem'
import CartSummary from '@/components/cart/CartSummary'
import { formatWon } from '@/lib/utils'

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

  // 확인 버튼 disabled 조건: 빈 장바구니
  // 잔액 음수는 허용 (경고만)
  const isDisabled = isEmpty

  function handleConfirm() {
    if (isDisabled) return
    router.push('/checkout')
  }

  function handleQtyChange(cartId: string, qty: number) {
    const item = items.find((i) => i.cartId === cartId)
    if (!item) return
    updateItem(cartId, qty, item.selectedOptions)
  }

  function handleEditOption(cartId: string) {
    const item = items.find((i) => i.cartId === cartId)
    if (!item) return
    router.push(`/menu?item=${item.menuCode}&edit=${cartId}`)
  }

  const subtotal = totalSubtotal()
  const fee = deliveryFee()
  const total = totalAmount()

  return (
    <div className="screen">
      {/* Header */}
      <header className="flex items-center h-14 px-4 border-b border-[#D7D7D7] flex-shrink-0">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F5F5F5] transition-colors text-xl"
          aria-label="뒤로가기"
        >
          ←
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
              onClick={() => router.push('/menu')}
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
                  onRemove={removeItem}
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
