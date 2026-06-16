'use client'

import { formatWon } from '@/lib/utils'

interface CartSummaryProps {
  subtotal: number
  deliveryFee: number
  total: number
  currentBalance: number
}

export default function CartSummary({
  subtotal,
  deliveryFee,
  total,
  currentBalance,
}: CartSummaryProps) {
  const afterBalance = currentBalance - total
  const isNegative = afterBalance < 0

  return (
    <div className="bg-[#FAFAFA] rounded-xl p-4 mt-4">
      {/* 금액 내역 */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-[#727272]">
          <span>메뉴 소계</span>
          <span>{formatWon(subtotal)}</span>
        </div>
        {deliveryFee > 0 && (
          <div className="flex justify-between text-[#727272]">
            <span>배달료</span>
            <span>{formatWon(deliveryFee)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-[#1E1E1E] pt-2 border-t border-[#D7D7D7]">
          <span>총 금액</span>
          <span>{formatWon(total)}</span>
        </div>
      </div>

      {/* 잔액 정보 */}
      <div className="mt-4 pt-4 border-t border-[#D7D7D7] space-y-1.5 text-sm">
        <div className="flex justify-between text-[#727272]">
          <span>선결제 잔액</span>
          <span>{formatWon(currentBalance)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span className="text-[#727272]">주문 후 예상 잔액</span>
          <span className={isNegative ? 'text-[#C92A2A]' : 'text-[#017333]'}>
            {formatWon(afterBalance)}
          </span>
        </div>
      </div>

      {/* 잔액 부족 경고 */}
      {isNegative && (
        <div className="mt-3 px-3 py-2 bg-red-50 rounded-lg">
          <p className="text-xs text-[#C92A2A] font-semibold">
            ⚠️ 잔액이 부족합니다. 다음 충전 시 정산됩니다.
          </p>
        </div>
      )}
    </div>
  )
}
