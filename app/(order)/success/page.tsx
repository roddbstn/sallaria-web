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
  const [orderBalanceBefore, setOrderBalanceBefore] = useState<number | null>(null)
  const [orderBalanceAfter, setOrderBalanceAfter]   = useState<number | null>(null)
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

  const [departedAt, setDepartedAt] = useState<string | null>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef      = useRef<any>(null)
  const setupRealtimeRef = useRef<((code: string) => void) | null>(null)

  // ── 주문 아이템 + 이미지 로드 ──────────────────────────────────────────
  useEffect(() => {
    const raw = sessionStorage.getItem('last_order_items')
    if (!raw) return
    let items: CartItem[]
    try {
      items = JSON.parse(raw)
    } catch {
      // 파싱 실패 시 아이템 표시 생략 (주문 코드로 DB 조회는 계속 진행)
      return
    }
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

      // get_order_statuses: 0021에서 anon GRANT 확정된 RPC (상태 감지용)
      supabase
        .rpc('get_order_statuses', { p_order_codes: [orderCode] })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then(({ data: rows, error }: { data: any; error: any }) => {
          if (error) { console.error('[setup] get_order_statuses error:', error); return }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const row = Array.isArray(rows) ? rows.find((r: any) => r.order_code === orderCode) ?? null : null
          if (!row) return
          if (row.status === '조리중' || row.status === '완료') {
            setStatus('accepted')
            track('order_accepted', { order_code: orderCode })
            setAcceptedAt(prev => {
              if (prev) return prev
              const now = Date.now()
              sessionStorage.setItem('last_order_accepted_at', String(now))
              return now
            })
            if (row.status === '완료') setPosCompleted(true)
          } else if (row.status === '취소') {
            const cachedReason = sessionStorage.getItem('last_order_rej_reason')
            const reason = cachedReason ?? '점주가 주문을 거부했습니다.'
            setStatus('rejected')
            track('order_rejected', { order_code: orderCode, reason })
            setRejectedReason(reason)
            sessionStorage.setItem('last_order_rejected', '1')
            sessionStorage.setItem('last_order_rej_reason', reason)
          }
          // departed_at은 get_order_status(선택적)로 별도 보강 — 실패해도 무방
          supabase.rpc('get_order_status', { p_order_code: orderCode })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .then(({ data: det }: { data: any }) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const d = Array.isArray(det) ? det[0] ?? null : null
              if (d?.delivery_departed_at) setDepartedAt(d.delivery_departed_at)
              if (row.status === '취소' && d?.note) {
                setRejectedReason(d.note)
                sessionStorage.setItem('last_order_rej_reason', d.note)
              }
            })
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .on('broadcast', { event: 'ORDER_COMPLETED' }, ({ payload }: { payload: any }) => {
            setStatus('accepted')
            setPosCompleted(true)
            if (payload?.departed_at) setDepartedAt(payload.departed_at)
          })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .on('broadcast', { event: 'DELIVERY_DEPARTED' }, ({ payload }: { payload: any }) => {
            if (payload?.departed_at) setDepartedAt(payload.departed_at)
          })
          .subscribe()
        channelRef.current = channel
      } catch (err) {
        console.error('[success] Realtime 연결 오류:', err)
      }
    }

    // 함수 정의 직후 ref 등록 — TEMP 코드일 때도 event listener에서 호출 가능하게
    setupRealtimeRef.current = setupRealtimeAndStatus

    // ── URL param으로 접근 (QR 재스캔 후 '내 주문'에서 진입) ──
    if (!sessionCode && urlCode) {
      setOrderCode(urlCode)
      const supabase = getSupabaseClient()
      supabase
        .from('orders')
        .select('order_number, orderer_name, orderer_phone, method, total_amount, balance_before, balance_after, accounts ( account_name )')
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
          if (data.balance_before !== null) setOrderBalanceBefore(data.balance_before)
          if (data.balance_after  !== null) setOrderBalanceAfter(data.balance_after)
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
    const balanceBeforeRaw = sessionStorage.getItem('last_order_balance_before')
    const balanceAfterRaw  = sessionStorage.getItem('last_order_balance_after')

    setOrderCode(code)
    setOrderNumber(num)
    setOrderMethod(method)
    setOrderTotal(total)
    setOrderOrderer(orderer)
    setOrderPhone(phone)
    setOrderAccount(acct)
    if (balanceBeforeRaw !== null) setOrderBalanceBefore(Number(balanceBeforeRaw))
    if (balanceAfterRaw  !== null) setOrderBalanceAfter(Number(balanceAfterRaw))

    if (code.startsWith('MOCK-')) {
      setStatus('accepted')
      setAcceptedAt(Date.now())
      setTotalSeconds(10 * 60)
      setSecondsLeft(10 * 60)
      return
    }

    // TEMP 코드 = RPC 아직 진행 중 → Realtime 스킵, 이벤트 대기
    if (code.startsWith('TEMP-')) {
      // 혹시 이미 실패 결과가 기록돼 있으면 바로 표시
      if (sessionStorage.getItem('last_order_failed') === '1') {
        const failReason = sessionStorage.getItem('last_order_fail_reason')
        setStatus('rejected')
        setRejectedReason(failReason ?? '주문 처리에 실패했습니다.')
        return
      }

      // order_rpc_done 이벤트가 마운트 전에 발행됐을 경우를 대비:
      // sessionStorage가 실제 코드로 업데이트될 때까지 100ms마다 폴링
      const ssInterval = setInterval(() => {
        const failedFlag = sessionStorage.getItem('last_order_failed')
        if (failedFlag === '1') {
          clearInterval(ssInterval)
          const reason = sessionStorage.getItem('last_order_fail_reason')
          setStatus('rejected')
          setRejectedReason(reason ?? '주문 처리에 실패했습니다.')
          return
        }
        const realCode = sessionStorage.getItem('last_order_code')
        if (!realCode || realCode.startsWith('TEMP-')) return
        clearInterval(ssInterval)
        const realNum = sessionStorage.getItem('last_order_number')
        setOrderCode(realCode)
        if (realNum) setOrderNumber(realNum)
        // channelRef.current이 없을 때만 Realtime 설정 (중복 방지)
        if (!channelRef.current) {
          setupRealtimeRef.current?.(realCode)
        }
      }, 100)

      return () => clearInterval(ssInterval)
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

  // ── 상태 폴링 폴백 (Realtime 미수신 대비, 3초마다) ────────────────────
  // sessionStorage를 직접 읽어 TEMP→실제 코드 전환도 여기서 처리
  // → orderCode React state에 의존하지 않으므로 타이밍 경쟁 없음
  useEffect(() => {
    if (status === 'rejected') return
    if (status === 'accepted' && posCompleted) return

    async function poll() {
      // sessionStorage에서 항상 최신 코드 읽기
      const code = sessionStorage.getItem('last_order_code')
      if (!code || code.startsWith('TEMP-') || code.startsWith('MOCK-')) return

      // React state가 아직 TEMP면 실제 코드로 업데이트 + Realtime 설정
      if (!orderCode || orderCode.startsWith('TEMP-')) {
        const num = sessionStorage.getItem('last_order_number')
        setOrderCode(code)
        if (num) setOrderNumber(num)
        if (!channelRef.current) {
          setupRealtimeRef.current?.(code)
        }
      }

      const supabase = getSupabaseClient()
      // get_order_statuses: anon GRANT 확정, 상태 감지 기준
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: statuses, error: statusErr } = await supabase.rpc('get_order_statuses', { p_order_codes: [code] }) as { data: any; error: any }
      if (statusErr) { console.error('[poll] get_order_statuses error:', statusErr); return }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const statusRow = Array.isArray(statuses) ? statuses.find((r: any) => r.order_code === code) ?? null : null
      if (!statusRow) return

      // get_order_status: departed_at / note 보강용 (선택적, 실패해도 무방)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: details } = await supabase.rpc('get_order_status', { p_order_code: code }) as { data: any }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = Array.isArray(details) ? details[0] ?? null : null

      if (detail?.delivery_departed_at) setDepartedAt(detail.delivery_departed_at)
      if (statusRow.status === '완료') {
        setStatus('accepted')
        setAcceptedAt(prev => {
          if (prev) return prev
          const now = Date.now()
          sessionStorage.setItem('last_order_accepted_at', String(now))
          return now
        })
        setPosCompleted(true)
      } else if (statusRow.status === '조리중') {
        setStatus('accepted')
        setAcceptedAt(prev => {
          if (prev) return prev
          const now = Date.now()
          sessionStorage.setItem('last_order_accepted_at', String(now))
          return now
        })
      } else if (statusRow.status === '취소') {
        const reason = detail?.note ?? sessionStorage.getItem('last_order_rej_reason') ?? '점주가 주문을 거부했습니다.'
        setStatus('rejected')
        setRejectedReason(reason)
        sessionStorage.setItem('last_order_rejected', '1')
        sessionStorage.setItem('last_order_rej_reason', reason)
      }
    }

    // 즉시 한 번 실행 후 2초 간격으로 반복
    poll()
    const id = setInterval(poll, 2000)

    // 모바일 브라우저에서 화면이 꺼졌다가 켜질 때 즉시 폴링
    // (iOS Safari는 백그라운드에서 setInterval을 중단하므로 필수)
    const onVisible = () => { if (document.visibilityState === 'visible') poll() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, posCompleted])

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

  // ── 백그라운드 RPC 결과 수신 ─────────────────────────────────────────
  useEffect(() => {
    const onDone = (e: Event) => {
      const { order_code, order_number } = (e as CustomEvent).detail
      setOrderCode(order_code)
      setOrderNumber(order_number)
      // channelRef.current이 없을 때만 Realtime 설정 (sessionStorage 폴링과 중복 방지)
      if (!channelRef.current) {
        setupRealtimeRef.current?.(order_code)
      }
    }
    const onFailed = (e: Event) => {
      const { reason } = (e as CustomEvent).detail
      setStatus('rejected')
      setRejectedReason(reason ?? '주문 처리에 실패했습니다.')
    }
    window.addEventListener('order_rpc_done',   onDone)
    window.addEventListener('order_rpc_failed', onFailed)
    return () => {
      window.removeEventListener('order_rpc_done',   onDone)
      window.removeEventListener('order_rpc_failed', onFailed)
    }
  }, [])

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
        {isReady ? (
          /* ── 준비 완료: 그라디에이션 배너 ── */
          <div
            className="rounded-2xl py-8 px-5 flex flex-col items-center gap-2 text-center"
            style={{ background: 'linear-gradient(135deg, #02a84e 0%, #017333 60%, #015a28 100%)' }}
          >
            <span className="text-[64px] leading-none mt-1">🎉</span>
            <p className="text-[20px] font-bold text-white mt-1">
              {isDelivery
                ? `${orderOrderer ? `${orderOrderer}님의 ` : ''}배달이 출발했어요`
                : `${orderOrderer ? `${orderOrderer}님의 ` : ''}메뉴가 준비됐어요!`}
            </p>
            {isDelivery && departedAt && (
              <div className="mt-1 px-4 py-1.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}>
                <span className="text-[15px] font-bold text-white">
                  🛵 {new Date(departedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })} 출발
                </span>
              </div>
            )}
            {(orderNumber ?? orderCode) && (
              <span className="font-mono font-extrabold text-white text-[44px] tracking-widest leading-none">
                #{orderNumber ?? orderCode}
              </span>
            )}
            {!isDelivery && (
              <p className="text-[13px] text-white/75 font-semibold">매장에서 받아가세요</p>
            )}
          </div>
        ) : (
          /* ── 접수 완료: 기존 레이아웃 ── */
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xl font-bold text-[#1E1E1E]">주문이 접수됐어요!</p>
              {(orderNumber ?? orderCode) && (
                <span className="inline-block border border-[#b2dfc3] bg-[#E6F4EC] rounded-xl px-3 py-1 font-mono font-bold text-[#017333] text-[36px] tracking-widest leading-none mt-2">
                  #{orderNumber ?? orderCode}
                </span>
              )}
            </div>
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #02a84e 0%, #017333 60%, #015a28 100%)' }}>
              <span className="text-white text-lg font-bold leading-none">✓</span>
            </div>
          </div>
        )}

        {/* 타이머 (준비 전에만) */}
        {hasTimer && !isReady && (
          <div className="rounded-2xl px-5 py-4" style={{ background: 'linear-gradient(135deg, #02a84e 0%, #017333 60%, #015a28 100%)' }}>
            <p className="text-[11px] font-semibold text-white/70 mb-1">{orderMethod === '배달' ? '출발까지 예상 대기시간' : '예상 대기시간'}</p>
            <p className="text-[24px] font-extrabold text-white leading-none mb-3 tabular-nums">
              {formatTime(secondsLeft!)}
            </p>
            <div className="h-2 bg-white/25 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-1000 ease-linear"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <p className="text-[11px] text-white/60 mt-2 text-center">
              준비가 일찍 끝날 수도 있어요. 새로고침해서 확인해보세요 🔄
            </p>
          </div>
        )}


        {/* 주문 정보 */}
        <div className="bg-[#FAFAFA] rounded-xl px-4 py-4 space-y-2 text-sm">
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
          {orderBalanceBefore !== null && (
            <div className="flex justify-between pt-2 border-t border-[#F0F0F0]">
              <span className="text-[#727272]">기존 선결제 잔액</span>
              <span className="font-normal text-[#1E1E1E]">{formatWon(orderBalanceBefore)}</span>
            </div>
          )}
          {orderTotal > 0 && (
            <div className="flex justify-between">
              <span className="text-[#727272] font-semibold">결제 금액</span>
              <span className="font-bold text-[#1E1E1E]">{formatWon(orderTotal)}</span>
            </div>
          )}
          {orderBalanceAfter !== null && (
            <div className="flex justify-between pt-3 mt-1 border-t border-[#E8E8E8]">
              <span className="text-[#727272]">주문 후 잔액</span>
              <span className={`font-normal ${orderBalanceAfter < 0 ? 'text-[#C92A2A]' : 'text-[#1E1E1E]'}`}>
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
              선결제 잔액에서 {formatWon(orderTotal)}이 차감되었어요
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

        {/* 취소 불가 안내 */}
        <div className="flex items-start gap-2 px-4 py-3 bg-white rounded-xl border border-[#D7D7D7]">
          <span className="text-[#1E1E1E] text-sm mt-0.5">ℹ️</span>
          <p className="text-[13px] text-[#727272] leading-relaxed">
            주문 접수 후에는 취소 및 환불이 어려워요.<br />
            문의는 매장으로 직접 연락해 주세요.
          </p>
        </div>
      </div>

      {/* 네이버 리뷰 — 하단 스티키 플로팅 */}
      {showReview && (
        <div
          className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto px-4 py-3 bg-white border-t border-[#F0F0F0]"
          style={{ boxShadow: '0 -4px 20px rgba(0,0,0,0.08)' }}
        >
          <p className="text-[12px] text-[#B0B0B0] text-center mb-2">
            소중한 리뷰 작성이 큰 힘이 돼요!
          </p>
          <a
            href="https://naver.me/sallaria"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track('naver_review_click')}
            className="block w-full py-4 rounded-xl bg-[#03C75A] text-white text-[16px] font-extrabold text-center transition-transform duration-100 active:scale-95 active:brightness-90"
          >
            네이버 리뷰 남기기
          </a>
        </div>
      )}
    </div>
  )
}
