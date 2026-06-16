'use client'

import type { CartItem } from '@/lib/types'
import { formatWon, formatOptionsLabel } from '@/lib/utils'

interface CartItemProps {
  item: CartItem
  index: number
  onQtyChange: (cartId: string, qty: number) => void
  onRemove: (cartId: string) => void
  onEditOption: (cartId: string) => void
}

export default function CartItemComponent({
  item,
  index: _index,
  onQtyChange,
  onRemove,
  onEditOption,
}: CartItemProps) {
  const optionLabel = formatOptionsLabel(item.selectedOptions)

  return (
    <div className="flex gap-3 py-3 border-b border-[#F0F0F0]">
      {/* 이모지 썸네일 */}
      <div className="w-11 h-11 rounded-xl bg-[#F5F5F5] flex items-center justify-center text-2xl flex-shrink-0">
        🍽️
      </div>

      {/* 메뉴 정보 */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#1E1E1E] truncate">{item.menuName}</p>
        {optionLabel && (
          <p className="text-xs text-[#727272] mt-0.5 truncate">{optionLabel}</p>
        )}

        {/* 수량 조절 */}
        <div className="flex items-center gap-2 mt-2">
          {/* 수량 1이면 쓰레기통, 그 이상이면 − */}
          {item.qty === 1 ? (
            <button
              onClick={() => onRemove(item.cartId)}
              className="w-7 h-7 rounded-full bg-[#F5F5F5] flex items-center justify-center text-sm text-[#727272] hover:bg-[#eee] transition-colors"
              aria-label="삭제"
            >
              🗑️
            </button>
          ) : (
            <button
              onClick={() => onQtyChange(item.cartId, item.qty - 1)}
              className="w-7 h-7 rounded-full bg-[#F5F5F5] flex items-center justify-center text-sm font-bold text-[#1E1E1E] hover:bg-[#eee] transition-colors"
              aria-label="수량 감소"
            >
              −
            </button>
          )}

          <span className="text-sm font-semibold text-[#1E1E1E] w-5 text-center">
            {item.qty}
          </span>

          <button
            onClick={() => onQtyChange(item.cartId, item.qty + 1)}
            className="w-7 h-7 rounded-full bg-[#F5F5F5] flex items-center justify-center text-sm font-bold text-[#1E1E1E] hover:bg-[#eee] transition-colors"
            aria-label="수량 증가"
          >
            +
          </button>

          <button
            onClick={() => onEditOption(item.cartId)}
            className="ml-1 text-xs text-[#727272] underline underline-offset-2"
          >
            옵션 변경
          </button>
        </div>
      </div>

      {/* 가격 */}
      <div className="flex-shrink-0 text-sm font-bold text-[#1E1E1E] self-start pt-0.5">
        {formatWon(item.subtotal)}
      </div>
    </div>
  )
}
