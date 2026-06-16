'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCartStore } from '@/lib/store/cart'
import { useSessionStore } from '@/lib/store/session'
import { getSupabaseClient } from '@/lib/supabase/client'
import { formatWon } from '@/lib/utils'

type OrderResultStatus = 'pending' | 'accepted' | 'rejected'

export default function SuccessPage() {
  const router = useRouter()
  const { clearCart } = useCartStore()
  const { account } = useSessionStore()

  const [status, setStatus] = useState<OrderResultStatus>('pending')
  const [orderCode, setOrderCode] = useState<string | null>(null)
  const [orderMethod, setOrderMethod] = useState<string>('')
  const [orderTotal, setOrderTotal] = useState<number>(0)
  const [orderOrderer, setOrderOrderer] = useState<string>('')
  const [orderPhone, setOrderPhone] = useState<string>('')
  const [orderAccount, setOrderAccount] = useState<string>('')
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(null)
  const [rejectedReason, setRejectedReason] = useState<string>('')
  const [showReviewSheet, setShowReviewSheet] = useState(false)

  const channelRef = useRef<ReturnType<typeof getSupabaseClient>['channel'] extends (...args: infer A) => infer R ? R : never | null>(null)

  useEffect(() => {
    // sessionStorage에서 주문 정보 읽기
    const code = sessionStorage.getItem('last_order_code')
    const method = sessionStorage.getItem('last_order_method') ?? ''
    const total = Number(sessionStorage.getItem('last_order_total') ?? '0')
    const orderer = sessionStorage.getItem('last_order_orderer') ?? ''
    const phone = sessionStorage.getItem('last_order_phone') ?? ''
    const acct = sessionStorage.getItem('last_order_account') ?? ''

    if (!code) {
      // 주문 코드 없으면 홈으로 리다이렉트
      router.replace('/')
      return
    }

    setOrderCode(code)
    setOrderMethod(method)
    setOrderTotal(total)
    setOrderOrderer(orderer)
    setOrderPhone(phone)
    setOrderAccount(acct)

    // Fallback mock 주문(MOCK-)은 바로 accepted로 처리
    if (code.startsWith('MOCK-')) {
      setStatus('accepted')
      setEstimatedMinutes(10)
      return
    }

    // Supabase Realtime 구독
    try {
      const supabase = getSupabaseClient()
      const channel = supabase
        .channel(`orders:order_code=${code}`)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .on('broadcast', { event: 'ORDER_ACCEPTED' }, ({ payload }: { payload: any }) => {
          setStatus('accepted')
          setEstimatedMinutes(payload?.estimated_minutes ?? null)
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .on('broadcast', { event: 'ORDER_REJECTED' }, ({ payload }: { payload: any }) => {
          setStatus('rejected')
          setRejectedReason(payload?.reason ?? '점주가 주문을 거부했습니다.')
        })
        .subscribe()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      channelRef.current = channel as any
    } catch (err) {
      console.error('[success] Realtime 연결 오류:', err)
      // Realtime 미연결 시 10초 후 accepted 처리 (fallback)
      setTimeout(() => {
        setStatus('accepted')
        setEstimatedMinutes(10)
      }, 10_000)
    }

    return () => {
      try {
        const supabase = getSupabaseClient()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (channelRef.current) supabase.removeChannel(channelRef.current as any)
      } catch {
        // ignore
      }
    }
  }, [router])

  // accepted 후 5초 뒤 네이버 리뷰 바텀시트 표시
  useEffect(() => {
    if (status !== 'accepted') return
    const timer = setTimeout(() => setShowReviewSheet(true), 5000)
    return () => clearTimeout(timer)
  }, [status])

  function handleRetryOrder() {
    // 거부 시: 세션 유지, 장바구니 clear, /menu로 이동
    clearCart()
    router.push('/menu')
  }

  // ── Pending 상태 ──
  if (status === 'pending') {
    return (
      <div className="screen">
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
          {/* 스피너 */}
          <div className="w-16 h-16 rounded-full border-4 border-[#D7D7D7] border-t-[#017333] animate-spin" />
          <p className="text-base font-semibold text-[#1E1E1E]">주문을 접수 중이에요...</p>
          <p className="text-sm text-[#727272] text-center">
            점주 확인 후 조리가 시작됩니다.
            <br />
            잠시만 기다려주세요.
          </p>
        </div>
      </div>
    )
  }

  // ── Rejected 상태 ──
  if (status === 'rejected') {
    return (
      <div className="screen">
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
          {/* X 마크 */}
          <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center">
            <span className="text-4xl text-[#C92A2A]">✕</span>
          </div>
          <p className="text-lg font-bold text-[#1E1E1E]">주문이 거부되었어요</p>
          {rejectedReason && (
            <div className="w-full px-4 py-3 bg-red-50 rounded-xl">
              <p className="text-sm text-[#C92A2A] text-center">{rejectedReason}</p>
            </div>
          )}
          <p className="text-sm text-[#727272] text-center">
            죄송합니다. 다시 주문해주세요.
          </p>
        </div>

        <footer className="flex-shrink-0 px-4 py-6">
          <button
            onClick={handleRetryOrder}
            className="w-full py-4 rounded-xl font-bold text-white bg-[#1E1E1E] text-base active:scale-95 transition-colors"
          >
            다시 주문하기
          </button>
        </footer>
      </div>
    )
  }

  // ── Accepted 상태 ──
  return (
    <div className="screen">
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* 체크마크 */}
        <div className="flex flex-col items-center pt-10 pb-6">
          <div className="w-20 h-20 rounded-full bg-[#E6F4EC] flex items-center justify-center mb-4">
            <span className="text-4xl text-[#017333]">✓</span>
          </div>
          <p className="text-xl font-bold text-[#1E1E1E]">주문이 접수됐어요!</p>
          {estimatedMinutes !== null && (
            <p className="text-sm text-[#727272] mt-1">
              예상 소요시간: 약 <strong className="text-[#1E1E1E]">{estimatedMinutes}분</strong>
            </p>
          )}
        </div>

        {/* 주문 상세 정보 */}
        <div className="bg-[#FAFAFA] rounded-xl p-4 space-y-2 text-sm">
          {orderCode && (
            <div className="flex justify-between">
              <span className="text-[#727272]">주문번호</span>
              <span className="font-mono font-semibold text-[#1E1E1E] text-xs">{orderCode}</span>
            </div>
          )}
          {orderAccount && (
            <div className="flex justify-between">
              <span className="text-[#727272]">거래처</span>
              <span className="font-semibold text-[#1E1E1E]">{orderAccount}</span>
            </div>
          )}
          {orderOrderer && (
            <div className="flex justify-between">
              <span className="text-[#727272]">주문자</span>
              <span className="font-semibold text-[#1E1E1E]">{orderOrderer}</span>
            </div>
          )}
          {orderPhone && (
            <div className="flex justify-between">
              <span className="text-[#727272]">연락처</span>
              <span className="font-semibold text-[#1E1E1E]">{orderPhone}</span>
            </div>
          )}
          {orderMethod && (
            <div className="flex justify-between">
              <span className="text-[#727272]">이용방법</span>
              <span className="font-semibold text-[#1E1E1E]">{orderMethod}</span>
            </div>
          )}
          {orderTotal > 0 && (
            <div className="flex justify-between pt-2 border-t border-[#D7D7D7]">
              <span className="text-[#727272] font-semibold">결제 금액</span>
              <span className="font-bold text-[#1E1E1E]">{formatWon(orderTotal)}</span>
            </div>
          )}
        </div>

        {/* 잔액 안내 */}
        {account && (
          <div className="mt-3 px-4 py-3 bg-[#E6F4EC] rounded-xl">
            <p className="text-xs text-[#017333] font-semibold text-center">
              선결제 잔액에서 차감되었습니다
            </p>
          </div>
        )}

        {/* 네이버 리뷰 유도 */}
        {showReviewSheet && (
          <div className="mt-4 px-4 py-4 bg-[#FAFAFA] rounded-xl border border-[#D7D7D7]">
            <p className="text-sm font-bold text-[#1E1E1E] mb-1">맛있게 드셨나요? 🙏</p>
            <p className="text-xs text-[#727272] mb-3">
              리뷰 한 줄이 샐러리아에 큰 힘이 됩니다.
            </p>
            <a
              href="https://naver.me/sallaria"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-2.5 rounded-xl bg-[#03C75A] text-white text-sm font-bold text-center"
            >
              네이버 리뷰 남기기
            </a>
            <button
              onClick={() => setShowReviewSheet(false)}
              className="w-full text-xs text-[#727272] mt-2 py-1"
            >
              괜찮아요
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="flex-shrink-0 px-4 py-4 border-t border-[#D7D7D7] bg-white">
        <button
          onClick={() => router.push('/menu')}
          className="w-full py-4 rounded-xl font-bold text-white bg-[#1E1E1E] text-base active:scale-95 transition-colors"
        >
          메뉴로 돌아가기
        </button>
        <button
          onClick={() => router.push('/')}
          className="w-full text-sm text-[#727272] mt-2 py-2"
        >
          처음으로
        </button>
      </footer>
    </div>
  )
}
