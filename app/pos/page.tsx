'use client'

import { useState, useRef } from 'react'
import { formatWon } from '@/lib/utils'
import { MENUS } from '@/lib/mock-data'

// ── 타입 ──────────────────────────────────────────────────
type OrderStatus = '주문완료' | '조리중' | '완료' | '취소'
type OrderMethod  = '포장' | '내점' | '배달'
type NavId        = 'dashboard' | 'orders' | 'accounts' | 'menus' | 'reports'

interface PosOrder {
  id: string
  time: string
  account: string
  person: string
  method: OrderMethod
  items: string[]
  total: number
  status: OrderStatus
}

// ── 목업 주문 데이터 ──────────────────────────────────────
const INITIAL_ORDERS: PosOrder[] = [
  {
    id: 'ORD-001', time: '12:34', account: '공원녹지과', person: '김주임',
    method: '포장',
    items: ['클래식 포케 ×1 (현미밥, 100g, 오리엔탈)', '시저 샐러드 ×2'],
    total: 29900, status: '주문완료',
  },
  {
    id: 'ORD-002', time: '12:21', account: '복지정책과', person: '이대리',
    method: '내점',
    items: ['매콤 치킨 포케 ×1 (메밀면, 200g)'],
    total: 15000, status: '주문완료',
  },
  {
    id: 'ORD-003', time: '12:15', account: 'KT 침산지점', person: '박과장',
    method: '배달',
    items: ['그릭 샐러드 ×2', '아메리카노 ×2 (아이스)'],
    total: 26000, status: '조리중',
  },
  {
    id: 'ORD-004', time: '11:52', account: '교통과', person: '최주임',
    method: '포장',
    items: ['닭갈비 도시락 ×2 (보통)'],
    total: 22000, status: '완료',
  },
]

const LOW_BALANCE_ACCOUNTS = [
  { code: 'A001', name: '공원녹지과', balance: 24000 },
  { code: 'A003', name: 'KT 침산지점', balance: 18500 },
]

// ── 상수 ──────────────────────────────────────────────────
const STATUS_LABEL: Record<OrderStatus, string> = {
  주문완료: '주문완료', 조리중: '조리중', 완료: '완료', 취소: '취소',
}

const STATUS_COLOR: Record<OrderStatus, string> = {
  주문완료: 'bg-[#FFF3E0] text-[#E65100]',
  조리중:   'bg-[#E3F2FD] text-[#1565C0]',
  완료:     'bg-[#E8F5E9] text-[#2E7D32]',
  취소:     'bg-[#F5F5F5] text-[#727272]',
}

const METHOD_COLOR: Record<OrderMethod, string> = {
  포장: 'bg-[#EDE7F6] text-[#4527A0]',
  내점: 'bg-[#E8F5E9] text-[#2E7D32]',
  배달: 'bg-[#FFF3E0] text-[#E65100]',
}

const CAT_NAME: Record<string, string> = {
  poke: '포케', salad: '샐러드', wrap: '랩·샌드위치', lunch: '도시락', drink: '음료',
}

const CANCEL_REASONS = ['재료 소진', '마감시간 초과', '주문 폭주', '매장 사정', '기타']

// 배민·쿠팡이츠 기준 정방형 이미지 스펙
const IMG_SPEC = {
  maxBytes: 5 * 1024 * 1024,           // 5 MB
  accept: 'image/jpeg,image/png,image/webp',
  hint: '800 × 800 px 권장 · JPG / PNG / WebP · 최대 5 MB',
}

// ── 메인 컴포넌트 ─────────────────────────────────────────
export default function PosPage() {
  // 주문 상태
  const [orders, setOrders] = useState<PosOrder[]>(INITIAL_ORDERS)
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState<string | null>(null)

  // 네비게이션
  const [activeNav, setActiveNav] = useState<NavId>('dashboard')

  // 메뉴 이미지 (메뉴코드 → 로컬 ObjectURL)
  const [menuImages, setMenuImages] = useState<Record<string, string>>({})

  // 이미지 수정 모달
  const [imgTarget, setImgTarget]   = useState<string | null>(null)   // 메뉴코드
  const [imgPreview, setImgPreview] = useState<string | null>(null)   // 미리보기 URL
  const [imgFile, setImgFile]       = useState<File | null>(null)
  const [imgError, setImgError]     = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 통계
  const activeOrders = orders.filter(o => o.status === '주문완료' || o.status === '조리중')
  const todayOrders  = orders.filter(o => o.status !== '취소')
  const totalSales   = todayOrders.filter(o => o.status === '완료').reduce((s, o) => s + o.total, 0)

  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  // ── 주문 핸들러 ─────────────────────────────────────────
  const handleComplete = (id: string) =>
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: '완료' } : o))

  const handleCancelConfirm = () => {
    if (!cancelTarget || !cancelReason) return
    setOrders(prev => prev.map(o => o.id === cancelTarget ? { ...o, status: '취소' } : o))
    setCancelTarget(null)
    setCancelReason(null)
  }

  // ── 이미지 핸들러 ────────────────────────────────────────
  const openImgModal = (code: string) => {
    setImgTarget(code)
    setImgPreview(menuImages[code] ?? null)
    setImgFile(null)
    setImgError(null)
  }

  const closeImgModal = () => {
    setImgTarget(null)
    setImgPreview(null)
    setImgFile(null)
    setImgError(null)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImgError(null)

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setImgError('JPG, PNG, WebP 파일만 업로드할 수 있습니다.')
      return
    }
    if (file.size > IMG_SPEC.maxBytes) {
      setImgError('파일 크기가 5 MB를 초과합니다.')
      return
    }

    const url = URL.createObjectURL(file)
    setImgPreview(url)
    setImgFile(file)
    // reset input so same file can be re-selected
    e.target.value = ''
  }

  const handleImgSave = () => {
    if (!imgTarget) return
    if (imgPreview) {
      setMenuImages(prev => ({ ...prev, [imgTarget]: imgPreview }))
    }
    closeImgModal()
  }

  const handleImgRemove = () => {
    setImgPreview(null)
    setImgFile(null)
  }

  // ── 네비게이션 아이템 ────────────────────────────────────
  const NAV_ITEMS: { id: NavId; label: string; badge?: number }[] = [
    { id: 'dashboard', label: '대시보드' },
    { id: 'orders',    label: '주문 접수', badge: activeOrders.length || undefined },
    { id: 'accounts',  label: '거래처 관리' },
    { id: 'menus',     label: '메뉴 관리' },
    { id: 'reports',   label: '정산 리포트' },
  ]

  // ── 렌더 ────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-[#F4F5F7] font-sans overflow-hidden">

      {/* 상단 상태 바 */}
      <header className="flex-shrink-0 bg-[#1E1E1E] text-white px-6 py-3 flex items-center justify-between">
        <span className="text-[15px] font-bold tracking-tight">프리POS</span>
        <div className="flex items-center gap-5 text-[13px]">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#4CAF50] inline-block" />
            연결됨
          </span>
          <span className="text-[#A0A0A0]">🖨️ 프린터 정상</span>
        </div>
      </header>

      {/* 바디 */}
      <div className="flex flex-1 overflow-hidden">

        {/* 왼쪽 글로벌 메뉴 */}
        <nav className="flex-shrink-0 w-[176px] bg-white border-r border-[#E8E8E8] flex flex-col pt-6 pb-4">
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map(item => {
              const isActive = activeNav === item.id
              return (
                <li key={item.id}>
                  <button
                    onClick={() => setActiveNav(item.id)}
                    className="w-full text-left px-5 py-2.5"
                  >
                    <span className={[
                      'inline-flex items-center gap-2 text-[14px] pb-[3px]',
                      isActive
                        ? 'font-bold text-[#017333] border-b-2 border-[#017333]'
                        : 'font-medium text-[#727272] hover:text-[#1E1E1E]',
                    ].join(' ')}>
                      {item.label}
                      {item.badge !== undefined && (
                        <span className={[
                          'text-[11px] font-bold px-1.5 py-0.5 rounded-full leading-none',
                          isActive ? 'bg-[#017333] text-white' : 'bg-[#F0F0F0] text-[#727272]',
                        ].join(' ')}>
                          {item.badge}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* 메인 콘텐츠 */}
        <main className="flex-1 overflow-y-auto px-7 py-6 space-y-5">

          {/* ─ 대시보드 / 주문 접수 ─ */}
          {(activeNav === 'dashboard' || activeNav === 'orders') && (
            <>
              <section>
                <h2 className="text-[13px] font-semibold text-[#727272] mb-3">
                  오늘의 주문 현황 · {today}
                </h2>
                <div className="grid grid-cols-3 gap-4">
                  <StatCard label="전체" value={`${todayOrders.length}건`} />
                  <StatCard label="처리 대기" value={`${activeOrders.length}건`} accent />
                  <StatCard label="완료 매출" value={formatWon(totalSales)} />
                </div>
              </section>

              <section>
                <h2 className="text-[14px] font-bold text-[#1E1E1E] mb-3 flex items-center gap-2">
                  📋 처리 대기 주문
                  {activeOrders.length > 0 && (
                    <span className="text-[11px] font-bold text-white bg-[#E65100] px-2 py-0.5 rounded-full">
                      {activeOrders.length}
                    </span>
                  )}
                </h2>
                {activeOrders.length === 0 ? (
                  <div className="bg-white rounded-xl border border-[#E8E8E8] px-6 py-10 text-center text-[14px] text-[#727272]">
                    대기 중인 주문이 없습니다
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeOrders.map(order => (
                      <div key={order.id} className="bg-white rounded-xl border border-[#E8E8E8] px-5 py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <span className="text-[13px] font-bold text-[#1E1E1E]">
                                {order.account} / {order.person}
                              </span>
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${METHOD_COLOR[order.method]}`}>
                                {order.method}
                              </span>
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[order.status]}`}>
                                {STATUS_LABEL[order.status]}
                              </span>
                              <span className="text-[12px] text-[#A0A0A0] ml-auto">{order.time}</span>
                            </div>
                            <ul className="text-[13px] text-[#3D3D3D] space-y-0.5 mb-2">
                              {order.items.map((item, i) => <li key={i}>· {item}</li>)}
                            </ul>
                            <span className="text-[13px] font-bold text-[#1E1E1E]">{formatWon(order.total)}</span>
                          </div>
                          <div className="flex flex-col gap-2 flex-shrink-0">
                            <button
                              onClick={() => handleComplete(order.id)}
                              className="px-4 py-2 bg-[#017333] text-white text-[13px] font-bold rounded-lg hover:bg-[#015d29] active:scale-95 transition-all"
                            >완료</button>
                            <button
                              onClick={() => { setCancelTarget(order.id); setCancelReason(null) }}
                              className="px-4 py-2 bg-white border border-[#D7D7D7] text-[#727272] text-[13px] font-semibold rounded-lg hover:bg-[#F5F5F5] active:scale-95 transition-all"
                            >취소</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {LOW_BALANCE_ACCOUNTS.length > 0 && (
                <section>
                  <h2 className="text-[14px] font-bold text-[#1E1E1E] mb-3">⚠️ 잔액 경고 거래처</h2>
                  <div className="bg-white rounded-xl border border-[#E8E8E8] divide-y divide-[#F0F0F0]">
                    {LOW_BALANCE_ACCOUNTS.map(acc => (
                      <div key={acc.code} className="flex items-center justify-between px-5 py-4">
                        <div>
                          <span className="text-[14px] font-semibold text-[#1E1E1E]">{acc.name}</span>
                          <span className="ml-3 text-[13px] font-bold text-[#C92A2A]">잔액 {formatWon(acc.balance)}</span>
                        </div>
                        <button className="px-4 py-2 border border-[#017333] text-[#017333] text-[13px] font-bold rounded-lg hover:bg-[#E6F4EC] active:scale-95 transition-all">
                          충전하기
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <h2 className="text-[14px] font-bold text-[#1E1E1E] mb-3">오늘 주문 목록</h2>
                <div className="bg-white rounded-xl border border-[#E8E8E8] overflow-hidden">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="bg-[#FAFAFA] border-b border-[#F0F0F0]">
                        <th className="text-left px-4 py-3 font-semibold text-[#727272]">시각</th>
                        <th className="text-left px-4 py-3 font-semibold text-[#727272]">거래처 / 주문자</th>
                        <th className="text-left px-4 py-3 font-semibold text-[#727272]">방법</th>
                        <th className="text-right px-4 py-3 font-semibold text-[#727272]">금액</th>
                        <th className="text-center px-4 py-3 font-semibold text-[#727272]">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0F0F0]">
                      {orders.map(order => (
                        <tr key={order.id} className={order.status === '취소' ? 'opacity-40' : ''}>
                          <td className="px-4 py-3 text-[#727272]">{order.time}</td>
                          <td className="px-4 py-3 font-medium text-[#1E1E1E]">{order.account} / {order.person}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${METHOD_COLOR[order.method]}`}>
                              {order.method}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-[#1E1E1E]">{formatWon(order.total)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[order.status]}`}>
                              {STATUS_LABEL[order.status]}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {/* ─ 메뉴 관리 ─ */}
          {activeNav === 'menus' && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-[16px] font-bold text-[#1E1E1E]">메뉴 관리</h2>
                  <p className="text-[12px] text-[#727272] mt-0.5">사진을 클릭하면 이미지를 교체할 수 있습니다.</p>
                </div>
                <span className="text-[12px] text-[#727272] bg-white border border-[#E8E8E8] px-3 py-1.5 rounded-lg">
                  📐 권장 800 × 800 px · 1:1 정방형
                </span>
              </div>

              <div className="bg-white rounded-xl border border-[#E8E8E8] overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-[#FAFAFA] border-b border-[#F0F0F0]">
                      <th className="text-left px-4 py-3 font-semibold text-[#727272] w-[88px]">사진</th>
                      <th className="text-left px-4 py-3 font-semibold text-[#727272]">메뉴명</th>
                      <th className="text-left px-4 py-3 font-semibold text-[#727272]">카테고리</th>
                      <th className="text-right px-4 py-3 font-semibold text-[#727272]">기본가격</th>
                      <th className="text-center px-4 py-3 font-semibold text-[#727272]">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F0F0]">
                    {MENUS.map(menu => {
                      const imgSrc = menuImages[menu.code]
                      return (
                        <tr key={menu.code} className="hover:bg-[#FAFAFA] transition-colors">
                          {/* ── 사진 썸네일 (클릭 → 수정) ── */}
                          <td className="px-4 py-3">
                            <button
                              onClick={() => openImgModal(menu.code)}
                              title="사진 변경"
                              className="group relative block"
                              style={{ width: 56, height: 56 }}
                            >
                              {/* 1:1 정방형 프레임 */}
                              <div
                                className="w-full h-full rounded-lg overflow-hidden border border-[#E8E8E8] bg-[#F5F5F5] flex items-center justify-center"
                                style={{ aspectRatio: '1 / 1' }}
                              >
                                {imgSrc ? (
                                  <img
                                    src={imgSrc}
                                    alt={menu.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <span style={{ fontSize: 26 }}>{menu.emoji}</span>
                                )}
                              </div>
                              {/* hover 오버레이 */}
                              <div className="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-colors">
                                <span className="text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity leading-tight text-center">
                                  사진<br/>변경
                                </span>
                              </div>
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-semibold text-[#1E1E1E]">{menu.name}</span>
                            {menu.popular     && <span className="ml-1 text-[10px] font-bold text-white bg-[#F97316] px-1.5 py-0.5 rounded-full">인기</span>}
                            {menu.recommended && <span className="ml-1 text-[10px] font-bold text-white bg-[#16a84c] px-1.5 py-0.5 rounded-full">추천</span>}
                            {menu.isNew       && <span className="ml-1 text-[10px] font-bold text-white bg-[#1D6FE8] px-1.5 py-0.5 rounded-full">신메뉴</span>}
                          </td>
                          <td className="px-4 py-3 text-[#727272]">{CAT_NAME[menu.cat] ?? menu.cat}</td>
                          <td className="px-4 py-3 text-right font-semibold text-[#1E1E1E]">{formatWon(menu.price)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                              menu.isSoldOut
                                ? 'bg-[#FFF3E0] text-[#E65100]'
                                : 'bg-[#E8F5E9] text-[#2E7D32]'
                            }`}>
                              {menu.isSoldOut ? '품절' : '판매 중'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ─ 나머지 탭 ─ */}
          {activeNav !== 'dashboard' && activeNav !== 'orders' && activeNav !== 'menus' && (
            <div className="flex items-center justify-center h-[60vh] text-[14px] text-[#A0A0A0]">
              {NAV_ITEMS.find(n => n.id === activeNav)?.label} 화면은 준비 중입니다.
            </div>
          )}
        </main>
      </div>

      {/* ── 취소 확인 모달 ── */}
      {cancelTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-[16px] font-bold text-[#1E1E1E] mb-1">주문 취소</h3>
            <p className="text-[13px] text-[#727272] mb-5">취소 사유를 선택해 주세요.</p>
            <div className="flex flex-wrap gap-2 mb-6">
              {CANCEL_REASONS.map(reason => (
                <button
                  key={reason}
                  onClick={() => setCancelReason(reason)}
                  className={[
                    'px-3 py-2 rounded-lg text-[13px] font-semibold border transition-colors',
                    cancelReason === reason
                      ? 'bg-[#C92A2A] border-[#C92A2A] text-white'
                      : 'border-[#D7D7D7] text-[#1E1E1E] hover:bg-[#F5F5F5]',
                  ].join(' ')}
                >{reason}</button>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setCancelTarget(null); setCancelReason(null) }}
                className="flex-1 py-3 border border-[#D7D7D7] rounded-xl text-[14px] font-semibold text-[#727272] hover:bg-[#F5F5F5]"
              >닫기</button>
              <button
                onClick={handleCancelConfirm}
                disabled={!cancelReason}
                className="flex-1 py-3 bg-[#C92A2A] text-white rounded-xl text-[14px] font-bold disabled:bg-[#CCC] disabled:cursor-not-allowed"
              >취소 확정</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 이미지 수정 모달 ── */}
      {imgTarget && (() => {
        const menu = MENUS.find(m => m.code === imgTarget)
        if (!menu) return null
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[420px] overflow-hidden">

              {/* 모달 헤더 */}
              <div className="px-6 pt-5 pb-4 border-b border-[#F0F0F0]">
                <h3 className="text-[15px] font-bold text-[#1E1E1E]">메뉴 사진 변경</h3>
                <p className="text-[12px] text-[#727272] mt-0.5">{menu.name}</p>
              </div>

              {/* 이미지 업로드 영역 */}
              <div className="px-6 py-5">

                {/* 1:1 정방형 미리보기 + 업로드 존 */}
                <div
                  className="relative w-full rounded-xl overflow-hidden border-2 border-dashed border-[#D7D7D7] bg-[#FAFAFA] cursor-pointer group hover:border-[#017333] transition-colors"
                  style={{ aspectRatio: '1 / 1' }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {imgPreview ? (
                    <>
                      <img
                        src={imgPreview}
                        alt="미리보기"
                        className="w-full h-full object-cover"
                      />
                      {/* 재업로드 오버레이 */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-colors">
                        <span className="text-white text-[13px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                          사진 교체
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                      <span style={{ fontSize: 52 }}>{menu.emoji}</span>
                      <div className="text-center">
                        <p className="text-[13px] font-semibold text-[#1E1E1E]">클릭하여 사진 업로드</p>
                        <p className="text-[11px] text-[#A0A0A0] mt-0.5">또는 파일을 여기에 드래그</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* 스펙 안내 */}
                <div className="mt-3 flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="flex-shrink-0">
                    <circle cx="6" cy="6" r="5.5" stroke="#A0A0A0"/>
                    <path d="M6 5.5V9" stroke="#A0A0A0" strokeWidth="1.2" strokeLinecap="round"/>
                    <circle cx="6" cy="3.5" r="0.6" fill="#A0A0A0"/>
                  </svg>
                  <span className="text-[11px] text-[#A0A0A0]">{IMG_SPEC.hint}</span>
                </div>

                {/* 에러 메시지 */}
                {imgError && (
                  <p className="mt-2 text-[12px] font-semibold text-[#C92A2A]">{imgError}</p>
                )}

                {/* 파일 선택 버튼 + 삭제 */}
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 py-2.5 border border-[#D7D7D7] rounded-lg text-[13px] font-semibold text-[#1E1E1E] hover:bg-[#F5F5F5] transition-colors"
                  >
                    파일 선택
                  </button>
                  {imgPreview && (
                    <button
                      onClick={handleImgRemove}
                      className="px-4 py-2.5 border border-[#D7D7D7] rounded-lg text-[13px] font-semibold text-[#C92A2A] hover:bg-[#FFF0F0] transition-colors"
                    >
                      삭제
                    </button>
                  )}
                </div>

                {/* 숨겨진 파일 input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={IMG_SPEC.accept}
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {/* 모달 푸터 */}
              <div className="px-6 pb-5 flex gap-3">
                <button
                  onClick={closeImgModal}
                  className="flex-1 py-3 border border-[#D7D7D7] rounded-xl text-[14px] font-semibold text-[#727272] hover:bg-[#F5F5F5]"
                >
                  취소
                </button>
                <button
                  onClick={handleImgSave}
                  className="flex-1 py-3 bg-[#1E1E1E] text-white rounded-xl text-[14px] font-bold hover:bg-[#3D3D3D] transition-colors"
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── 통계 카드 ──────────────────────────────────────────────
function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl px-5 py-4 border ${accent ? 'bg-[#FFF8F0] border-[#FFD699]' : 'bg-white border-[#E8E8E8]'}`}>
      <div className="text-[12px] font-semibold text-[#727272] mb-1">{label}</div>
      <div className={`text-[22px] font-bold ${accent ? 'text-[#E65100]' : 'text-[#1E1E1E]'}`}>{value}</div>
    </div>
  )
}
