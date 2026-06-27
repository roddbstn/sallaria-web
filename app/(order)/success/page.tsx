'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionStore } from '@/lib/store/session'
import { getSupabaseClient } from '@/lib/supabase/client'
import { formatWon } from '@/lib/utils'
import type { CartItem } from '@/lib/types'

type OrderResultStatus = 'pending' | 'accepted' | 'rejected'

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

export default function SuccessPage() {
  const router = useRouter()
  const { account } = useSessionStore()

  const [status,           setStatus]           = useState<OrderResultStatus>('pending')
  const [orderCode,        setOrderCode]         = useState<string | null>(null)
  const [orderNumber,      setOrderNumber]       = useState<string | null>(null)
  const [orderMethod,      setOrderMethod]       = useState<string>('')
  const [orderTotal,       setOrderTotal]        = useState<number>(0)
  const [orderOrderer,     setOrderOrderer]      = useState<string>('')
  const [orderPhone,       setOrderPhone]        = useState<string>('')
  const [orderAccount,     setOrderAccount]      = useState<string>('')
  const [rejectedReason,   setRejectedReason]    = useState<string>('')
  const [showReview,       setShowReview]        = useState(false)

  // 타이머
  const [totalSeconds,  setTotalSeconds]  = useState<number | null>(null)
  const [acceptedAt,    setAcceptedAt]    = useState<number | null>(null)
  const [secondsLeft,   setSecondsLeft]   = useState<number | null>(null)

  // 주문 아이템
  const [savedItems,   setSavedItems]   = useState<CartItem[]>([])
  const [menuImages,   setMenuImages]   = useState<Record<string, string>>({})

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null)

  // ── 주문 아이템 + 이미지 로드 ──────────────────────────────────────────
  useEffect(() => {
    const raw = sessionStorage.getItem('last_order_items')
    if (!raw) return
    const items: CartItem[] = JSON.parse(raw)
    setSavedItems(items)

    if (items.length === 0) return
    const supabase = getSupabaseClient()
    const ids = items.map(i => i.menuCode)
    supabase
      .from('menus')
      .select('id, image_url')
      .in('id', ids)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }: { data: any[] | null }) => {
        if (!data) return
        const map: Record<string, string> = {}
        data.forEach(m => { if (m.image_url) map[m.id] = m.image_url })
        setMenuImages(map)
      })
  }, [])

  // ── 세션 + Realtime ────────────────────────────────────────────────────
  useEffect(() => {
    const code    = sessionStorage.getItem('last_order_code')
    const num     = sessionStorage.getItem('last_order_number')
    const method  = sessionStorage.getItem('last_order_method') ?? ''
    const total   = Number(sessionStorage.getItem('last_order_total') ?? '0')
    const orderer = sessionStorage.getItem('last_order_orderer') ?? ''
    const phone   = sessionStorage.getItem('last_order_phone') ?? ''
    const acct    = sessionStorage.getItem('last_order_account') ?? ''

    if (!code) { router.replace('/'); return }

    setOrderCode(code)
    setOrderNumber(num)
    setOrderMethod(method)
    setOrderTotal(total)
    setOrderOrderer(orderer)
    setOrderPhone(phone)
    setOrderAccount(acct)

    if (code.startsWith('MOCK-')) {
      setStatus('accepted')
      setAcceptedAt(Date.now())
      setTotalSeconds(10 * 60)
      setSecondsLeft(10 * 60)
      return
    }

    try {
      const supabase = getSupabaseClient()
      const channel = supabase
        .channel(`orders:order_code=${code}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'orders', filter: `order_code=eq.${code}` },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (payload: any) => {
            const s = payload.new?.status
            if (s === '조리중' || s === '완료') {
              setStatus('accepted')
              setAcceptedAt(Date.now())
            } else if (s === '취소') {
              setStatus('rejected')
              setRejectedReason(payload.new?.note ?? '점주가 주문을 거부했습니다.')
            }
          }
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .on('broadcast', { event: 'ORDER_ACCEPTED' }, ({ payload }: { payload: any }) => {
          setStatus('accepted')
          setAcceptedAt(Date.now())
          const mins = payload?.estimated_minutes ?? null
          if (mins && mins > 0) {
            setTotalSeconds(mins * 60)
            setSecondsLeft(mins * 60)
          }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .on('broadcast', { event: 'ORDER_REJECTED' }, ({ payload }: { payload: any }) => {
          setStatus('rejected')
          setRejectedReason(payload?.reason ?? '점주가 주문을 거부했습니다.')
        })
        .subscribe()

      channelRef.current = channel
    } catch (err) {
      console.error('[success] Realtime 연결 오류:', err)
      setTimeout(() => {
        setStatus('accepted')
        setAcceptedAt(Date.now())
      }, 10_000)
    }

    return () => {
      try {
        const supabase = getSupabaseClient()
        if (channelRef.current) supabase.removeChannel(channelRef.current)
      } catch { /* ignore */ }
    }
  }, [router])

  // ── 타이머 카운트다운 ──────────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'accepted' || totalSeconds === null || acceptedAt === null) return
    const tick = () => {
      const elapsed = Math.floor((Date.now() - acceptedAt) / 1000)
      setSecondsLeft(Math.max(0, totalSeconds - elapsed))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [status, totalSeconds, acceptedAt])

  // ── 5초 후 리뷰 바 표시 ───────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'accepted') return
    const t = setTimeout(() => setShowReview(true), 5000)
    return () => clearTimeout(t)
  }, [status])

  // ── Pending ───────────────────────────────────────────────────────────
  if (status === 'pending') {
    return (
      <div className="screen">
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
          <div className="w-16 h-16 rounded-full border-4 border-[#D7D7D7] border-t-[#017333] animate-spin" />
          <p className="text-base font-semibold text-[#1E1E1E]">주문을 접수 중이에요...</p>
          <p className="text-sm text-[#727272] text-center">
            잠시만 기다려주세요.
          </p>
        </div>
      </div>
    )
  }

  // ── Rejected ──────────────────────────────────────────────────────────
  if (status === 'rejected') {
    return (
      <div className="screen">
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
          <span className="text-[72px] leading-none">😢</span>
          <p className="text-lg font-bold text-[#1E1E1E]">주문이 거부되었어요</p>
          <div className="w-full px-4 py-3 bg-red-50 rounded-xl">
            <p className="text-sm text-[#C92A2A] text-center">
              매장에서 &lsquo;{rejectedReason || '사유 미입력'}&rsquo;로 인해 주문을 거부하였어요
            </p>
          </div>
          <p className="text-sm text-[#727272] text-center">
            죄송합니다. 추후 다시 주문해주세요.
          </p>
        </div>
      </div>
    )
  }

  // ── Accepted ──────────────────────────────────────────────────────────
  const hasTimer   = totalSeconds !== null && secondsLeft !== null
  const progress   = hasTimer ? Math.min(1, 1 - secondsLeft! / totalSeconds!) : 0
  const isDone     = hasTimer && secondsLeft === 0

  return (
    <div className="screen" style={{ paddingBottom: showReview ? '80px' : '0' }}>
      <div className="flex-1 overflow-y-auto px-4 pt-8 pb-6 space-y-4">

        {/* 타이틀 */}
        <div className="flex items-center justify-between">
          <p className="text-xl font-bold text-[#1E1E1E]">주문이 접수됐어요!</p>
          <div className="w-9 h-9 rounded-full bg-[#017333] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-lg font-bold leading-none">✓</span>
          </div>
        </div>

        {/* 타이머 */}
        {hasTimer && (
          <div className="bg-[#F5F5F5] rounded-2xl px-5 py-4">
            <p className="text-[11px] font-semibold text-[#727272] mb-1">
              {isDone ? '조리가 완료됐어요!' : '예상 대기시간'}
            </p>
            {!isDone && (
              <p className="text-[36px] font-extrabold text-[#1E1E1E] leading-none mb-3 tabular-nums">
                {formatTime(secondsLeft!)}
              </p>
            )}
            {isDone && (
              <p className="text-[22px] font-extrabold text-[#017333] leading-none mb-3">
                픽업해 주세요 🎉
              </p>
            )}
            {/* 프로그레스 바 */}
            <div className="h-2 bg-[#D7D7D7] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#017333] rounded-full transition-all duration-1000 ease-linear"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* 주문 정보 */}
        <div className="bg-[#FAFAFA] rounded-xl px-4 py-4 space-y-2 text-sm">
          {(orderNumber ?? orderCode) && (
            <div className="flex justify-between items-center pb-2 border-b border-[#F0F0F0]">
              <span className="text-[#727272]">주문번호</span>
              <span className="font-mono font-bold text-[#1E1E1E] text-base tracking-widest">
                #{orderNumber ?? orderCode}
              </span>
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
            <div className="flex justify-between pt-2 border-t border-[#F0F0F0]">
              <span className="text-[#727272] font-semibold">결제 금액</span>
              <span className="font-bold text-[#1E1E1E]">{formatWon(orderTotal)}</span>
            </div>
          )}
        </div>

        {/* 잔액 차감 안내 */}
        {account && (
          <div className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#E6F4EC] rounded-xl">
            <span className="text-[#017333] text-sm">✓</span>
            <p className="text-sm text-[#017333] font-semibold">
              선결제 잔액에서 차감되었어요
            </p>
          </div>
        )}

        {/* 주문 메뉴 목록 */}
        {savedItems.length > 0 && (
          <div>
            <p className="text-[13px] font-bold text-[#1E1E1E] mb-2">주문 메뉴</p>
            <div className="space-y-3">
              {savedItems.map((item, idx) => {
                const imgUrl = menuImages[item.menuCode]
                return (
                  <div key={idx} className="flex gap-3 items-start">
                    {/* 메뉴 사진 */}
                    <div className="w-[60px] h-[60px] rounded-xl overflow-hidden flex-shrink-0 bg-[#F5F5F5]">
                      {imgUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={imgUrl}
                          alt={item.menuName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl">
                          🍽️
                        </div>
                      )}
                    </div>

                    {/* 메뉴 정보 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <p className="text-[14px] font-semibold text-[#1E1E1E] leading-snug">
                          {item.menuName}
                          <span className="text-[#727272] font-normal ml-1">×{item.qty}</span>
                        </p>
                        <p className="text-[13px] font-bold text-[#1E1E1E] flex-shrink-0">
                          {formatWon(item.subtotal)}
                        </p>
                      </div>
                      {item.selectedOptions.length > 0 && (
                        <p className="text-[11px] text-[#727272] mt-0.5 leading-relaxed">
                          {item.selectedOptions.map(o => o.optionName).join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* 네이버 리뷰 — 하단 스티키 플로팅 */}
      {showReview && (
        <div
          className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto px-4 py-3 bg-white border-t border-[#F0F0F0]"
          style={{ boxShadow: '0 -4px 20px rgba(0,0,0,0.08)' }}
        >
          <p className="text-[12px] text-[#727272] text-center mb-2">
            맛있게 드셨나요? 리뷰 한 줄이 큰 힘이 됩니다 🙏
          </p>
          <div className="flex gap-2">
            <a
              href="https://naver.me/sallaria"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-3 rounded-xl bg-[#03C75A] text-white text-[13px] font-bold text-center"
            >
              네이버 리뷰 남기기
            </a>
            <button
              onClick={() => setShowReview(false)}
              className="px-4 py-3 rounded-xl bg-[#F5F5F5] text-[#727272] text-[13px] font-semibold"
            >
              괜찮아요
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
