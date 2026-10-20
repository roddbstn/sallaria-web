'use client'

import { formatWon } from '@/lib/utils'

// 장바구니 하단 요약.
//
// 전엔 네 줄(메뉴 소계 / 총 금액 / 선결제 잔액 / 주문 후 예상 잔액)에 굵은 구분선 두 개가
// 들어가서, 숫자보다 선이 먼저 보였다. 줄였다:
//   · 배달료가 없으면 '메뉴 소계'와 '총 금액'이 늘 같은 값이라 소계 줄을 숨긴다
//   · 구분선은 #D7D7D7(본문 테두리색) → #E6E6E6 한 겹만
// 이 화면에서 결국 보는 건 **주문 후 잔액 하나**다. 다만 색은 쓰지 않는다 —
// 초록은 '좋은 일'처럼 읽히는데 이건 줄어드는 숫자다. 모자랄 때만 빨강.

interface CartSummaryProps {
  subtotal: number
  deliveryFee: number
  total: number
  currentBalance: number
}

function Line({ label, value, strong, soft, tone }: {
  label: string
  value: string
  /** 총 금액 — 이 카드에서 가장 굵다 */
  strong?: boolean
  /** 주문 후 잔액 — 강조하되 총 금액보다 한 단계 얇게.
      둘이 같은 굵기면 "지금 내는 돈"과 "남는 돈"이 같은 무게로 읽힌다. */
  soft?:   boolean
  tone?: 'danger' | 'green'
}) {
  const big = strong || soft
  return (
    <div className="flex justify-between items-baseline">
      <span className={
        strong ? 'text-[14px] font-semibold text-[#1E1E1E]'
        : soft  ? 'text-[14px] font-medium text-[#1E1E1E]'
        :         'text-[13px] text-[#727272]'
      }>
        {label}
      </span>
      <span className={[
        'tabular-nums',
        strong ? 'text-[15px] font-bold' : soft ? 'text-[15px] font-semibold' : 'text-[13px]',
        tone === 'danger' ? 'text-[#C92A2A]' : tone === 'green' ? 'text-[#017333]' : big ? 'text-[#1E1E1E]' : 'text-[#727272]',
      ].join(' ')}>
        {value}
      </span>
    </div>
  )
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
    <div className="bg-[#F5F5F5] rounded-xl p-4 mt-4 space-y-2">
      {/* 배달료가 붙을 때만 소계를 따로 보여준다 — 아니면 총 금액과 같은 숫자다 */}
      {deliveryFee > 0 && (
        <>
          <Line label="메뉴 소계" value={formatWon(subtotal)} />
          <Line label="배달료" value={formatWon(deliveryFee)} />
        </>
      )}
      <Line label="총 금액" value={formatWon(total)} strong />

      <div className="pt-2.5 mt-2.5 border-t border-[#E6E6E6] space-y-2">
        <Line label="선결제 잔액" value={formatWon(currentBalance)} />
        <Line
          label="주문 후 잔액"
          value={formatWon(afterBalance)}
          soft
          tone={isNegative ? 'danger' : undefined}
        />
      </div>

      {isNegative && (
        <p className="text-[12px] text-[#017333] bg-[#E6F4EC] rounded-lg px-3 py-2 !mt-3">
          다음 번엔 잔액을 충전해 주세요
        </p>
      )}
    </div>
  )
}
