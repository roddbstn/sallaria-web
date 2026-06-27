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
    <div className="pt-5 pb-4 border-b border-[#F0F0F0]">

      {/* 상단: 메뉴명(왼쪽) + 사진·가격(오른쪽) */}
      <div className="flex items-start justify-between gap-3 mb-4">

        {/* 왼쪽: 메뉴명 + 옵션 */}
        <div className="flex-1 min-w-0 pt-1">
          <p className="text-[15px] font-semibold text-[#1E1E1E] leading-snug">{item.menuName}</p>
          {optionLabel && (
            <p className="text-xs text-[#727272] mt-1 leading-relaxed">{optionLabel}</p>
          )}
        </div>

        {/* 오른쪽: 사진 + 가격 */}
        <div className="flex flex-col items-center flex-shrink-0">
          <div className="w-[64px] h-[64px] rounded-xl bg-[#F5F5F5] overflow-hidden flex items-center justify-center text-2xl">
            {item.imageUrl
              ? <img src={item.imageUrl} alt={item.menuName} className="w-full h-full object-cover" />
              : '🍽️'
            }
          </div>
          <p className="text-[15px] font-bold text-[#1E1E1E] mt-2">
            {formatWon(item.subtotal)}
          </p>
        </div>
      </div>

      {/* 하단: 수량 조절 + 옵션 변경 */}
      <div className="flex items-center gap-2">
        {item.qty === 1 ? (
          <button
            onClick={() => onRemove(item.cartId)}
            className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center text-sm text-[#727272] hover:bg-[#eee] transition-colors"
            aria-label="삭제"
          >
            🗑️
          </button>
        ) : (
          <button
            onClick={() => onQtyChange(item.cartId, item.qty - 1)}
            className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center text-sm font-bold text-[#1E1E1E] hover:bg-[#eee] transition-colors"
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
          className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center text-sm font-bold text-[#1E1E1E] hover:bg-[#eee] transition-colors"
          aria-label="수량 증가"
        >
          +
        </button>

        <button
          onClick={() => onEditOption(item.cartId)}
          className="ml-1 text-xs text-[#727272] bg-[#F5F5F5] px-3 py-1.5 rounded-lg hover:bg-[#eee] transition-colors"
        >
          옵션 변경
        </button>
      </div>
    </div>
  )
}
