'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSessionStore } from '@/lib/store/session'
import { getSupabaseClient } from '@/lib/supabase/client'
import { formatWon } from '@/lib/utils'
import { track } from '@/lib/firebase'
import type { CartItem } from '@/lib/types'

type OrderResultStatus = 'pending' | 'accepted' | 'rejected'

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

export default function SuccessPage() {
  return (
    <Suspense>
      <SuccessPageInner />
    </Suspense>
  )
}

function SuccessPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { account } = useSessionStore()

  const [status,           setStatus]           = useState<OrderResultStatus>('pending')
  const [orderCode,        setOrderCode]         = useState<string | null>(null)
  const [orderNumber,      setOrderNumber]       = useState<string | null>(null)
  const [orderMethod,      setOrderMethod]       = useState<string>('')
  const [orderTotal,       setOrderTotal]        = useState<number>(0)
  const [orderOrderer,     setOrderOrderer]      = useState<string>('')
  const [orderPhone,       setOrderPhone]        = useState<string>('')
  const [orderAccount,     setOrderAccount]      = useState<string>('')
  const [orderBalanceAfter, setOrderBalanceAfter] = useState<number | null>(null)
  const [rejectedReason,   setRejectedReason]    = useState<string>('')
  const [showReview,       setShowReview]        = useState(false)

  // 타이머
  const [totalSeconds,  setTotalSeconds]  = useState<number | null>(null)
  const [acceptedAt,    setAcceptedAt]    = useState<number | null>(null)
  const [secondsLeft,   setSecondsLeft]   = useState<number | null>(null)
  const [posCompleted,  setPosCompleted]  = useState(false)

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
    const sessionCode = sessionStorage.getItem('last_order_code')
    const urlCode     = searchParams.get('code')
    const code        = sessionCode ?? urlCode

    if (!code) { router.replace('/'); return }

    // ── 공통: DB 상태 조회 + Realtime 구독 ──
    function setupRealtimeAndStatus(orderCode: string) {
      const supabase = getSupabaseClient()

      supabase
        .from('orders')
        .select('status, note')
        .eq('order_code', orderCode)
        .maybeSingle()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then(({ data }: { data: any }) => {
          if (!data) return
          if (data.status === '조리중' || data.status === '완료') {
            setStatus('accepted')
            track('order_accepted', { order_code: orderCode })
            setAcceptedAt(prev => {
              if (prev) return prev
              const now = Date.now()
              sessionStorage.setItem('last_order_accepted_at', String(now))
              return now
            })
            if (data.status === '완료') setPosCompleted(true)
          } else if (data.status === '취소') {
            const reason = data.note ?? '점주가 주문을 거부했습니다.'
            setStatus('rejected')
            track('order_rejected', { order_code: orderCode, reason })
            setRejectedReason(reason)
            sessionStorage.setItem('last_order_rejected', '1')
            sessionStorage.setItem('last_order_rej_reason', reason)
          }
        })

      try {
        const channel = supabase
          .channel(`orders:order_code=${orderCode}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'orders', filter: `order_code=eq.${orderCode}` },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (payload: any) => {
              const s = payload.new?.status
              if (s === '조리중') {
                const now = Date.now()
                setStatus('accepted')
                setAcceptedAt(prev => { if (prev) return prev; sessionStorage.setItem('last_order_accepted_at', String(now)); return now })
              } else if (s === '완료') {
                setStatus('accepted')
                setAcceptedAt(prev => { if (prev) return prev; const now = Date.now(); sessionStorage.setItem('last_order_accepted_at', String(now)); return now })
                setPosCompleted(true)
              } else if (s === '취소') {
                const reason = payload.new?.note ?? '점주가 주문을 거부했습니다.'
                setStatus('rejected')
                setRejectedReason(reason)
                sessionStorage.setItem('last_order_rejected', '1')
                sessionStorage.setItem('last_order_rej_reason', reason)
              }
            }
          )
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .on('broadcast', { event: 'ORDER_ACCEPTED' }, ({ payload }: { payload: any }) => {
            const now  = Date.now()
            const mins = payload?.estimated_minutes ?? null
            setStatus('accepted')
            setAcceptedAt(prev => { if (prev) return prev; sessionStorage.setItem('last_order_accepted_at', String(now)); return now })
            if (mins && mins > 0) {
              setTotalSeconds(mins * 60)
              setSecondsLeft(mins * 60)
              sessionStorage.setItem('last_order_total_seconds', String(mins * 60))
            }
          })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .on('broadcast', { event: 'ORDER_REJECTED' }, ({ payload }: { payload: any }) => {
            const reason = payload?.reason ?? '점주가 주문을 거부했습니다.'
            setStatus('rejected')
            setRejectedReason(reason)
            sessionStorage.setItem('last_order_rejected', '1')
            sessionStorage.setItem('last_order_rej_reason', reason)
          })
          .subscribe()
        channelRef.current = channel
      } catch (err) {
        console.error('[success] Realtime 연결 오류:', err)
        // 자동 전환 없음 — POS 접수 버튼 클릭 시에만 전환됨
      }
    }

    // ── URL param으로 접근 (QR 재스캔 후 '내 주문'에서 진입) ──
    if (!sessionCode && urlCode) {
      setOrderCode(urlCode)
      const supabase = getSupabaseClient()
      supabase
        .from('orders')
        .select('order_number, orderer_name, orderer_phone, method, total_amount, balance_after, accounts ( account_name )')
        .eq('order_code', urlCode)
        .maybeSingle()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then(({ data }: { data: any }) => {
          if (!data) return
          setOrderNumber(data.order_number ?? urlCode)
          setOrderMethod(data.method ?? '')
          setOrderTotal(data.total_amount ?? 0)
          setOrderOrderer(data.orderer_name ?? '')
          setOrderPhone(data.orderer_phone ?? '')
          setOrderAccount((data.accounts as any)?.account_name ?? '')
          if (data.balance_after !== null) setOrderBalanceAfter(data.balance_after)
        })
      setupRealtimeAndStatus(urlCode)
      return () => {
        try { if (channelRef.current) getSupabaseClient().removeChannel(channelRef.current) } catch { /* ignore */ }
      }
    }

    // ── 일반 세션 경로 (sessionStorage에서 읽기) ──
    const num            = sessionStorage.getItem('last_order_number')
    const method         = sessionStorage.getItem('last_order_method') ?? ''
    const total          = Number(sessionStorage.getItem('last_order_total') ?? '0')
    const orderer        = sessionStorage.getItem('last_order_orderer') ?? ''
    const phone          = sessionStorage.getItem('last_order_phone') ?? ''
    const acct           = sessionStorage.getItem('last_order_account') ?? ''
    const balanceAfterRaw = sessionStorage.getItem('last_order_balance_after')

    setOrderCode(code)
    setOrderNumber(num)
    setOrderMethod(method)
    setOrderTotal(total)
    setOrderOrderer(orderer)
    setOrderPhone(phone)
    setOrderAccount(acct)
    if (balanceAfterRaw !== null) setOrderBalanceAfter(Number(balanceAfterRaw))

    if (code.startsWith('MOCK-')) {
      setStatus('accepted')
      setAcceptedAt(Date.now())
      setTotalSeconds(10 * 60)
      setSecondsLeft(10 * 60)
      return
    }

    // 새로고침 복원
    const savedAcceptedAt   = sessionStorage.getItem('last_order_accepted_at')
    const savedTotalSeconds = sessionStorage.getItem('last_order_total_seconds')
    const savedRejected     = sessionStorage.getItem('last_order_rejected')
    const savedRejReason    = sessionStorage.getItem('last_order_rej_reason')

    if (savedRejected === '1') {
      setStatus('rejected')
      setRejectedReason(savedRejReason ?? '점주가 주문을 거부했습니다.')
      return
    }

    if (savedAcceptedAt) {
      const at   = Number(savedAcceptedAt)
      const secs = savedTotalSeconds ? Number(savedTotalSeconds) : null
      setStatus('accepted')
      setAcceptedAt(at)
      if (secs) {
        setTotalSeconds(secs)
        setSecondsLeft(Math.max(0, secs - Math.floor((Date.now() - at) / 1000)))
      }
    }

    setupRealtimeAndStatus(code)

    return () => {
      try {
        if (channelRef.current) getSupabaseClient().removeChannel(channelRef.current)
      } catch { /* ignore */ }
    }
  }, [router, searchParams])

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
  const hasTimer = totalSeconds !== null && secondsLeft !== null
  const progress = hasTimer ? Math.min(1, 1 - secondsLeft! / totalSeconds!) : 0
  const timerDone = hasTimer && secondsLeft === 0
  const isReady = posCompleted || timerDone
  const isDelivery = orderMethod === '배달'

  return (
    <div className="screen" style={{ paddingBottom: showReview ? '80px' : '0' }}>
      <div className="flex-1 overflow-y-auto px-4 pt-8 pb-6 space-y-4">

        {/* 타이틀 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xl font-bold text-[#1E1E1E]">
              {isReady
                ? (isDelivery ? '배달기사가 곧 도착해요!' : '메뉴가 준비됐어요!')
                : '주문이 접수됐어요!'}
            </p>
            {isReady && !isDelivery && (
              <p className="text-sm text-[#017333] font-semibold mt-0.5">매장에서 받아가세요</p>
            )}
          </div>
          {isReady ? (
            <span className="text-[36px] leading-none flex-shrink-0">
              {isDelivery ? '🛵' : '🎉'}
            </span>
          ) : (
            <div className="w-9 h-9 rounded-full bg-[#017333] flex items-center justify-center flex-shrink-0">
              <span className="text-white text-lg font-bold leading-none">✓</span>
            </div>
          )}
        </div>

        {/* 타이머 (준비 전에만) */}
        {hasTimer && !isReady && (
          <div className="bg-[#F5F5F5] rounded-2xl px-5 py-4">
            <p className="text-[11px] font-semibold text-[#727272] mb-1">예상 대기시간</p>
            <p className="text-[36px] font-extrabold text-[#1E1E1E] leading-none mb-3 tabular-nums">
              {formatTime(secondsLeft!)}
            </p>
            <div className="h-2 bg-[#D7D7D7] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#017333] rounded-full transition-all duration-1000 ease-linear"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <p className="text-[11px] text-[#727272] mt-2 text-center">
              준비가 일찍 끝날 수도 있어요. 새로고침해서 확인해보세요 🔄
            </p>
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
              <span className="font-normal text-[#1E1E1E]">{orderAccount}</span>
            </div>
          )}
          {orderOrderer && (
            <div className="flex justify-between">
              <span className="text-[#727272]">주문자</span>
              <span className="font-normal text-[#1E1E1E]">{orderOrderer}</span>
            </div>
          )}
          {orderPhone && (
            <div className="flex justify-between">
              <span className="text-[#727272]">연락처</span>
              <span className="font-normal text-[#1E1E1E]">{orderPhone}</span>
            </div>
          )}
          {orderMethod && (
            <div className="flex justify-between">
              <span className="text-[#727272]">이용방법</span>
              <span className="font-normal text-[#1E1E1E]">
                {orderMethod}{orderMethod === '배달' ? ' (+3,500원)' : ''}
              </span>
            </div>
          )}
          {orderTotal > 0 && (
            <div className="flex justify-between pt-2 border-t border-[#F0F0F0]">
              <span className="text-[#727272] font-semibold">결제 금액</span>
              <span className="font-bold text-[#1E1E1E]">{formatWon(orderTotal)}</span>
            </div>
          )}
          {orderBalanceAfter !== null && (
            <div className="flex justify-between">
              <span className="text-[#727272] font-semibold">주문 후 잔액</span>
              <span className={`font-bold ${orderBalanceAfter < 0 ? 'text-[#C92A2A]' : 'text-[#017333]'}`}>
                {formatWon(orderBalanceAfter)}
              </span>
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
            <p className="text-[15px] font-bold text-[#1E1E1E] mb-2">주문 메뉴</p>
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
                        <p className="text-[15px] font-bold text-[#1E1E1E] flex-shrink-0">
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
              onClick={() => track('naver_review_click')}
              className="flex-1 py-3 rounded-xl bg-[#03C75A] text-white text-[13px] font-bold text-center"
            >
              네이버 리뷰 남기기
            </a>
            <button
              onClick={() => { track('review_dismissed'); setShowReview(false) }}
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
