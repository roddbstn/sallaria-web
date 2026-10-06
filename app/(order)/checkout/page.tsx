'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useCartStore } from '@/lib/store/cart'
import { useSessionStore } from '@/lib/store/session'
import { formatWon, formatOptionsLabel, DELIVERY_FEE } from '@/lib/utils'
import type { OrderMethod, OrderItemPayload } from '@/lib/types'
import { getSupabaseClient } from '@/lib/supabase/client'
import { track, setGAUserId } from '@/lib/firebase'
import { ampTrack } from '@/lib/amplitude'

declare global {
  interface Window {
    daum: {
      Postcode: new (opts: { oncomplete: (d: any) => void }) => { open: () => void }
    }
  }
}

const DEFAULT_DELIVERY_REMARK = '전화주시면 마중 나갈게요.'
const DELIVERY_REMARK_OPTIONS = [
  '문 앞에 두고 초인종 눌러주세요.',
  '문 앞에 두고 노크해주세요.',
  '초인종, 노크 없이 문 앞에만 놔주세요.',
  '직접 받을게요.',
  '전화주시면 마중 나갈게요.',
  '직접 입력',
]

const METHOD_OPTIONS: { value: OrderMethod; label: string; emoji: string; extra?: string }[] = [
  { value: '포장', label: '포장', emoji: '🛍️' },
  { value: '내점', label: '매장 식사', emoji: '🍽️' },
  { value: '배달', label: '배달', emoji: '🛵', extra: `+${formatWon(DELIVERY_FEE)}~` },
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
    deliveryDistanceM,
    deliveryLat,
    deliveryLng,
    setDeliveryCalculation,
  } = useCartStore()
  const { account, setAccount, setOrderer, setPhone } = useSessionStore()

  const [ordererName, setOrdererName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [baseAddress, setBaseAddress] = useState('')
  const [detailAddress, setDetailAddress] = useState('')
  const [deliveryRemarks, setDeliveryRemarks] = useState(DEFAULT_DELIVERY_REMARK)
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)
  const [draftOption, setDraftOption] = useState(DEFAULT_DELIVERY_REMARK)
  const [draftCustomText, setDraftCustomText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [privacyAgreed, setPrivacyAgreed] = useState(false)
  const [deliveryCalculating, setDeliveryCalculating] = useState(false)
  const [deliveryCalcError,  setDeliveryCalcError]  = useState('')

  // 이전 주문자 자동완성 칩
  const [members, setMembers] = useState<{ id: string; name: string; phone: string | null; order_count: number }[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)

  // 이전 주문자 목록 로드 (과/기업 거래처만)
  useEffect(() => {
    if (!account || account.type === '개인') return
    const supabase = getSupabaseClient()
    supabase
      .from('account_members')
      .select('id, name, phone, order_count')
      .eq('account_code', account.code)
      .order('order_count', { ascending: false })
      .limit(10)
      .then(({ data }: { data: typeof members | null }) => {
        if (data && data.length > 0) setMembers(data)
      })
  }, [account?.code])

  // Kakao 우편번호 스크립트 동적 로드
  useEffect(() => {
    const scriptId = 'kakao-postcode'
    if (document.getElementById(scriptId)) return
    const script = document.createElement('script')
    script.id = scriptId
    script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'
    script.async = true
    document.body.appendChild(script)
  }, [])

  // 도로명주소 설정 즉시(상세주소 입력 전) 거리별 배달팁 계산 — 대기화면 없이 백그라운드로 처리
  async function calculateDelivery(road: string) {
    if (!account?.storeId) {
      setDeliveryCalcError('매장 정보를 확인할 수 없어요. 처음부터 다시 접속해 주세요.')
      return
    }
    setDeliveryCalculating(true)
    setDeliveryCalcError('')
    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase.functions.invoke('calculate-delivery-fee', {
        body: { store_id: account.storeId, road_address: road },
      })
      if (error || !data?.delivery_fee) {
        setDeliveryCalcError(data?.error ?? '배달팁 계산에 실패했어요. 주소를 다시 확인해 주세요.')
        setDeliveryCalculation(null, null)
        return
      }
      setDeliveryCalculation(data.delivery_fee, data.distance_m, data.lat, data.lng)
    } catch {
      setDeliveryCalcError('배달팁 계산에 실패했어요. 주소를 다시 확인해 주세요.')
      setDeliveryCalculation(null, null)
    } finally {
      setDeliveryCalculating(false)
    }
  }

  function openAddressSearch() {
    new window.daum.Postcode({
      oncomplete: (data: any) => {
        const road = data.roadAddress || data.autoRoadAddress || data.jibunAddress || ''
        setBaseAddress(road)
        setDeliveryCalcError('')
        setDeliveryCalculation(null, null)
        track('delivery_address_search', { filled: road.length > 0 })
        ampTrack('delivery_address_search', { filled: road.length > 0 })
        if (road) calculateDelivery(road)
      },
    }).open()
  }

  function formatPhone(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 11)
    if (digits.length <= 3) return digits
    if (digits.length <= 7) return `${digits.slice(0,3)}-${digits.slice(3)}`
    return `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`
  }

  function maskPhone(raw: string | null): string {
    if (!raw) return ''
    const digits = raw.replace(/\D/g, '')
    if (digits.length < 8) return raw
    return `${digits.slice(0,3)}-****-${digits.slice(-4)}`
  }

  // 칩 선택 시 입력 필드는 마스킹 표시 — 실제 번호는 members 배열에서 직접 참조
  const isPhoneValid = selectedMemberId
    ? !!members.find(m => m.id === selectedMemberId)?.phone
    : phoneNumber.replace(/\D/g, '').length === 11

  function openDeliveryModal() {
    const isPredefined = DELIVERY_REMARK_OPTIONS.slice(0, -1).includes(deliveryRemarks)
    if (isPredefined) {
      setDraftOption(deliveryRemarks)
      setDraftCustomText('')
    } else {
      setDraftOption('직접 입력')
      setDraftCustomText(deliveryRemarks)
    }
    setShowDeliveryModal(true)
  }

  function closeDeliveryModal() {
    setShowDeliveryModal(false)
  }

  function confirmDeliveryOption() {
    if (draftOption === '직접 입력') {
      setDeliveryRemarks(draftCustomText.trim() || DEFAULT_DELIVERY_REMARK)
    } else {
      setDeliveryRemarks(draftOption)
    }
    setShowDeliveryModal(false)
  }

  function handleTag(label: string) {
    const active = remarks.includes(label)
    function remove(str: string, tag: string) {
      return str.replace(tag, '').replace(/^,\s*|,\s*$|,\s*,/g, '').trim()
    }
    if (active) {
      setRemarks(remove(remarks, label))
    } else {
      // 수저·포크 O / X 는 상호 배타적
      const partner = label === '수저·포크 O' ? '수저·포크 X'
                    : label === '수저·포크 X' ? '수저·포크 O'
                    : null
      const base = partner ? remove(remarks, partner) : remarks
      setRemarks(base ? `${base}, ${label}` : label)
    }
  }

  // 개인 거래처는 account.name이 곧 주문자 — 이름/전화번호 입력 불필요
  const isPersonal = account?.type === '개인'

  const currentBalance = account?.balance ?? 0
  const subtotal = totalSubtotal()
  const fee = deliveryFee()
  const total = totalAmount()
  const afterBalance = currentBalance - total
  const isNegative = afterBalance < 0

  async function handleOrder() {
    if (!account || !method || items.length === 0) return
    if (!isPersonal && (!ordererName.trim() || !isPhoneValid)) return
    if (method === '배달' && (!baseAddress.trim() || deliveryCalculating || deliveryCalcError)) return
    setIsSubmitting(true)

    const finalOrderer = isPersonal ? account.name : ordererName.trim()
    // GA user_id 설정 — 이후 Firebase Analytics에서 사용자별 행동 추적 가능
    setGAUserId(account.code, finalOrderer)
    // 칩 선택 시 phoneNumber는 마스킹 표시 — 실제 번호는 members 배열에서 가져옴
    const realPhone    = selectedMemberId
      ? (members.find(m => m.id === selectedMemberId)?.phone ?? phoneNumber)
      : phoneNumber
    const finalPhone   = isPersonal ? (account.contactPhone ?? '') : realPhone
    setOrderer(finalOrderer)
    setPhone(finalPhone)

    // ── 1. RPC 페이로드 미리 구성 ──
    const payload: OrderItemPayload[] = items.map((item) => ({
      menu_id:         item.menuCode,
      menu_name:       item.menuName,
      quantity:        item.qty,
      unit_price:      item.basePrice + item.selectedOptions.reduce((s, o) => s + o.plus, 0),
      option_item_ids: item.selectedOptions.map((o) => o.optionId),
      option_names:    item.selectedOptions.map((o) => o.optionName),
      option_prices:   item.selectedOptions.map((o) => o.plus),
    }))

    const rpcNote = (() => {
      const parts: string[] = []
      if (method === '배달' && baseAddress.trim())    parts.push(`[배달주소] ${baseAddress.trim()}`)
      if (method === '배달' && detailAddress.trim())  parts.push(`[배달상세] ${detailAddress.trim()}`)
      if (method === '배달' && deliveryRemarks.trim()) parts.push(`[배달요청] ${deliveryRemarks.trim()}`)
      if (remarks.trim()) parts.push(remarks.trim())
      return parts.length > 0 ? parts.join(' / ') : null
    })()

    // ── 2. 즉시 /success 이동 (낙관적 네비게이션) ──
    const tempCode = `TEMP-${Date.now()}`

    sessionStorage.removeItem('last_order_accepted_at')
    sessionStorage.removeItem('last_order_total_seconds')
    sessionStorage.removeItem('last_order_rejected')
    sessionStorage.removeItem('last_order_rej_reason')
    sessionStorage.removeItem('last_order_failed')
    sessionStorage.removeItem('last_order_fail_reason')

    sessionStorage.setItem('last_order_code',           tempCode)
    sessionStorage.setItem('last_order_number',         '')   // RPC 완료 후 업데이트
    sessionStorage.setItem('last_order_method',         method!)
    sessionStorage.setItem('last_order_delivery_fee',   String(fee))
    sessionStorage.setItem('last_order_delivery_distance_m', deliveryDistanceM != null ? String(deliveryDistanceM) : '')
    sessionStorage.setItem('last_order_total',          String(total))
    sessionStorage.setItem('last_order_orderer',        finalOrderer)
    sessionStorage.setItem('last_order_phone',          finalPhone)
    sessionStorage.setItem('last_order_account',        account!.name)
    sessionStorage.setItem('last_order_items',          JSON.stringify(items))
    sessionStorage.setItem('last_order_balance_before', String(currentBalance))
    sessionStorage.setItem('last_order_balance_after',  String(afterBalance))

    setAccount({ ...account!, balance: afterBalance })
    clearCart()
    router.push('/success')  // 즉시 이동 — 아래 RPC는 백그라운드 실행

    // ── 3. 데모 모드: demo_orders 테이블에 INSERT 후 성공 이벤트 ──
    if (account.isDemo) {
      const supabase = getSupabaseClient()
      const demoItems = items.map(item => ({
        name: item.menuName,
        qty: item.qty,
        options: item.selectedOptions.map((o: { optionName: string }) => o.optionName).filter(Boolean).join(', '),
        price: item.subtotal,
      }))

      const { data: demoOrder } = await supabase
        .from('demo_orders')
        .insert({
          account_name: account.name,
          orderer: finalOrderer || '익명',
          method: method || '포장',
          items: demoItems,
          subtotal: subtotal,
          delivery_fee: fee,
          total: total,
        })
        .select('id')
        .single()

      const demoCode = demoOrder?.id ?? `DEMO-${Date.now()}`
      sessionStorage.setItem('last_order_code',   demoCode)
      sessionStorage.setItem('last_order_number', 'D001')
      window.dispatchEvent(new CustomEvent('order_rpc_done', {
        detail: { order_code: demoCode, order_number: 'D001' },
      }))
      return
    }

    // ── 4. 백그라운드 RPC (keepalive fetch — navigation 후에도 요청 유지) ──
    try {
      const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_order`, {
        method:    'POST',
        keepalive: true,          // navigation 중에도 요청 살아있음
        headers: {
          'Content-Type':  'application/json',
          'apikey':        SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer':        'return=representation',
        },
        body: JSON.stringify({
          p_account_code:  account.code,
          p_orderer_name:  finalOrderer,
          p_orderer_phone: finalPhone,
          p_method:        method,
          p_items:         payload,
          p_delivery_fee:  fee,
          p_note:          rpcNote,
          ...(method === '배달' ? {
            p_delivery_road_address:   baseAddress.trim() || null,
            p_delivery_detail_address: detailAddress.trim() || null,
            p_delivery_lat:            deliveryLat,
            p_delivery_lng:            deliveryLng,
            p_delivery_distance_m:     deliveryDistanceM,
          } : {}),
        }),
      })

      const data = await res.json().catch(() => null)
      const rpcError = res.ok ? null : data

      if (!res.ok || !data) {
        console.error('[checkout] RPC error:', rpcError)
        const rawMessage = typeof data?.message === 'string' ? data.message : null
        const reason = rawMessage === 'STORE_CLOSED'
          ? '가게 운영이 종료되어 주문할 수 없습니다.'
          : rawMessage?.startsWith('배달팁 금액이 일치하지 않습니다')
          ? '배달팁 정보가 변경됐어요. 배달 주소를 다시 검색한 후 주문해 주세요.'
          : rawMessage ?? '주문 처리에 실패했습니다.'
        // 주문 실패 — 낙관적으로 차감했던 값 그대로일 때만 원복
        // (그 사이 충전 등으로 잔액이 이미 다른 값으로 바뀌었으면 덮어쓰지 않음)
        const latestAfterFail = useSessionStore.getState().account
        if (latestAfterFail && latestAfterFail.balance === afterBalance) {
          setAccount(account)
        }
        sessionStorage.setItem('last_order_failed',      '1')
        sessionStorage.setItem('last_order_fail_reason', reason)
        window.dispatchEvent(new CustomEvent('order_rpc_failed', { detail: { reason } }))
        track('order_fail', { error: reason })
        ampTrack('order_fail', { error: reason })
        return
      }

      // Supabase REST RPC는 배열 또는 단일 객체로 반환
      const result = (Array.isArray(data) ? data[0] : data) as { order_code: string; order_number: string }

      // sessionStorage 실제 코드로 업데이트
      sessionStorage.setItem('last_order_code',   result.order_code)
      sessionStorage.setItem('last_order_number', result.order_number)

      // localStorage 주문 이력 저장
      try {
        const prev = JSON.parse(localStorage.getItem('sallaria_order_history') ?? '[]')
        const entry = {
          order_code:   result.order_code,
          order_number: result.order_number,
          account_name: account!.name,
          orderer_name: finalOrderer,
          ordered_at:   new Date().toISOString(),
          total_amount: total,
          method:       method!,
        }
        localStorage.setItem('sallaria_order_history', JSON.stringify([entry, ...prev].slice(0, 20)))
      } catch { /* ignore */ }

      // success 페이지에 결과 전달
      window.dispatchEvent(new CustomEvent('order_rpc_done', {
        detail: { order_code: result.order_code, order_number: result.order_number },
      }))

      track('purchase', {
        transaction_id: result.order_code,
        value:          total,
        currency:       'KRW',
        items:          items.map(i => ({ item_name: i.menuName, quantity: i.qty, price: i.basePrice })),
        method,
      })
      ampTrack('purchase', { order_code: result.order_code, total, method })
    } catch (err) {
      console.error('[checkout] unexpected error:', err)
      const reason = '주문 처리에 실패했습니다.'
      // 주문 실패 — 낙관적으로 차감했던 값 그대로일 때만 원복
      const latestAfterCatch = useSessionStore.getState().account
      if (latestAfterCatch && latestAfterCatch.balance === afterBalance) {
        setAccount(account)
      }
      sessionStorage.setItem('last_order_failed',      '1')
      sessionStorage.setItem('last_order_fail_reason', reason)
      window.dispatchEvent(new CustomEvent('order_rpc_failed', { detail: { reason } }))
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
      <header className="flex items-center h-14 px-5 border-b border-[#D7D7D7] flex-shrink-0">
        <button
          onClick={() => router.back()}
          className="-ml-3 p-3 rounded-full hover:bg-[#F5F5F5] transition-colors"
          aria-label="뒤로가기"
        >
          <svg width="9" height="15" viewBox="0 0 9 15" fill="none"><path d="M8 1L1 7.5L8 14" stroke="#222222" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h1 className="flex-1 text-center text-base font-bold text-[#222222] pr-9">
          주문 확인
        </h1>
      </header>

      {/* 데모 모드 배너 */}
      {account?.isDemo && (
        <div className="bg-[#222222] text-white text-center text-[12px] font-semibold py-2 px-4 flex-shrink-0">
          🎮 데모 모드 — 실제 주문은 접수되지 않습니다
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* 거래처 + 주문자 입력 */}
        <section className="space-y-3">
          <p className="text-base font-bold text-[#222222]">{account?.name}</p>
          {!isPersonal && (
            <>
              {/* 이전 주문자 칩 */}
              {members.length > 0 && (
                <div>
                  <p className="text-[12px] font-semibold text-[#727272] mb-2">이전 주문자</p>
                  <div className="flex flex-wrap gap-2">
                    {members.map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setOrdererName(m.name)
                          setPhoneNumber(maskPhone(m.phone))  // 입력 필드엔 마스킹 표시
                          setSelectedMemberId(m.id)
                          track('member_chip_click', { account_code: account?.code ?? '' })
                          ampTrack('member_chip_click', { account_code: account?.code ?? '' })
                        }}
                        className={`px-3 py-1.5 rounded-full text-[13px] font-semibold border transition-colors ${
                          selectedMemberId === m.id
                            ? 'bg-[#222222] text-white border-[#222222]'
                            : 'bg-[#F5F5F5] text-[#222222] border-transparent'
                        }`}
                      >
                        {m.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="text-[12px] font-semibold text-[#727272] mb-1.5 block">
                  이름 <span className="text-[#C92A2A]">*</span>
                </label>
                <input
                  type="text"
                  value={ordererName}
                  onChange={e => { setOrdererName(e.target.value); setSelectedMemberId(null) }}
                  onBlur={e => { track('name_input', { filled: e.target.value.trim().length > 0 }); ampTrack('name_input', { filled: e.target.value.trim().length > 0 }) }}
                  placeholder="예: 김지은"
                  maxLength={20}
                  className="w-full border border-[#D7D7D7] rounded-xl px-4 py-3 text-sm text-[#222222] placeholder:text-[#D7D7D7] outline-none focus:border-[#222222] transition-colors"
                />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-[#727272] mb-1.5 block">
                  전화번호 <span className="text-[#C92A2A]">*</span>
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={e => { setPhoneNumber(formatPhone(e.target.value)); setSelectedMemberId(null) }}
                  onBlur={e => { track('phone_input', { valid: e.target.value.replace(/\D/g, '').length === 11 }); ampTrack('phone_input', { valid: e.target.value.replace(/\D/g, '').length === 11 }) }}
                  placeholder="010-0000-0000"
                  inputMode="numeric"
                  className="w-full border border-[#D7D7D7] rounded-xl px-4 py-3 text-sm text-[#222222] placeholder:text-[#D7D7D7] outline-none focus:border-[#222222] transition-colors"
                />
              </div>
            </>
          )}
        </section>

        {/* 이용방법 선택 */}
        <section>
          <h2 className="text-sm font-bold text-[#222222] mb-2">이용방법</h2>
          <div className="flex gap-2">
            {METHOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { track('method_select', { method: opt.value }); ampTrack('method_select', { method: opt.value }); setMethod(opt.value) }}
                className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${
                  method === opt.value
                    ? 'bg-[#E6F4EC] text-[#017333]'
                    : 'bg-[#F5F5F5] text-[#222222]'
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

        {/* 배달 주소 + 배달 요청사항 (배달 선택 시에만) */}
        {method === '배달' && (
          <section className="space-y-3">
            <div>
              <label className="text-sm font-bold text-[#222222] mb-2 block">
                배달 주소 <span className="text-[#C92A2A]">*</span>
              </label>
              {/* 도로명 주소 검색 */}
              <div className="flex gap-2 mb-2">
                <div className="flex-1 border border-[#D7D7D7] rounded-xl px-4 py-3 text-sm bg-[#FAFAFA] text-[#222222] min-h-[48px] flex items-center">
                  {baseAddress ? (
                    <span>{baseAddress}</span>
                  ) : (
                    <span className="text-[#D7D7D7]">도로명 주소</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={openAddressSearch}
                  className="flex-shrink-0 px-4 py-3 bg-[#222222] text-white text-sm font-semibold rounded-xl active:scale-95 transition-transform"
                >
                  주소 검색
                </button>
              </div>
              {/* 상세주소 입력 */}
              <input
                type="text"
                value={detailAddress}
                onChange={e => setDetailAddress(e.target.value)}
                placeholder="예: 2층, 101호"
                maxLength={60}
                className="w-full border border-[#D7D7D7] rounded-xl px-4 py-3 text-sm text-[#222222] placeholder:text-[#D7D7D7] outline-none focus:border-[#222222] transition-colors"
              />
              {/* 거리별 배달팁 계산 상태 */}
              {deliveryCalculating && (
                <p className="mt-1.5 text-xs text-[#727272]">배달팁 계산 중...</p>
              )}
              {!deliveryCalculating && deliveryCalcError && (
                <p className="mt-1.5 text-xs text-[#C92A2A]">{deliveryCalcError}</p>
              )}
              {!deliveryCalculating && !deliveryCalcError && baseAddress && deliveryDistanceM != null && (
                <p className="mt-1.5 text-xs text-[#727272]">
                  매장에서 약 {deliveryDistanceM >= 1000 ? `${(deliveryDistanceM / 1000).toFixed(1)}km` : `${deliveryDistanceM}m`} · 배달팁 {formatWon(fee)}
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-bold text-[#222222] mb-2 block">배달 요청사항</label>
              <button
                type="button"
                onClick={openDeliveryModal}
                className="w-full border border-[#D7D7D7] rounded-xl px-4 py-3 text-sm text-[#222222] flex items-center justify-between text-left"
              >
                <span className="flex-1 truncate">{deliveryRemarks}</span>
                <svg className="flex-shrink-0 ml-2 w-4 h-4 text-[#727272]" viewBox="0 0 16 16" fill="none">
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </section>
        )}

        {/* 가게 요청사항 */}
        <section>
          <h2 className="text-sm font-bold text-[#222222] mb-2">가게 요청사항</h2>
          {/* 퀵 선택 버튼 */}
          <div className="flex flex-wrap gap-2 mb-2">
            {['수저·포크 O', '수저·포크 X', '소스 따로', '덜 맵게', '견과류 제외'].map((label) => {
              const active = remarks.includes(label)
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => { track('quick_tag_click', { tag: label, active: !remarks.includes(label) }); ampTrack('quick_tag_click', { tag: label, active: !remarks.includes(label) }); handleTag(label) }}
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
            onBlur={e => { if (e.target.value.trim()) { track('remarks_input', { filled: true }); ampTrack('remarks_input', { filled: true }) } }}
            placeholder="직접 입력 (예: 덜 맵게 해주세요)"
            className="w-full px-4 py-3 rounded-xl border border-[#D7D7D7] text-sm text-[#222222] placeholder:text-[#D7D7D7] focus:outline-none focus:border-[#222222] transition-colors"
          />
        </section>

        {/* 주문 메뉴 목록 */}
        <section>
          <h2 className="text-sm font-bold text-[#222222] mb-2">주문 메뉴</h2>
          <div className="space-y-2">
            {items.map((item) => {
              const optionLabel = formatOptionsLabel(item.selectedOptions)
              return (
                <div key={item.cartId} className="flex justify-between text-sm">
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="font-medium text-[#222222]">
                      {item.menuName} × {item.qty}
                    </p>
                    {optionLabel && (
                      <p className="text-xs text-[#727272] mt-0.5 truncate">{optionLabel}</p>
                    )}
                  </div>
                  <p className="font-semibold text-[#222222] flex-shrink-0">
                    {formatWon(item.subtotal)}
                  </p>
                </div>
              )
            })}
          </div>
        </section>

        {/* 결제 내역 카드 */}
        <section className="bg-[#FAFAFA] rounded-xl p-4">
          <h2 className="text-sm font-bold text-[#222222] mb-3">결제 내역</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-[#727272]">
              <span>메뉴 소계</span>
              <span>{formatWon(subtotal)}</span>
            </div>
            <div className="flex justify-between text-[#727272]">
              <span>배달료</span>
              <span>{method === '배달' ? formatWon(fee) : '해당없음'}</span>
            </div>
            <div className="flex justify-between font-bold text-[#222222] pt-2 border-t border-[#D7D7D7]">
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
              <span className="text-[#727272]">주문 후 잔액</span>
              <span className={isNegative ? 'text-[#C92A2A]' : 'text-[#017333]'}>
                {formatWon(afterBalance)}
              </span>
            </div>
          </div>

          {/* 잔액 부족 안내 */}
          {isNegative && (
            <div className="mt-3 px-3 py-2 bg-[#E6F4EC] rounded-lg">
              <p className="text-xs text-[#017333] font-semibold">
                다음 번엔 잔액을 충전해주세요 😊
              </p>
            </div>
          )}
        </section>

      </div>

      {/* 배달 요청사항 바텀 모달 */}
      {showDeliveryModal && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={closeDeliveryModal} />
          <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-surface rounded-t-2xl z-50">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#F0F0F0]">
              <h3 className="text-[16px] font-bold text-[#222222]">배달 요청사항</h3>
              <button
                onClick={closeDeliveryModal}
                className="w-8 h-8 flex items-center justify-center text-[#727272] text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* 라디오 옵션 */}
            <div className="px-5 pt-1 pb-2">
              {DELIVERY_REMARK_OPTIONS.map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-3 py-3.5 border-b border-[#F0F0F0] last:border-0 cursor-pointer"
                  onClick={() => setDraftOption(option)}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    draftOption === option ? 'border-[#222222]' : 'border-[#D7D7D7]'
                  }`}>
                    {draftOption === option && (
                      <div className="w-2.5 h-2.5 rounded-full bg-[#222222]" />
                    )}
                  </div>
                  <span className={`text-[14px] select-none ${draftOption === option ? 'font-semibold text-[#222222]' : 'text-[#727272]'}`}>
                    {option}
                  </span>
                </label>
              ))}

              {/* 직접 입력 텍스트필드 — 부드럽게 나타남 */}
              <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
                draftOption === '직접 입력' ? 'max-h-16 opacity-100 mb-2' : 'max-h-0 opacity-0'
              }`}>
                <input
                  type="text"
                  value={draftCustomText}
                  onChange={e => setDraftCustomText(e.target.value)}
                  placeholder="배달 기사에게 자세하게 요청해주세요"
                  maxLength={20}
                  className="w-full border border-[#D7D7D7] rounded-xl px-4 py-3 text-sm text-[#222222] placeholder:text-[#D7D7D7] outline-none focus:border-[#222222] transition-colors"
                />
              </div>
            </div>

            {/* 완료 버튼 */}
            <div className="px-5 py-4 border-t border-[#F0F0F0]">
              <button
                onClick={confirmDeliveryOption}
                className="w-full py-4 bg-[#222222] text-white rounded-xl font-bold text-base active:scale-95 transition-transform"
              >
                완료
              </button>
            </div>
          </div>
        </>
      )}

      {/* Footer */}
      <footer className="flex-shrink-0 px-4 pt-3 pb-4 border-t border-[#D7D7D7] bg-surface shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        {/* 개인정보 수집 동의 */}
        {!isPersonal && (
          <label className="flex items-start gap-2.5 mb-3 cursor-pointer">
            <div
              onClick={() => setPrivacyAgreed(v => !v)}
              className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 border-2 transition-colors ${
                privacyAgreed ? 'bg-[#222222] border-[#222222]' : 'border-[#D7D7D7]'
              }`}
            >
              {privacyAgreed && <span className="text-white text-[11px] font-bold leading-none">✓</span>}
            </div>
            <span className="text-[12px] text-[#727272] leading-relaxed">
              주문자 이름·전화번호 수집에 동의합니다.{' '}
              <a href="/privacy" className="underline text-[#017333]" onClick={e => e.stopPropagation()}>
                개인정보처리방침
              </a>
            </span>
          </label>
        )}
        <button
          onClick={handleOrder}
          disabled={isSubmitting || !method || (!isPersonal && (!ordererName.trim() || !isPhoneValid || !privacyAgreed)) || (method === '배달' && (!baseAddress.trim() || deliveryCalculating || !!deliveryCalcError))}
          className={`w-full py-4 rounded-xl font-bold text-white text-base transition-colors ${
            isSubmitting || !method || (!isPersonal && (!ordererName.trim() || !isPhoneValid || !privacyAgreed)) || (method === '배달' && (!baseAddress.trim() || deliveryCalculating || !!deliveryCalcError)) ? 'bg-[#CCC] cursor-not-allowed' : 'bg-[#222222] active:scale-95'
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
