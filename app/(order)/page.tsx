'use client'

import { useState, useCallback, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSessionStore } from '@/lib/store/session'
import { useCartStore } from '@/lib/store/cart'
import { getSupabaseClient } from '@/lib/supabase/client'
import { track } from '@/lib/firebase'
import { ampTrack, ampIdentify } from '@/lib/amplitude'
import type { Account } from '@/lib/types'
import OrdererSheet from '@/components/order/orderer-sheet'
import LoadingTimer from '@/components/ui/loading-timer'

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
  const { setAccount, setLoginAt, setOrderer, setPhone, pinAttempts, pinLocked, incrementPinAttempts, lockPin, resetSession } = useSessionStore()
  const clearCart = useCartStore(s => s.clearCart)

  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [isShaking, setIsShaking] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [toastVisible, setToastVisible] = useState(false)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [storeName,     setStoreName]     = useState('')
  const [storeNotFound, setStoreNotFound] = useState(false)
  const [storeClosed,   setStoreClosed]   = useState(false)
  const storeClosedRef = useRef(false)   // verifyPin 스테일 클로저 방지용

  /** 왜 닫혔는지 — 'break' | 'before_open' | 'closed'. store_closed_reason RPC */
  const [closedReason, setClosedReason] = useState<string>('closed')
  const [reopenAt,     setReopenAt]     = useState<string>('')

  // 닫힌 걸 확인한 다음에만 묻는다 — 열려 있는 동안 매번 한 번 더 조회할 이유가 없다
  const loadClosedReason = useCallback(async (sid: string) => {
    try {
      const { data } = await getSupabaseClient().rpc('store_closed_reason', { p_store_id: sid })
      const row = (data as { reason: string; reopen_at: string | null }[] | null)?.[0]
      if (row) { setClosedReason(row.reason); setReopenAt(row.reopen_at ?? '') }
    } catch { /* 이유를 못 받아도 기본 문구로 보여준다 */ }
  }, [])
  const [qrAccountCode, setQrAccountCode] = useState<string | null>(null)

  // ── PIN 통과 뒤 주문자 고르기 ─────────────────────────────────────────────
  //
  // 전에는 QR → 명단 화면 → PIN 순서로 화면을 둘로 쪼갰는데, 명단을 보여주려고 PIN 앞에
  // 화면을 하나 더 세우니 "뭔가 더 해야 하는" 흐름이 됐다. 순서를 되돌려 **PIN 이 먼저**고,
  // 통과한 그 화면 위로 하단 시트가 올라와 주문자만 고르게 한다.
  // 뒤에 인증 끝난 화면이 그대로 남아 있어서 단계가 늘어난 느낌이 없다.
  //
  // 고르면 주문자가 정해지고 → 메뉴 화면의 '지난번 주문한'이 그 사람 것으로 바뀌고
  // → 체크아웃의 이름·전화번호 입력이 사라진다.
  const [sheetOpen,   setSheetOpen]   = useState(false)
  /** PIN 통과 후 /menu 로 보내기 전에 들고 있는 계정 — 시트에서 고르면 그때 이동 */
  const [pendingAccount, setPendingAccount] = useState<Account | null>(null)

  // URL에서 매장 구분자 추출 (?store={storeId}) + 거래처 QR 파라미터
  const storeId     = searchParams.get('store')   ?? undefined
  const accountCode = searchParams.get('account') ?? undefined

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
          if (data.is_open === false) { storeClosedRef.current = true; setStoreClosed(true); void loadClosedReason(storeId!) }
        } else {
          setStoreNotFound(true)
        }
        return
      }

      if (accountCode) {
        // 거래처 QR만 있을 때: 해당 거래처의 store_id로 매장명 조회
        // accounts 테이블 직접 조회 금지 — RPC로만 (anon이 전체 거래처를 긁어갈 수 없도록)
        const { data } = await supabase.rpc('get_account_public', { p_account_code: accountCode })
        const row = (data as { store_name: string; store_is_open: boolean }[] | null)?.[0]
        if (row?.store_name) {
          setStoreName(row.store_name)
          document.title = `${row.store_name} · 선결제 주문`
          if (row.store_is_open === false) { storeClosedRef.current = true; setStoreClosed(true)
            // 이 경로엔 store_id 가 없다(get_account_public 이 안 내려준다) — 기본 문구로 둔다
          }
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

  // 오류 토스트 — pinError 변경 시 3초 표시. 잠김 상태는 해제될 때까지 계속 표시.
  useEffect(() => {
    if (!pinError) return
    setToastVisible(true)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    if (pinLocked) return
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 3000)
  }, [pinError, pinLocked])

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
      const { data, error } = await supabase.rpc('get_account_public', { p_account_code: accountCode })
      const row = (data as { account_code: string; account_name: string }[] | null)?.[0]

      if (error || !row) {
        setPinError('QR 코드에 해당하는 거래처를 찾을 수 없습니다. 점주에게 문의하세요.')
        return
      }

      // 거래처 특정 완료 — PIN 입력은 그대로 요구 (해당 거래처 PIN만 허용).
      // 주문자 명단은 여기서 미리 받지 않는다 — PIN 을 못 넘기는 사람에겐 필요 없는 조회고,
      // 명단이 보이는 건 인증 뒤 시트에서다.
      setQrAccountCode(row.account_code)
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

      // QR로 거래처가 특정됐으면 해당 거래처 PIN만 확인, 아니면 매장 범위 내 검색.
      // accounts 테이블 직접 조회 금지 — RPC가 서버에서 스코프(account_code/store_id)를 강제함
      const { data: rpcData, error } = await supabase.rpc('verify_account_pin', {
        p_pin:          inputPin,
        p_store_id:     storeId ?? null,
        p_account_code: qrAccountCode ?? null,
      })
      const data = (rpcData as {
        account_code: string; account_number: number; account_name: string; account_type: string
        organization_name: string | null; contact_phone: string | null; current_balance: number; store_id: string | null
      }[] | null)?.[0]

      if (error || !data) {
        const newAttempts = pinAttempts + 1
        incrementPinAttempts()
        triggerShake()
        setPin('')

        if (newAttempts >= PIN_LOCK_LIMIT) {
          lockPin()
          setPinError('시도 횟수를 초과했어요. 잠시 후 다시 시도해 주세요.')
          track('pin_locked', { store_id: storeId ?? '' })
          ampTrack('pin_locked', { store_id: storeId ?? '' })
        } else {
          const remaining = PIN_LOCK_LIMIT - newAttempts
          setPinError(`비밀번호가 틀렸습니다. (${newAttempts}회 오류, ${remaining}회 남음)`)
          track('login_fail', { attempts: newAttempts, store_id: storeId ?? '' })
          ampTrack('login_fail', { attempts: newAttempts, store_id: storeId ?? '' })
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
      ampIdentify(data.account_code, data.account_type)
      ampTrack('pin_login', { account_type: data.account_type, store_id: data.store_id ?? '' })

      // 개인 거래처는 거래처명이 곧 주문자라 물을 게 없다 — 바로 메뉴로.
      // 과·기업만 시트를 올려 "그 안의 누구"를 고르게 한다.
      if (account.type === '개인') {
        // ⚠️ push 가 아니라 **replace** 다.
        //    push 면 PIN 화면이 히스토리에 남아, 메뉴에서 뒤로가기를 누르면 그리로 돌아간다.
        //    QR 종이를 사무실마다 붙여둔 이유가 "들어올 때마다 QR을 찍는다"인데,
        //    뒤로가기로 PIN 화면에 닿을 수 있으면 QR을 배부한 의미가 없다.
        //    replace 면 QR로 열린 탭의 히스토리에 PIN 항목 자체가 남지 않는다.
        setTimeout(() => router.replace('/menu'), 120)
        return
      }
      setPendingAccount(account)
      // 점 네 개가 다 차는 모습을 한 박자 보여주고 시트를 올린다.
      // 바로 띄우면 "PIN 이 맞았나?"를 확인할 틈이 없다.
      setTimeout(() => setSheetOpen(true), 260)
    } finally {
      setVerifying(false)
    }
  }, [pinAttempts, incrementPinAttempts, lockPin, setAccount, setLoginAt, triggerShake, verifying, router, storeName, qrAccountCode, storeId])

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
    // 왜 닫혔는지에 따라 할 말이 다르다. 브레이크는 "조금 뒤에 다시 오면 된다"이고
    // 영업 종료는 "오늘은 끝났다"다 — 같은 문장으로 묶으면 손님이 헛걸음한다.
    const isBreak = closedReason === 'break'
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-8 text-center bg-surface">
        <div className="w-12 h-12 rounded-full bg-[#F5F5F5] flex items-center justify-center mb-5">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="#727272" strokeWidth="1.8" />
            <path d="M12 7.5V12l3 1.8" stroke="#727272" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="text-[20px] font-bold text-[#222222] mb-3">
          {isBreak ? '지금은 브레이크 타임이에요' : '지금은 주문을 받지 않아요'}
        </h2>
        <p className="text-[14px] text-[#727272] leading-relaxed">
          {isBreak && reopenAt
            ? <>{reopenAt}부터 다시 주문할 수 있어요</>
            : closedReason === 'before_open' && reopenAt
              ? <>{reopenAt}에 문을 열어요</>
              : <>가게 운영시간에 다시 방문해 주세요</>}
        </p>
      </div>
    )
  }

  if (storeNotFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-8 text-center bg-surface">
        <div className="text-5xl mb-6">📷</div>
        <h2 className="text-[18px] font-bold text-[#222222] mb-3">매장 QR 코드를 스캔해 주세요</h2>
        <p className="text-[14px] text-[#727272] leading-relaxed">
          매장에 부착된 QR 코드를 스캔하면<br />해당 매장의 선결제 주문 화면으로 이동합니다.
        </p>
      </div>
    )
  }

  // ── 비밀번호 찾기 결과 화면 ──
  if (forgotPin && forgotResult) {
    return (
      <div className="flex flex-col min-h-screen bg-surface px-6 pt-16">
        <button
          onClick={() => { setForgotPin(false); setForgotResult(null); setForgotName(''); setForgotPhone('') }}
          className="-ml-3 p-3 mb-10 self-start"
        >
          <svg width="9" height="15" viewBox="0 0 9 15" fill="none"><path d="M8 1L1 7.5L8 14" stroke="#222222" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div className="flex flex-col gap-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-2"
            style={{ background: 'linear-gradient(135deg, #02a84e 0%, #017333 60%, #015a28 100%)' }}>
            <span className="text-white text-3xl font-bold leading-none">✓</span>
          </div>
          <p className="text-[22px] font-bold text-[#222222] leading-snug">
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
      <div className="flex flex-col min-h-screen bg-surface px-6 pt-16">
        <button
          onClick={() => { setForgotPin(false); setForgotError('') }}
          className="-ml-3 p-3 mb-8 self-start"
        >
          <svg width="9" height="15" viewBox="0 0 9 15" fill="none"><path d="M8 1L1 7.5L8 14" stroke="#222222" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h1 className="text-[22px] font-bold text-[#222222] leading-snug mb-8">
          선결제 고객 확인을 위해<br />인증을 진행해 주세요
        </h1>

        <div className="flex flex-col gap-4">
          <div>
            <input
              type="text"
              value={forgotName}
              onChange={e => { setForgotName(e.target.value); setForgotError('') }}
              placeholder="대표자 이름"
              className="w-full border border-[#D7D7D7] rounded-xl px-4 py-3.5 text-[15px] text-[#222222] placeholder-[#C0C0C0] focus:outline-none focus:border-[#017333]"
            />
          </div>
          <div>
            <input
              type="tel"
              inputMode="numeric"
              value={forgotPhone}
              onChange={e => { setForgotPhone(formatPhone(e.target.value)); setForgotError('') }}
              placeholder="휴대폰 번호 (010-0000-0000)"
              className="w-full border border-[#D7D7D7] rounded-xl px-4 py-3.5 text-[15px] text-[#222222] placeholder-[#C0C0C0] focus:outline-none focus:border-[#017333]"
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
      <div className="flex items-center justify-center min-h-screen bg-surface">
        <LoadingTimer size={40} />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-surface">
      {searchParams.get('expired') === '1' && (
        <div className="mx-5 mt-5 px-4 py-3 rounded-xl bg-[#FFF0F0]">
          <p className="text-[13px] font-normal text-[#C92A2A] text-left leading-relaxed">
            주문 시간(10분)이 지났어요. 비밀번호를 다시 입력해주세요.
          </p>
        </div>
      )}

      {/* 맨 위에 매장명 — 좌측정렬.
          '선결제 비밀번호를 입력해 주세요'를 빼고 그 28px 포맷을 매장명이 물려받았다.
          네 칸짜리 점과 숫자패드가 바로 아래 있어서 "비밀번호를 치라"는 말은 없어도 읽히고,
          대신 "여기가 어느 가게인지"는 글자로만 알 수 있어서 그쪽을 세운다. */}
      <div className="px-6 pt-[52px] pb-8">
        <h1 className="text-[28px] font-bold text-[#222222] leading-tight break-keep">
          {storeName}
        </h1>
      </div>

      <div className={`flex justify-center gap-5 mb-2 mt-12 ${isShaking ? 'shake' : ''}`}>
        {[0, 1, 2, 3].map(i => {
          const filled = i < pin.length
          const hasError = !!pinError
          return (
            <div key={i} className="w-[36px] h-[10px] flex items-center justify-center">
              {filled ? (
                <div className={`w-[10px] h-[10px] rounded-full transition-all duration-150 ${hasError ? 'bg-[#C92A2A]' : 'bg-[#222222]'}`} />
              ) : (
                <div className="w-full h-[2px] bg-[#D7D7D7] rounded-sm" />
              )}
            </div>
          )
        })}
      </div>

      <div className="min-h-[20px] mb-2" />

      {/* 로딩 오버레이 */}
      {verifying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface">
          <LoadingTimer size={44} />
        </div>
      )}

      {/* 에러 토스트 */}
      <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        toastVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'
      }`}>
        <div className="bg-[#FFF0F0] text-[#C92A2A] text-[13px] font-semibold px-5 py-3 rounded-2xl shadow-lg whitespace-nowrap">
          {pinError}
        </div>
      </div>

      <div className="px-6 flex-1 pt-5">
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
                  disabled={isLocked}
                  className="h-[68px] rounded-2xl text-[22px] flex items-center justify-center select-none disabled:opacity-40"
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
                disabled={verifying || isLocked}
                className="h-[68px] rounded-2xl text-[22px] font-semibold text-[#222222] flex items-center justify-center select-none active:bg-[#F0F0F0] transition-colors disabled:opacity-40"
              >
                {key}
              </button>
            )
          })}
        </div>
        {/* 비밀번호 찾기 — 0 버튼 바로 아래 */}
        <div className="grid grid-cols-3 mt-1">
          <div />
          <div className="flex justify-center">
            <button
              onClick={() => { setForgotPin(true); setForgotError(''); setForgotName(''); setForgotPhone(''); setForgotResult(null) }}
              className="text-[13px] text-[#727272] underline underline-offset-2 py-2 whitespace-nowrap"
            >
              비밀번호를 잊으셨나요?
            </button>
          </div>
          <div />
        </div>
      </div>

      <div className="flex justify-center pb-6 pt-1">
        <a
          href="/privacy"
          className="text-[11px] text-[#AAAAAA] underline underline-offset-2"
        >
          개인정보처리방침
        </a>
      </div>

      {/* 주문자 선택 — PIN 통과 뒤 이 화면 위로 올라온다.
          onClose 를 주지 않는다: 아직 아무도 안 골랐으니 밖을 눌러 닫아버리면
          "인증은 됐는데 아무 데도 못 가는" 상태가 된다. 나가는 길은 선택 또는 '명단에 없어요'뿐. */}
      <OrdererSheet
        open={sheetOpen}
        accountCode={pendingAccount?.code ?? ''}
        pin={pendingAccount?.pin ?? ''}
        onPick={async m => {
          setSheetOpen(false)
          setOrderer(m.name)
          // 전화번호는 member_contact RPC 로 받는다.
          // account_members 를 직접 select 하면 **anon 은 한 줄도 못 읽는다** —
          // 그 테이블의 anon 정책이 accounts 서브쿼리를 타는데 anon 은 accounts 권한이 없다.
          // 실패해도 주문은 막지 않는다. 이름만 있으면 체크아웃에서 번호만 받으면 된다.
          try {
            const { data: phone } = await getSupabaseClient().rpc('member_contact', {
              p_account_code: pendingAccount?.code ?? '',
              p_pin:          pendingAccount?.pin ?? '',
              p_member_id:    m.id,
            })
            if (typeof phone === 'string' && phone) setPhone(phone)
          } catch { /* 번호는 없어도 진행 */ }
          router.replace('/menu')
        }}
        onSkip={() => { setSheetOpen(false); router.replace('/menu') }}
      />
    </div>
  )
}
