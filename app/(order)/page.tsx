'use client'

import { useState, useCallback, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSessionStore } from '@/lib/store/session'
import { useCartStore } from '@/lib/store/cart'
import { getSupabaseClient } from '@/lib/supabase/client'
import type { Account } from '@/lib/types'

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
  const { setAccount, pinAttempts, pinLocked, incrementPinAttempts, lockPin, resetSession } = useSessionStore()
  const clearCart = useCartStore(s => s.clearCart)

  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [isShaking, setIsShaking] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [storeName, setStoreName] = useState('샐러리아')
  // QR로 거래처가 특정된 경우 해당 account_code 저장
  const [qrAccountCode, setQrAccountCode] = useState<string | null>(null)

  // 스토어명 로딩 (PIN 화면에 표시)
  useEffect(() => {
    async function loadStoreName() {
      const supabase = getSupabaseClient()
      const { data } = await supabase.from('stores').select('name').limit(1).maybeSingle()
      if (data?.name) setStoreName(data.name)
    }
    loadStoreName()
  }, [])

  // 세션 초기화 + 거래처 고유 QR 처리 (?account=코드)
  useEffect(() => {
    const accountCode = searchParams.get('account')

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
        .select('account_code, account_number, account_name, account_type, organization_name, current_balance, store_id')
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

  const isLocked = pinLocked || pinAttempts >= PIN_LOCK_LIMIT

  const triggerShake = useCallback(() => {
    setIsShaking(true)
    setTimeout(() => setIsShaking(false), 400)
  }, [])

  const verifyPin = useCallback(async (inputPin: string) => {
    if (verifying) return
    setVerifying(true)
    try {
      const supabase = getSupabaseClient()

      // QR로 거래처가 특정됐으면 해당 거래처 PIN만 확인, 아니면 전체 검색
      let query = supabase
        .from('accounts')
        .select('account_code, account_number, account_name, account_type, organization_name, current_balance, store_id')
        .eq('pin_code', inputPin)
        .eq('is_active', true)

      if (qrAccountCode) {
        query = query.eq('account_code', qrAccountCode)
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
        } else {
          const remaining = PIN_LOCK_LIMIT - newAttempts
          setPinError(`비밀번호가 틀렸습니다. (${newAttempts}회 오류, ${remaining}회 남음)`)
        }
        return
      }

      const account: Account = {
        code:          data.account_code,
        accountNumber: data.account_number,
        name:          data.account_name,
        type:          TYPE_MAP[data.account_type] ?? '기타',
        org:           data.organization_name ?? null,
        balance:       data.current_balance,
        pin:           inputPin,
        storeId:       data.store_id ?? undefined,
        storeName,
      }
      setAccount(account)
      setPinError('')
      setTimeout(() => router.push('/menu'), 120)
    } finally {
      setVerifying(false)
    }
  }, [pinAttempts, incrementPinAttempts, lockPin, setAccount, triggerShake, verifying, router, storeName, qrAccountCode])

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

  // ── PIN 입력 ──
  const numpadRows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'del'],
  ]

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <div className="flex flex-col items-center pt-16 pb-4 px-5">
        <div className="text-[28px] font-bold text-[#017333] mb-1">🥗 {storeName}</div>
      </div>

      <div className="text-center px-8 mb-10">
        <h1 className="text-[20px] font-bold text-[#1E1E1E] mb-2">선결제 비밀번호를 입력해 주세요</h1>
        <p className="text-[13px] text-[#727272] leading-relaxed">
          거래처에 전달받은 4자리 숫자를 아래에 입력해 주세요.
        </p>
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

      <div className="h-8" />
    </div>
  )
}
