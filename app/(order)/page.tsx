'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionStore } from '@/lib/store/session'
import { useCartStore } from '@/lib/store/cart'
import { ACCOUNTS } from '@/lib/mock-data'
import { formatWon } from '@/lib/utils'
import type { Account } from '@/lib/types'

const PIN_LOCK_LIMIT = 5

type Step = 'pin' | 'orderer'

export default function HomePage() {
  const router = useRouter()
  const { setAccount, setOrderer, setPhone, pinAttempts, pinLocked, incrementPinAttempts, lockPin, resetSession } = useSessionStore()
  const clearCart = useCartStore(s => s.clearCart)

  const [step, setStep] = useState<Step>('pin')
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [isShaking, setIsShaking] = useState(false)
  const [matchedAccount, setMatchedAccount] = useState<Account | null>(null)
  const [ordererName, setOrdererName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')

  // 세션 초기화 (새 QR 스캔)
  useEffect(() => {
    resetSession()
    clearCart()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // PIN이 잠긴 상태 처리
  const isLocked = pinLocked || pinAttempts >= PIN_LOCK_LIMIT

  const triggerShake = useCallback(() => {
    setIsShaking(true)
    setTimeout(() => setIsShaking(false), 400)
  }, [])

  const verifyPin = useCallback((inputPin: string) => {
    const found = ACCOUNTS.find(a => a.pin === inputPin)
    if (found) {
      setMatchedAccount(found)
      setAccount(found)
      setPinError('')
      setTimeout(() => setStep('orderer'), 120)
    } else {
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
    }
  }, [pinAttempts, incrementPinAttempts, lockPin, setAccount, triggerShake])

  const handleNumpad = useCallback((val: string) => {
    if (isLocked) return
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
  }, [pin, isLocked, verifyPin])

  // 전화번호 자동 하이픈 포맷 (010-0000-0000)
  function formatPhone(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 11)
    if (digits.length <= 3) return digits
    if (digits.length <= 7) return `${digits.slice(0,3)}-${digits.slice(3)}`
    return `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`
  }

  // 010-XXXX-XXXX 형식 완성 여부
  const isPhoneValid = phoneNumber.replace(/\D/g, '').length === 11

  const handleOrdererSubmit = useCallback(() => {
    if (!ordererName.trim() || !isPhoneValid || !matchedAccount) return
    setOrderer(ordererName.trim())
    setPhone(phoneNumber)
    router.push('/menu')
  }, [ordererName, isPhoneValid, phoneNumber, matchedAccount, setOrderer, setPhone, router])

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

  // ── 주문자 입력 (Step 2) ──
  if (step === 'orderer' && matchedAccount) {
    return (
      <div className="flex flex-col h-screen bg-white">
        {/* 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto">
          {/* 헤더 */}
          <div className="flex items-center px-5 pt-12 pb-4">
            <button
              onClick={() => { setStep('pin'); setPin(''); setPinError('') }}
              className="p-2 -ml-2 text-[#1E1E1E] text-xl"
              aria-label="뒤로"
            >
              ←
            </button>
          </div>

          {/* 거래처 확인 배지 */}
          <div className="px-5 mb-6">
            <div className="bg-[#E6F4EC] rounded-xl px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[#017333] font-bold text-lg">✓</span>
                <span className="text-[14px] font-semibold text-[#017333]">{matchedAccount.name}</span>
              </div>
              <span className={[
                'text-[13px] font-bold',
                matchedAccount.balance < 30000 ? 'text-[#C92A2A]' : 'text-[#017333]',
              ].join(' ')}>
                잔액 {formatWon(matchedAccount.balance)}
              </span>
            </div>
          </div>

          {/* 안내 텍스트 */}
          <div className="px-5 mb-8">
            <h1 className="text-[22px] font-bold text-[#1E1E1E] mb-2">주문자 정보를 입력해 주세요</h1>
            <p className="text-[14px] text-[#727272]">메뉴 준비 중 연락이 필요할 수 있어요.</p>
          </div>

          {/* 입력 필드 */}
          <div className="px-5 space-y-8 pb-8">
            {/* 이름 */}
            <div>
              <label className="text-[12px] font-semibold text-[#727272] mb-1.5 block">이름</label>
              <input
                type="text"
                value={ordererName}
                onChange={e => setOrdererName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleOrdererSubmit()}
                placeholder="예: 김지은"
                maxLength={20}
                autoFocus
                className="w-full border-b-2 border-[#017333] py-3 text-[18px] text-[#1E1E1E] placeholder-[#D7D7D7] outline-none bg-transparent"
              />
            </div>

            {/* 전화번호 */}
            <div>
              <label className="text-[12px] font-semibold text-[#727272] mb-1.5 block">전화번호</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={e => setPhoneNumber(formatPhone(e.target.value))}
                onKeyDown={e => e.key === 'Enter' && handleOrdererSubmit()}
                placeholder="010-0000-0000"
                inputMode="numeric"
                className="w-full border-b-2 border-[#D7D7D7] py-3 text-[18px] text-[#1E1E1E] placeholder-[#D7D7D7] outline-none bg-transparent focus:border-[#017333] transition-colors"
              />
            </div>
          </div>
        </div>

        {/* 하단 버튼 */}
        <div
          className="px-5 py-5 bg-white flex-shrink-0"
          style={{ boxShadow: '0 -4px 20px rgba(0,0,0,0.08)' }}
        >
          <button
            onClick={handleOrdererSubmit}
            disabled={!ordererName.trim() || !isPhoneValid}
            className="w-full py-[17px] bg-[#1E1E1E] text-white rounded-xl text-base font-bold disabled:bg-[#CCC] disabled:cursor-not-allowed transition-colors"
          >
            메뉴 보기
          </button>
        </div>
      </div>
    )
  }

  // ── PIN 입력 (Step 1) ──
  const numpadRows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'del'],
  ]

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* 로고 */}
      <div className="flex flex-col items-center pt-16 pb-4 px-5">
        <div className="text-[28px] font-bold text-[#017333] mb-1">🥗 샐러리아 침산점</div>
      </div>

      {/* 안내 텍스트 */}
      <div className="text-center px-8 mb-10">
        <h1 className="text-[20px] font-bold text-[#1E1E1E] mb-2">선결제 비밀번호를 입력해 주세요</h1>
        <p className="text-[13px] text-[#727272] leading-relaxed">
          거래처에 전달받은 4자리 숫자를 아래에 입력해 주세요.
        </p>
      </div>

      {/* PIN 도트 */}
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

      {/* 에러 메시지 */}
      <div className="text-center min-h-[20px] mb-6 px-8">
        {pinError && (
          <p className="text-[13px] text-[#C92A2A] font-medium">{pinError}</p>
        )}
      </div>

      {/* 숫자 패드 */}
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
                className="h-[68px] bg-[#FAFAFA] rounded-2xl text-[22px] font-semibold text-[#1E1E1E] flex items-center justify-center select-none active:bg-[#E8E8E8] transition-colors"
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
