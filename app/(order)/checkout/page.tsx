'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useCartStore } from '@/lib/store/cart'
import { useSessionStore } from '@/lib/store/session'
import { formatWon, formatOptionsLabel, DELIVERY_FEE } from '@/lib/utils'
import type { OrderMethod, OrderItemPayload } from '@/lib/types'
import { PICKUP_OPTIONS, needsPickupTime, pickupSummary } from '@/lib/pickup-time'
import { getSupabaseClient } from '@/lib/supabase/client'
import { track, setGAUserId } from '@/lib/firebase'
import { ampTrack } from '@/lib/amplitude'
import { personProps } from '@/lib/person-key'
import ScreenHeader from '@/components/ui/screen-header'

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

// 이모지를 뺐다. 세 칸에 서로 다른 그림이 들어가면 눈이 그림을 먼저 보고 글자를 다시 읽는다 —
// 고를 게 셋뿐이라 글자만으로 충분하고, 선택 상태(초록)가 훨씬 또렷해진다.
const METHOD_OPTIONS: { value: OrderMethod; label: string; extra?: string }[] = [
  { value: '포장', label: '포장' },
  { value: '내점', label: '매장 식사' },
  { value: '배달', label: '배달', extra: `+${formatWon(DELIVERY_FEE)}~` },
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
  const sessionOrderer = useSessionStore(s => s.orderer)
  const sessionPhone   = useSessionStore(s => s.phone)

  const [ordererName, setOrdererName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [baseAddress, setBaseAddress] = useState('')
  const [detailAddress, setDetailAddress] = useState('')
  const [deliveryRemarks, setDeliveryRemarks] = useState(DEFAULT_DELIVERY_REMARK)
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)
  const [draftOption, setDraftOption] = useState(DEFAULT_DELIVERY_REMARK)
  const [draftCustomText, setDraftCustomText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  // 기본 체크. 점주 요청 — 매번 같은 사람이 같은 동의를 다시 누르는 게 번거롭다는 피드백.
  // (참고: 개인정보보호법은 사전 동의를 원칙으로 해서, 미리 체크된 동의는 다툼의 소지가 있다.
  //  해제는 여전히 가능하고, 해제하면 주문 버튼이 잠긴다.)
  const [privacyAgreed, setPrivacyAgreed] = useState(true)
  const [deliveryCalculating, setDeliveryCalculating] = useState(false)
  const [deliveryCalcError,  setDeliveryCalcError]  = useState('')
  // 예상 수령시간 — 포장/내점 필수. null = 아직 안 고름
  const [pickupMinutes, setPickupMinutes] = useState<number | null>(null)

  // 이전 주문자 자동완성 칩
  const [members, setMembers] = useState<{ id: string; name: string; phone: string | null; order_count: number }[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)

  // ── 입구에서 이미 주문자를 고른 경우 ──────────────────────────────────────
  //
  // QR 찍고 명단에서 이름을 고르면 세션에 주문자·전화번호가 들어 있다(루트 화면 참고).
  // 그럼 여기서 또 물을 이유가 없다. 입력칸 두 개를 접고 "이 사람 맞죠?" 한 줄로 바꾼다.
  // 틀렸으면 '변경'으로 열어서 직접 적을 수 있게 둔다 — 접어놓고 못 고치면 막힌 길이 된다.
  const [prefilled, setPrefilled] = useState(false)
  useEffect(() => {
    if (prefilled) return
    // ⚠️ 번호(sessionPhone)까지 있어야 채우도록 했다가, 번호를 못 받아온 경우 이름까지
    //    비어 보이는 버그가 있었다. 입구에서 고른 사람이 있으면 **이름은 무조건** 채운다.
    if (!sessionOrderer) return
    setOrdererName(sessionOrderer)
    if (sessionPhone) setPhoneNumber(sessionPhone)
    // 번호가 없으면 접지 않는다 — 입력칸을 펼쳐서 번호만 받아야 하니까
    if (sessionPhone) setPrefilled(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionOrderer, sessionPhone])

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

  // 칩 선택 시 입력 필드는 마스킹 표시 — 실제 번호는 members 배열에서 직접 참조.
  // prefilled 는 마스킹하지 않고 **실제 번호**를 state 에 넣으므로 아래 11자리 검사를 그대로 탄다
  // (화면에만 마스킹해서 보여준다).
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

  // 포장/내점은 수령시간을 골라야 주문 가능. 배달은 주소가 그 역할을 하고 도착시간이 거리에 달려 있다
  const pickupRequired = needsPickupTime(method)
  const pickupMissing  = pickupRequired && pickupMinutes === null

  // 주문 버튼 차단 조건 — disabled 와 className 두 곳에 똑같이 적었던 긴 식을 한 군데로 모았다.
  // 조건이 늘 때마다 두 곳을 같이 고쳐야 했고, 한쪽만 고치면 "눌리는데 아무 일도 안 나는" 버튼이 된다.
  const orderBlocked =
    isSubmitting ||
    !method ||
    (!isPersonal && (!ordererName.trim() || !isPhoneValid || !privacyAgreed)) ||
    (method === '배달' && (!baseAddress.trim() || deliveryCalculating || !!deliveryCalcError)) ||
    pickupMissing

  async function handleOrder() {
    if (!account || !method || items.length === 0) return
    if (!isPersonal && (!ordererName.trim() || !isPhoneValid)) return
    if (method === '배달' && (!baseAddress.trim() || deliveryCalculating || deliveryCalcError)) return
    if (pickupMissing) return
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
      // 옵션별 수량 — 서버(create_order)가 option_items.max_quantity로 다시 clamp한다
      option_quantities: item.selectedOptions.map((o) => o.qty ?? 1),
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
    sessionStorage.setItem('last_order_pickup_minutes', pickupRequired && pickupMinutes !== null ? String(pickupMinutes) : '')
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
          // 배달은 null — 도착시간이 거리에 달려 있어 고객이 고를 값이 아니다
          p_requested_pickup_minutes: pickupRequired ? pickupMinutes : null,
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
      <ScreenHeader title="주문 확인" onBack={() => router.back()} />

      {/* 데모 모드 배너 */}
      {account?.isDemo && (
        <div className="bg-[#222222] text-white text-center text-[12px] font-semibold py-2 px-4 flex-shrink-0">
          🎮 데모 모드 — 실제 주문은 접수되지 않습니다
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 pt-5 pb-6 space-y-9">
        {/* 거래처 + 주문자 입력 */}
        <section className="space-y-3">
          <p className="text-base font-bold text-[#222222]">{account?.name}</p>
          {/* 입구에서 고른 주문자 — 확인 한 줄로 끝낸다 */}
          {!isPersonal && prefilled && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-[#F5F5F5]">
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-[#222222] truncate">{ordererName}</p>
                <p className="text-[12px] text-[#727272] tabular-nums">{maskPhone(phoneNumber)}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPrefilled(false)
                  setPhoneNumber('')
                  setSelectedMemberId(null)
                  track('orderer_edit', { account_code: account?.code ?? '' })
                  ampTrack('orderer_edit', { account_code: account?.code ?? '' })
                }}
                className="flex-shrink-0 text-[13px] text-[#727272] underline underline-offset-2"
              >
                변경
              </button>
            </div>
          )}
          {!isPersonal && !prefilled && (
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
          <h2 className="text-base font-bold text-[#222222] mb-3">이용방법 <span className="text-[#C92A2A]">*</span></h2>
          <div className="flex gap-2">
            {METHOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { track('method_select', { method: opt.value }); ampTrack('method_select', { method: opt.value }); setMethod(opt.value) }}
                className={`flex-1 h-[56px] rounded-xl text-[14px] font-medium transition-colors flex flex-col items-center justify-center gap-0.5 ${
                  method === opt.value
                    ? 'bg-[#E6F4EC] text-[#017333]'
                    : 'bg-[#F5F5F5] text-[#222222]'
                }`}
              >
                <span>{opt.label}</span>
                {opt.extra && (
                  <span className="text-[12px] text-[#727272]">{opt.extra}</span>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* 예상 수령시간 (포장/내점 선택 시에만 — 배달은 아래 주소 입력이 이 자리를 쓴다) */}
        {pickupRequired && (
          <section>
            <h2 className="text-base font-bold text-[#222222] mb-3">
              예상 수령시간 <span className="text-[#C92A2A]">*</span>
            </h2>
            <div className="grid grid-cols-4 gap-2">
              {PICKUP_OPTIONS.map((opt) => {
                const active = pickupMinutes === opt.minutes
                return (
                  <button
                    key={opt.minutes}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => {
                      // 몇 분을 고르는지 — 주방 소요시간을 실제 수요에 맞추는 근거가 된다
                      const pt = { minutes: opt.minutes, ...personProps(sessionOrderer || ordererName) }
                      track('pickup_time_select', pt)
                      ampTrack('pickup_time_select', pt)
                      setPickupMinutes(opt.minutes)
                    }}
                    className={`py-2.5 rounded-xl text-[13px] font-light transition-colors ${
                      opt.disabled
                        ? 'bg-[#FAFAFA] text-[#D7D7D7] cursor-not-allowed'
                        : active
                        ? 'bg-[#E6F4EC] text-[#017333]'
                        : 'bg-[#F5F5F5] text-[#414141] active:scale-95'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
            {/* 선택 결과 — 맨 초록 글자 대신 카드로 묶어 "확정된 값"처럼 보이게.
                칩('+10분')을 되읊지 않고 받을 시각을 머리말로 올린다 */}
            {pickupMinutes !== null && (() => {
              const { headline } = pickupSummary(pickupMinutes)
              return (
                <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-[#E6F4EC] px-3.5 py-3">
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className="flex-shrink-0">
                    <circle cx="10" cy="10" r="7.6" stroke="#017333" strokeWidth="1.5" />
                    <path d="M10 6.2V10L12.4 11.6" stroke="#017333" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-[#017333] leading-tight">{headline}</p>
                  </div>
                </div>
              )
            })()}
            <p className="mt-2.5 text-[11px] text-[#ADADAD] leading-relaxed">
              1시간 이상 걸리신다면 아래 가게 요청사항에 적어주세요
            </p>
          </section>
        )}

        {/* 배달 주소 + 배달 요청사항 (배달 선택 시에만) */}
        {method === '배달' && (
          <section className="space-y-3">
            <div>
              <label className="text-base font-bold text-[#222222] mb-3 block">
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
              <label className="text-base font-bold text-[#222222] mb-3 block">배달 요청사항</label>
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
          <h2 className="text-base font-bold text-[#222222] mb-3">가게 요청사항</h2>
          {/* 퀵 선택 버튼 */}
          <div className="flex flex-wrap gap-2 mb-3.5">
            {['수저·포크 O', '수저·포크 X', '소스 따로', '덜 맵게'].map((label) => {
              const active = remarks.includes(label)
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => { track('quick_tag_click', { tag: label, active: !remarks.includes(label) }); ampTrack('quick_tag_click', { tag: label, active: !remarks.includes(label) }); handleTag(label) }}
                  className={`px-3 py-1.5 rounded-full text-[13px] font-light transition-colors ${
                    active
                      ? 'bg-[#E6F4EC] text-[#017333]'
                      : 'bg-[#F5F5F5] text-[#414141]'
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

        {/* 주문 내역 — 메뉴 줄과 금액 줄을 한 박스에.
            제목('주문 메뉴')은 뺐다. 메뉴명과 금액이 나란히 있으면 무슨 목록인지
            따로 말해줄 필요가 없고, 제목이 있으면 아래 금액 줄과 층이 갈려 보인다. */}
        <section className="bg-[#FAFAFA] rounded-xl p-4">
          <div className="space-y-2.5 text-sm">
            {items.map((item) => {
              const optionLabel = formatOptionsLabel(item.selectedOptions)
              return (
                <div key={item.cartId} className="flex justify-between">
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

            {method === '배달' && fee > 0 && (
              <div className="flex justify-between">
                <p className="font-medium text-[#222222]">배달료</p>
                <p className="font-semibold text-[#222222] flex-shrink-0">{formatWon(fee)}</p>
              </div>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-[#D7D7D7] text-sm">
            <div className="flex justify-between font-bold text-[#222222]">
              <span>총 금액</span>
              <span className="font-extrabold">{formatWon(total)}</span>
            </div>
          </div>

          {/* 잔액 정보 */}
          <div className="mt-4 pt-4 border-t border-[#D7D7D7] space-y-1.5 text-sm">
            <div className="flex justify-between text-[#727272]">
              <span>선결제 잔액</span>
              <span>{formatWon(currentBalance)}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium text-[#727272]">주문 후 잔액</span>
              <span className={`font-semibold ${isNegative ? 'text-[#C92A2A]' : 'text-[#1E1E1E]'}`}>
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

      {/* 배달 요청사항 바텀 시트 — 주문자 시트(orderer-sheet)와 같은 모션을 쓴다.
          전엔 애니메이션 없이 툭 나타났다. 같은 화면에서 올라오는 두 시트가 서로 다르게
          움직이면 둘 중 하나는 "잘못 뜬 것"처럼 보인다. */}
      {showDeliveryModal && (
        <>
          <div className="fixed inset-0 bg-black/45 z-40 backdrop-in" onClick={closeDeliveryModal} />
          <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-surface rounded-t-[24px] z-50 sheet-in">
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
              {/* 메뉴 화면의 '변경'·'주문자 선택'과 같은 칩. 본문 속 밑줄 링크는
                  글자 크기가 12px 이라 손가락으로 겨냥하기 어려웠다. */}
              <a
                href="/privacy"
                onClick={e => e.stopPropagation()}
                className="inline-block align-middle ml-0.5 px-2.5 py-1 rounded-lg bg-[#EDEDED] text-[12px] font-normal text-[#222222] no-underline active:bg-[#E0E0E0] transition-colors"
              >
                개인정보처리방침
              </a>
            </span>
          </label>
        )}
        <button
          onClick={handleOrder}
          disabled={orderBlocked}
          className={`w-full py-4 rounded-xl font-bold text-white text-base transition-colors ${
            orderBlocked ? 'bg-[#CCC] cursor-not-allowed' : 'bg-[#222222] active:scale-95'
          }`}
        >
          {isSubmitting ? '주문 중...' : '주문하기'}
        </button>
        <p className="text-center text-xs text-[#727272] mt-2">
          주문 취소는 어려워요. 신중하게 확인해주세요.
        </p>
      </footer>
    </div>
  )
}
