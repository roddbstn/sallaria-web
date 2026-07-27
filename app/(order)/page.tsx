'use client'

import { useState, useCallback, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSessionStore } from '@/lib/store/session'
import { useCartStore } from '@/lib/store/cart'
import { getSupabaseClient } from '@/lib/supabase/client'
import { formatWon } from '@/lib/utils'
import { track } from '@/lib/firebase'
import type { Account } from '@/lib/types'

// ── 내 주문 이력 타입 ──────────────────────────────────────────────────────────
interface OrderHistoryEntry {
  order_code:   string
  order_number: string
  account_name: string
  orderer_name: string
  ordered_at:   string
  total_amount: number
  method:       string
}

interface OrderHistoryWithStatus extends OrderHistoryEntry {
  status: string | null   // DB에서 조회한 현재 상태
}

const PIN_LOCK_LIMIT = 5

// DB account_type → Account.type 매핑
const TYPE_MAP: Record<string, Account['type']> = {
  '과':   '구청 과',
  '기업': '기업',
  '개인': '개인',
  '기타': '기타',
}

export default function HomePage() {
  return (
    <Suspense>
      <HomePageInner />
    </Suspense>
  )
}

function HomePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setAccount, setLoginAt, pinAttempts, pinLocked, incrementPinAttempts, lockPin, resetSession } = useSessionStore()
  const clearCart = useCartStore(s => s.clearCart)

  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [isShaking, setIsShaking] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [storeName,     setStoreName]     = useState('')
  const [storeNotFound, setStoreNotFound] = useState(false)
  const [storeClosed,   setStoreClosed]   = useState(false)
  const storeClosedRef = useRef(false)   // verifyPin 스테일 클로저 방지용
  const [qrAccountCode, setQrAccountCode] = useState<string | null>(null)

  // URL에서 매장 구분자 추출 (?store={storeId}) + 거래처 QR 파라미터
  const storeId     = searchParams.get('store')   ?? undefined
  const accountCode = searchParams.get('account') ?? undefined

  // 내 주문 모달
  const [showHistory,    setShowHistory]    = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyList,    setHistoryList]    = useState<OrderHistoryWithStatus[]>([])

  // 비밀번호 찾기
  const [forgotPin,     setForgotPin]     = useState(false)
  const [forgotName,    setForgotName]    = useState('')
  const [forgotPhone,   setForgotPhone]   = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError,   setForgotError]   = useState('')
  const [forgotResult,  setForgotResult]  = useState<{ accountName: string; pin: string } | null>(null)

  // 스토어명 로딩 — ?store= 우선, 없으면 ?account= 통해 store_id 조회
  useEffect(() => {
    async function loadStoreName() {
      const supabase = getSupabaseClient()

      if (storeId) {
        const { data } = await supabase.from('stores').select('name, is_open').eq('id', storeId).maybeSingle()
        if (data?.name) {
          setStoreName(data.name)
          document.title = `${data.name} · 선결제 주문`
          if (data.is_open === false) { storeClosedRef.current = true; setStoreClosed(true) }
        } else {
          setStoreNotFound(true)
        }
        return
      }

      if (accountCode) {
        // 거래처 QR만 있을 때: 해당 거래처의 store_id로 매장명 조회
        const { data } = await supabase
          .from('accounts')
          .select('store_id, stores(name, is_open)')
          .eq('account_code', accountCode)
          .maybeSingle()
        const store = (data as any)?.stores as { name: string; is_open: boolean } | undefined
        if (store?.name) {
          setStoreName(store.name)
          document.title = `${store.name} · 선결제 주문`
          if (store.is_open === false) { storeClosedRef.current = true; setStoreClosed(true) }
        } else {
          setStoreNotFound(true)
        }
        return
      }

      // 둘 다 없으면 QR 안내 화면
      setStoreNotFound(true)
    }
    loadStoreName()
  }, [storeId, accountCode])

  // 세션 초기화 + 거래처 고유 QR 처리 (?account=코드)
  useEffect(() => {
    // QR 파라미터 없을 때만 세션 초기화 (메뉴→루트 리디렉트 시 세션 유지)
    if (!accountCode) {
      resetSession()
      clearCart()
      return
    }

    async function loadByQr() {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase
        .from('accounts')
        .select('account_code, account_number, account_name, account_type, organization_name, contact_phone, current_balance, store_id')
        .eq('account_code', accountCode)
        .eq('is_active', true)
        .maybeSingle()

      if (error || !data) {
        setPinError('QR 코드에 해당하는 거래처를 찾을 수 없습니다. 점주에게 문의하세요.')
        return
      }

      // 거래처 특정 완료 — PIN 입력은 그대로 요구 (해당 거래처 PIN만 허용)
      setQrAccountCode(data.account_code)
    }
    loadByQr()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function formatPhone(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 11)
    if (digits.length <= 3) return digits
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  }

  async function handleForgotSubmit() {
    setForgotError('')
    const nameClean  = forgotName.trim()
    const phoneClean = forgotPhone.replace(/\D/g, '')
    if (!nameClean || phoneClean.length < 10) {
      setForgotError('이름과 휴대폰 번호를 정확히 입력해 주세요.')
      return
    }
    if (!storeId && !qrAccountCode) {
      setForgotError('매장 QR 코드를 스캔한 후 이용해 주세요.')
      return
    }
    setForgotLoading(true)
    try {
      const supabase = getSupabaseClient()
      // 서버사이드 RPC: 전체 accounts를 내려보내지 않고 서버에서 검증 후 PIN만 반환
      const { data, error } = await supabase.rpc('find_pin', {
        p_store_id:     storeId ?? null,
        p_name:         nameClean,
        p_phone:        forgotPhone,
        p_account_code: qrAccountCode ?? null,
      })

      if (error) {
        setForgotError('조회에 실패했습니다. 잠시 후 다시 시도해 주세요.')
        return
      }

      const match = (data as { account_name: string; pin_code: string }[] | null)?.[0]
      if (!match) {
        setForgotError('일치하는 정보를 찾을 수 없습니다. 이름과 휴대폰 번호를 확인해 주세요.')
        return
      }

      setForgotResult({ accountName: match.account_name, pin: match.pin_code })
    } finally {
      setForgotLoading(false)
    }
  }

  async function openHistory() {
    track('order_history_open')
    setShowHistory(true)
    setHistoryLoading(true)
    try {
      const raw: OrderHistoryEntry[] = JSON.parse(localStorage.getItem('sallaria_order_history') ?? '[]')
      if (raw.length === 0) { setHistoryList([]); return }

      const supabase = getSupabaseClient()
      const codes = raw.map(e => e.order_code)
      const { data } = await supabase
        .rpc('get_order_statuses', { p_order_codes: codes })

      const statusMap: Record<string, string> = {}
      ;(data ?? []).forEach((r: { order_code: string; status: string }) => { statusMap[r.order_code] = r.status })

      setHistoryList(raw.map(e => ({ ...e, status: statusMap[e.order_code] ?? null })))
    } catch {
      // localStorage 접근 실패(private 모드 등) 또는 JSON 파싱 실패 시 빈 목록으로 처리
      setHistoryList([])
    } finally {
      setHistoryLoading(false)
    }
  }

  const isLocked = pinLocked || pinAttempts >= PIN_LOCK_LIMIT

  const triggerShake = useCallback(() => {
    setIsShaking(true)
    setTimeout(() => setIsShaking(false), 400)
  }, [])

  const verifyPin = useCallback(async (inputPin: string) => {
    if (verifying) return
    // 운영 종료 상태 재확인 (스테일 클로저 방지: ref로 최신값 읽음)
    if (storeClosedRef.current) return
    setVerifying(true)
    try {
      const supabase = getSupabaseClient()

      // QR로 거래처가 특정됐으면 해당 거래처 PIN만 확인, 아니면 전체 검색
      let query = supabase
        .from('accounts')
        .select('account_code, account_number, account_name, account_type, organization_name, contact_phone, current_balance, store_id')
        .eq('pin_code', inputPin)
        .eq('is_active', true)

      if (qrAccountCode) {
        query = query.eq('account_code', qrAccountCode)
      } else if (storeId) {
        query = query.eq('store_id', storeId)
      }

      const { data, error } = await query.maybeSingle()

      if (error || !data) {
        const newAttempts = pinAttempts + 1
        incrementPinAttempts()
        triggerShake()
        setPin('')

        if (newAttempts >= PIN_LOCK_LIMIT) {
          lockPin()
          setPinError('')
          track('pin_locked', { store_id: storeId ?? '' })
        } else {
          const remaining = PIN_LOCK_LIMIT - newAttempts
          setPinError(`비밀번호가 틀렸습니다. (${newAttempts}회 오류, ${remaining}회 남음)`)
          track('login_fail', { attempts: newAttempts, store_id: storeId ?? '' })
        }
        return
      }

      // DB 조회 완료 후 재확인 — 조회하는 동안 loadStoreName이 완료돼 닫혔을 수 있음
      if (storeClosedRef.current) return

      const account: Account = {
        code:          data.account_code,
        accountNumber: data.account_number,
        name:          data.account_name,
        type:          TYPE_MAP[data.account_type] ?? '기타',
        org:           data.organization_name ?? null,
        balance:       data.current_balance,
        contactPhone:  data.contact_phone ?? null,
        pin:           inputPin,
        storeId:       data.store_id ?? undefined,
        storeName,
      }
      setAccount(account)
      setLoginAt(Date.now())
      setPinError('')
      track('pin_login', { account_type: data.account_type, store_id: data.store_id ?? '' })
      setTimeout(() => router.push('/menu'), 120)
    } finally {
      setVerifying(false)
    }
  }, [pinAttempts, incrementPinAttempts, lockPin, setAccount, triggerShake, verifying, router, storeName, qrAccountCode, storeId])

  const handleNumpad = useCallback((val: string) => {
    if (isLocked || verifying) return
    if (val === 'del') {
      setPin(p => p.slice(0, -1))
      setPinError('')
      return
    }
    if (pin.length >= 4) return

    const next = pin + val
    setPin(next)
    setPinError('')

    if (next.length === 4) {
      setTimeout(() => verifyPin(next), 120)
    }
  }, [pin, isLocked, verifying, verifyPin])

  // ── QR 코드 없이 직접 접속 ──
  if (storeClosed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-8 text-center bg-white">
        <div className="text-[64px] mb-6">🌙</div>
        <h2 className="text-[20px] font-bold text-[#1E1E1E] mb-3">현재 가게 운영시간이 아니에요</h2>
        <p className="text-[14px] text-[#727272] leading-relaxed">
          운영을 잠시 쉬고 있어요.<br />
          가게 운영시간에 다시 방문해 주세요 😊
        </p>
      </div>
    )
  }

  if (storeNotFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-8 text-center bg-white">
        <div className="text-5xl mb-6">📷</div>
        <h2 className="text-[18px] font-bold text-[#1E1E1E] mb-3">매장 QR 코드를 스캔해 주세요</h2>
        <p className="text-[14px] text-[#727272] leading-relaxed">
          매장에 부착된 QR 코드를 스캔하면<br />해당 매장의 선결제 주문 화면으로 이동합니다.
        </p>
      </div>
    )
  }

  // ── 잠김 화면 ──
  if (isLocked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-8 text-center bg-white">
        <div className="text-5xl mb-6">🔒</div>
        <h2 className="text-[18px] font-bold text-[#1E1E1E] mb-3">입력이 제한되었습니다</h2>
        <p className="text-[14px] text-[#727272] leading-relaxed">
          5회 오류로 입력이 제한되었습니다.<br />
          QR 코드를 다시 스캔해 주세요.
        </p>
      </div>
    )
  }

  // ── 비밀번호 찾기 결과 화면 ──
  if (forgotPin && forgotResult) {
    return (
      <div className="flex flex-col min-h-screen bg-white px-6 pt-16">
        <button
          onClick={() => { setForgotPin(false); setForgotResult(null); setForgotName(''); setForgotPhone('') }}
          className="-ml-3 p-3 mb-10 self-start"
        >
          <svg width="9" height="15" viewBox="0 0 9 15" fill="none"><path d="M8 1L1 7.5L8 14" stroke="#1E1E1E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div className="flex flex-col gap-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-2"
            style={{ background: 'linear-gradient(135deg, #02a84e 0%, #017333 60%, #015a28 100%)' }}>
            <span className="text-white text-3xl font-bold leading-none">✓</span>
          </div>
          <p className="text-[22px] font-bold text-[#1E1E1E] leading-snug">
            {forgotResult.accountName} 고객님,<br />
            비밀번호는 <span className="text-[#017333]">{forgotResult.pin}</span> 입니다.
          </p>
          <p className="text-[13px] text-[#727272]">확인 후 비밀번호를 입력해 로그인하세요.</p>
        </div>
        <div className="mt-auto pb-10">
          <button
            onClick={() => { setForgotPin(false); setForgotResult(null); setForgotName(''); setForgotPhone('') }}
            className="w-full py-4 rounded-2xl font-bold text-[16px] text-white"
            style={{ background: 'linear-gradient(135deg, #02a84e 0%, #017333 60%, #015a28 100%)' }}
          >
            비밀번호 입력하러 가기
          </button>
        </div>
      </div>
    )
  }

  // ── 비밀번호 찾기 인증 화면 ──
  if (forgotPin) {
    return (
      <div className="flex flex-col min-h-screen bg-white px-6 pt-16">
        <button
          onClick={() => { setForgotPin(false); setForgotError('') }}
          className="-ml-3 p-3 mb-8 self-start"
        >
          <svg width="9" height="15" viewBox="0 0 9 15" fill="none"><path d="M8 1L1 7.5L8 14" stroke="#1E1E1E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h1 className="text-[22px] font-bold text-[#1E1E1E] leading-snug mb-8">
          선결제 고객 확인을 위해<br />인증을 진행해 주세요
        </h1>

        <div className="flex flex-col gap-4">
          <div>
            <input
              type="text"
              value={forgotName}
              onChange={e => { setForgotName(e.target.value); setForgotError('') }}
              placeholder="대표자 이름"
              className="w-full border border-[#D7D7D7] rounded-xl px-4 py-3.5 text-[15px] text-[#1E1E1E] placeholder-[#C0C0C0] focus:outline-none focus:border-[#017333]"
            />
          </div>
          <div>
            <input
              type="tel"
              inputMode="numeric"
              value={forgotPhone}
              onChange={e => { setForgotPhone(formatPhone(e.target.value)); setForgotError('') }}
              placeholder="휴대폰 번호 (010-0000-0000)"
              className="w-full border border-[#D7D7D7] rounded-xl px-4 py-3.5 text-[15px] text-[#1E1E1E] placeholder-[#C0C0C0] focus:outline-none focus:border-[#017333]"
            />
          </div>
          {forgotError && (
            <p className="text-[13px] text-[#C92A2A]">{forgotError}</p>
          )}
        </div>

        <div className="mt-auto pb-10 pt-8">
          <button
            onClick={handleForgotSubmit}
            disabled={forgotLoading}
            className="w-full py-4 rounded-2xl font-bold text-[16px] text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #02a84e 0%, #017333 60%, #015a28 100%)' }}
          >
            {forgotLoading ? '확인 중...' : '확인'}
          </button>
        </div>
      </div>
    )
  }

  // ── PIN 입력 ──
  const numpadRows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'del'],
  ]

  // ── 매장명 로딩 중 ──
  if (!storeName) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="w-8 h-8 rounded-full border-2 border-[#D7D7D7] border-t-[#017333] animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <div className="flex flex-col items-center pt-16 pb-4 px-5">
        <div className="text-[28px] font-bold text-[#017333] mb-1">{storeName}</div>
      </div>

      <div className="text-center px-8 mb-10">
        <h1 className="text-[20px] font-bold text-[#1E1E1E] mb-2">선결제 비밀번호를 입력해 주세요</h1>
        {searchParams.get('expired') === '1' ? (
          <p className="text-[13px] text-[#C92A2A] font-semibold leading-relaxed">
            주문 시간(5분)이 만료되었습니다.<br />비밀번호를 다시 입력해 주세요.
          </p>
        ) : (
          <p className="text-[13px] text-[#727272] leading-relaxed">
            거래처에 전달받은 4자리 숫자를 아래에 입력해 주세요.
          </p>
        )}
      </div>

      <div className={`flex justify-center gap-4 mb-4 ${isShaking ? 'shake' : ''}`}>
        {[0, 1, 2, 3].map(i => {
          const filled = i < pin.length
          const hasError = !!pinError
          return (
            <div
              key={i}
              className={[
                'w-[18px] h-[18px] rounded-full border-2 transition-all duration-150',
                filled && hasError
                  ? 'bg-[#C92A2A] border-[#C92A2A]'
                  : filled
                  ? 'bg-[#1E1E1E] border-[#1E1E1E]'
                  : 'border-[#D7D7D7]',
              ].join(' ')}
            />
          )
        })}
      </div>

      <div className="text-center min-h-[20px] mb-6 px-8">
        {verifying && (
          <p className="text-[13px] text-[#017333] font-medium">확인 중...</p>
        )}
        {!verifying && pinError && (
          <p className="text-[13px] text-[#C92A2A] font-medium">{pinError}</p>
        )}
      </div>

      {/* 비밀번호 찾기 버튼 */}
      <div className="flex justify-center mb-4">
        <button
          onClick={() => { setForgotPin(true); setForgotError(''); setForgotName(''); setForgotPhone(''); setForgotResult(null) }}
          className="text-[13px] text-[#727272] underline underline-offset-2"
        >
          비밀번호를 잊으셨나요?
        </button>
      </div>

      <div className="px-6 flex-1">
        <div className="grid grid-cols-3 gap-3">
          {numpadRows.flat().map((key, idx) => {
            if (key === '') {
              return <div key={idx} />
            }
            if (key === 'del') {
              return (
                <button
                  key={idx}
                  onClick={() => handleNumpad('del')}
                  className="h-[68px] bg-[#FAFAFA] rounded-2xl text-[22px] flex items-center justify-center select-none"
                  aria-label="지우기"
                >
                  ⌫
                </button>
              )
            }
            return (
              <button
                key={idx}
                onClick={() => handleNumpad(key)}
                disabled={verifying}
                className="h-[68px] bg-[#FAFAFA] rounded-2xl text-[22px] font-semibold text-[#1E1E1E] flex items-center justify-center select-none active:bg-[#E8E8E8] transition-colors disabled:opacity-40"
              >
                {key}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex justify-center pb-8 pt-2">
        <a
          href="/privacy"
          className="text-[11px] text-[#AAAAAA] underline underline-offset-2"
        >
          개인정보처리방침
        </a>
      </div>

      {/* 내 주문 모달 */}
      {showHistory && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40"
          onClick={() => setShowHistory(false)}
        >
          <div
            className="bg-white rounded-t-3xl max-h-[75vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* 핸들 */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-[#D7D7D7]" />
            </div>

            <div className="px-5 py-3 border-b border-[#F0F0F0] flex items-center justify-between">
              <span className="text-[16px] font-bold text-[#1E1E1E]">내 주문 내역</span>
              <button onClick={() => setShowHistory(false)} className="text-[#727272] text-[20px] leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {historyLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 rounded-full border-2 border-[#D7D7D7] border-t-[#017333] animate-spin" />
                </div>
              ) : historyList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-[#727272]">
                  <span className="text-[36px] mb-3">📋</span>
                  <p className="text-[14px]">이 기기에서 주문한 내역이 없어요</p>
                </div>
              ) : (
                <div className="divide-y divide-[#F0F0F0]">
                  {historyList.map(order => {
                    const isActive = order.status === '주문완료' || order.status === '조리중'
                    const dateStr  = new Date(order.ordered_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
                    const timeStr  = new Date(order.ordered_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
                    const statusColor =
                      order.status === '완료'    ? 'bg-[#E6F4EC] text-[#017333]' :
                      order.status === '취소'    ? 'bg-red-50 text-[#C92A2A]'   :
                      order.status === '조리중'  ? 'bg-orange-50 text-orange-600' :
                      order.status === '주문완료' ? 'bg-blue-50 text-blue-600'   :
                      'bg-[#F5F5F5] text-[#727272]'

                    return (
                      <div key={order.order_code} className="px-5 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[13px] font-bold text-[#1E1E1E]">#{order.order_number}</span>
                              {order.status && (
                                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusColor}`}>
                                  {order.status}
                                </span>
                              )}
                            </div>
                            <p className="text-[12px] text-[#727272] truncate">
                              {order.account_name} · {order.orderer_name} · {order.method}
                            </p>
                            <p className="text-[11px] text-[#AAAAAA] mt-0.5">{dateStr} {timeStr}</p>
                          </div>
                          <div className="flex flex-col items-end gap-2 flex-shrink-0">
                            <span className="text-[14px] font-bold text-[#1E1E1E]">{formatWon(order.total_amount)}</span>
                            {isActive && (
                              <button
                                onClick={() => { track('order_history_item_click', { status: order.status ?? '' }); setShowHistory(false); router.push(`/success?code=${order.order_code}`) }}
                                className="text-[12px] font-bold text-white bg-[#017333] px-3 py-1.5 rounded-xl"
                              >
                                진행 확인 →
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
