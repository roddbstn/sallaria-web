'use client'

import type { CartItem } from '@/lib/types'
import { formatWon, formatOptionsLabel } from '@/lib/utils'

// 장바구니 한 줄.
//
// 전엔 [메뉴명 | 사진+가격] 한 덩어리 + [수량·옵션] 한 덩어리로 위아래 두 블록이었다.
// 한 줄이 세로로 길어서 두 개만 담아도 요약이 화면 밖으로 밀렸다.
// 사진을 왼쪽으로 보내고 오른쪽에 이름·옵션·조작을 쌓으면 같은 정보가 한 블록에 들어간다.
//
// 이모지(🍽️·🗑️)도 뺐다. 다른 화면 어디에도 이모지가 없어서 여기만 장난스럽게 보였다.

interface CartItemProps {
  item: CartItem
  index: number
  onQtyChange: (cartId: string, qty: number) => void
  onRemove: (cartId: string) => void
  onEditOption: (cartId: string) => void
}

/** 원형이 아니라 한 덩어리 스테퍼 — 버튼 세 개가 따로 떠 있으면 묶음으로 안 읽힌다 */
function StepperButton({ label, onClick, ariaLabel }: {
  label: React.ReactNode
  onClick: () => void
  ariaLabel: string
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className="w-8 h-8 flex items-center justify-center text-[15px] text-[#1E1E1E] active:bg-[#EDEDED] transition-colors"
    >
      {label}
    </button>
  )
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
    <div className="flex gap-3 py-4 border-b border-[#EDEDED] last:border-b-0">
      <div className="w-[64px] h-[64px] flex-shrink-0 rounded-xl bg-[#F5F5F5] overflow-hidden">
        {item.imageUrl && (
          <img src={item.imageUrl} alt={item.menuName} className="w-full h-full object-cover" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[15px] font-semibold text-[#1E1E1E] leading-snug min-w-0">{item.menuName}</p>
          <p className="text-[15px] font-semibold text-[#1E1E1E] flex-shrink-0 tabular-nums">
            {formatWon(item.subtotal)}
          </p>
        </div>

        {optionLabel && (
          <p className="text-[12px] text-[#727272] mt-1 leading-relaxed line-clamp-2">{optionLabel}</p>
        )}

        <div className="flex items-center justify-between gap-2 mt-2.5">
          <div className="flex items-center rounded-lg bg-[#F5F5F5] overflow-hidden">
            {item.qty === 1 ? (
              <StepperButton
                ariaLabel="삭제"
                onClick={() => onRemove(item.cartId)}
                label={
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M2.5 4.5h11M6 4.5V3a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v1.5M4 4.5l.6 8a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-8"
                          stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                }
              />
            ) : (
              <StepperButton ariaLabel="수량 감소" label="−" onClick={() => onQtyChange(item.cartId, item.qty - 1)} />
            )}
            <span className="w-7 text-center text-[14px] font-semibold text-[#1E1E1E] tabular-nums">
              {item.qty}
            </span>
            <StepperButton ariaLabel="수량 증가" label="+" onClick={() => onQtyChange(item.cartId, item.qty + 1)} />
          </div>

          <button
            onClick={() => onEditOption(item.cartId)}
            className="px-2.5 py-1 rounded-lg bg-[#EDEDED] text-[12px] text-[#222222] active:bg-[#E0E0E0] transition-colors"
          >
            옵션 변경
          </button>
        </div>
      </div>
    </div>
  )
}
