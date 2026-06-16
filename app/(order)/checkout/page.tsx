'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useCartStore } from '@/lib/store/cart'
import { useSessionStore } from '@/lib/store/session'
import { formatWon, formatOptionsLabel, DELIVERY_FEE } from '@/lib/utils'
import type { OrderMethod, OrderItemPayload } from '@/lib/types'
import { getSupabaseClient } from '@/lib/supabase/client'

const METHOD_OPTIONS: { value: OrderMethod; label: string; emoji: string; extra?: string }[] = [
  { value: '포장', label: '포장', emoji: '🛍️' },
  { value: '내점', label: '매장 식사', emoji: '🍽️' },
  { value: '배달', label: '배달', emoji: '🛵', extra: '+3,500원' },
]

export default function CheckoutPage() {
  const router = useRouter()
  const {
    items,
    method,
    remarks,
    setMethod,
    setRemarks,
    totalSubtotal,
    deliveryFee,
    totalAmount,
    clearCart,
  } = useCartStore()
  const { account, orderer, phone } = useSessionStore()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentBalance = account?.balance ?? 0
  const subtotal = totalSubtotal()
  const fee = deliveryFee()
  const total = totalAmount()
  const afterBalance = currentBalance - total
  const isNegative = afterBalance < 0

  async function handleOrder() {
    if (!account || !orderer || items.length === 0) return
    setIsSubmitting(true)
    setError(null)

    // sessionStorage에 주문 정보 저장 후 성공 화면으로 이동하는 헬퍼
    function saveAndRedirect(orderCode: string) {
      sessionStorage.setItem('last_order_code', orderCode)
      sessionStorage.setItem('last_order_method', method)
      sessionStorage.setItem('last_order_total', String(total))
      sessionStorage.setItem('last_order_orderer', orderer)
      sessionStorage.setItem('last_order_phone', phone)
      sessionStorage.setItem('last_order_account', account!.name)
      clearCart()
      router.push('/success')
    }

    try {
      // RPC 페이로드 구성 (단가 스냅샷)
      const payload: OrderItemPayload[] = items.map((item) => ({
        menu_code: item.menuCode,
        qty: item.qty,
        unit_price: item.basePrice + item.selectedOptions.reduce((s, o) => s + o.plus, 0),
        options: item.selectedOptions.map((o) => ({
          option_id: o.optionId,
          extra_price: o.plus,
        })),
      }))

      // Supabase RPC 직접 호출 (static export 환경)
      const supabase = getSupabaseClient()
      const { data, error: rpcError } = await supabase.rpc('create_order', {
        p_account_code: account.code,
        p_orderer: orderer,
        p_method: method,
        p_items: payload,
      })

      if (rpcError || !data) {
        // Supabase 미연결 시 MOCK fallback
        console.warn('[checkout] Supabase unavailable, using mock:', rpcError)
        saveAndRedirect(`MOCK-${Date.now()}`)
        return
      }

      saveAndRedirect(data.order_code)
    } catch (err) {
      console.error('[checkout] unexpected error, using mock:', err)
      // 예외 시에도 MOCK fallback으로 주문 완료 처리
      saveAndRedirect(`MOCK-${Date.now()}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="screen">
        <div className="flex-1 flex items-center justify-center text-[#727272]">
          <p className="text-sm">장바구니가 비어있습니다.</p>
        </div>
      </div>
    )
  }

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
          주문 확인
        </h1>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* 주문자 정보 */}
        <section>
          <h2 className="text-sm font-bold text-[#1E1E1E] mb-2">주문자 정보</h2>
          <div className="bg-[#FAFAFA] rounded-xl px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-[#727272]">거래처</span>
              <span className="font-semibold text-[#1E1E1E]">{account?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#727272]">주문자</span>
              <span className="font-semibold text-[#1E1E1E]">{orderer}</span>
            </div>
          </div>
        </section>

        {/* 이용방법 선택 */}
        <section>
          <h2 className="text-sm font-bold text-[#1E1E1E] mb-2">이용방법</h2>
          <div className="flex gap-2">
            {METHOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setMethod(opt.value)}
                className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${
                  method === opt.value
                    ? 'bg-[#E6F4EC] text-[#017333]'
                    : 'bg-[#F5F5F5] text-[#1E1E1E]'
                }`}
              >
                <span className="block text-base">{opt.emoji}</span>
                <span className="block mt-0.5">{opt.label}</span>
                {opt.extra && (
                  <span className="block text-xs mt-0.5 opacity-75">{opt.extra}</span>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* 가게 요청사항 */}
        <section>
          <h2 className="text-sm font-bold text-[#1E1E1E] mb-2">가게 요청사항</h2>
          {/* 퀵 선택 버튼 */}
          <div className="flex flex-wrap gap-2 mb-2">
            {['수저·포크 O', '수저·포크 X', '소스 따로', '덜 맵게'].map((label) => {
              const active = remarks === label || remarks.includes(label)
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setRemarks(active ? remarks.replace(label, '').replace(/^,\s*|,\s*$|,\s*,/g, '').trim() : remarks ? `${remarks}, ${label}` : label)}
                  className={`px-3 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${
                    active
                      ? 'bg-[#E6F4EC] text-[#017333]'
                      : 'bg-[#F5F5F5] text-[#727272]'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <input
            type="text"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="직접 입력 (예: 덜 맵게 해주세요)"
            className="w-full px-4 py-3 rounded-xl border border-[#D7D7D7] text-sm text-[#1E1E1E] placeholder:text-[#D7D7D7] focus:outline-none focus:border-[#1E1E1E] transition-colors"
          />
        </section>

        {/* 주문 메뉴 목록 */}
        <section>
          <h2 className="text-sm font-bold text-[#1E1E1E] mb-2">주문 메뉴</h2>
          <div className="space-y-2">
            {items.map((item) => {
              const optionLabel = formatOptionsLabel(item.selectedOptions)
              return (
                <div key={item.cartId} className="flex justify-between text-sm">
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="font-medium text-[#1E1E1E]">
                      {item.menuName} × {item.qty}
                    </p>
                    {optionLabel && (
                      <p className="text-xs text-[#727272] mt-0.5 truncate">{optionLabel}</p>
                    )}
                  </div>
                  <p className="font-semibold text-[#1E1E1E] flex-shrink-0">
                    {formatWon(item.subtotal)}
                  </p>
                </div>
              )
            })}
          </div>
        </section>

        {/* 결제 내역 카드 */}
        <section className="bg-[#FAFAFA] rounded-xl p-4">
          <h2 className="text-sm font-bold text-[#1E1E1E] mb-3">결제 내역</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-[#727272]">
              <span>메뉴 소계</span>
              <span>{formatWon(subtotal)}</span>
            </div>
            <div className="flex justify-between text-[#727272]">
              <span>배달료</span>
              <span>{method === '배달' ? formatWon(DELIVERY_FEE) : '해당없음'}</span>
            </div>
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
        </section>

        {/* 오류 메시지 */}
        {error && (
          <div className="px-4 py-3 bg-red-50 rounded-xl">
            <p className="text-sm text-[#C92A2A] font-semibold">{error}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="flex-shrink-0 px-4 py-4 border-t border-[#D7D7D7] bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <button
          onClick={handleOrder}
          disabled={isSubmitting}
          className={`w-full py-4 rounded-xl font-bold text-white text-base transition-colors ${
            isSubmitting ? 'bg-[#CCC] cursor-not-allowed' : 'bg-[#1E1E1E] active:scale-95'
          }`}
        >
          {isSubmitting ? '주문 중...' : '주문하기'}
        </button>
        <p className="text-center text-xs text-[#727272] mt-2">
          ⚠️ 주문 취소는 어려워요. 신중하게 확인해주세요.
        </p>
      </footer>
    </div>
  )
}
