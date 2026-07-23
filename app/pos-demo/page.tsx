'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

type DemoOrderItem = {
  name: string
  qty: number
  options: string
  price: number
}

type DemoOrder = {
  id: string
  account_name: string
  orderer: string
  method: string
  items: DemoOrderItem[]
  subtotal: number
  delivery_fee: number
  total: number
  status: string
  created_at: string
  _highlight?: boolean
}

function getElapsed(created_at: string): string {
  const diff = Math.floor((Date.now() - new Date(created_at).getTime()) / 1000)
  if (diff < 60) return '방금 전'
  const mins = Math.floor(diff / 60)
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  return `${hours}시간 전`
}

function formatWon(amount: number): string {
  return `₩${amount.toLocaleString('ko-KR')}`
}

function formatTime(ts: string): string {
  const d = new Date(ts)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

const METHOD_EMOJI: Record<string, string> = {
  '포장': '🛍️',
  '내점': '🍽️',
  '배달': '🛵',
}

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  '주문완료': { bg: '#FFF3CD', text: '#856404' },
  '조리중':   { bg: '#E3F2FD', text: '#1565C0' },
  '완료':     { bg: '#E6F4EC', text: '#017333' },
}

const PREP_OPTIONS = [5, 10, 15, 20, 30]

export default function PosDemoPage() {
  const [orders, setOrders] = useState<DemoOrder[]>([])
  const [popup, setPopup] = useState<DemoOrder | null>(null)
  const [step, setStep] = useState<'confirm' | 'time'>('confirm')
  const [prepMinutes, setPrepMinutes] = useState(10)
  const [, setNow] = useState(Date.now())
  const supabaseRef = useRef(createClient(SUPABASE_URL, SUPABASE_ANON_KEY))
  const supabase = supabaseRef.current

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const loadOrders = useCallback(async () => {
    const { data } = await supabase
      .from('demo_orders')
      .select('*')
      .gte('created_at', new Date(Date.now() - 3 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10)
    if (data) setOrders(data as DemoOrder[])
  }, [supabase])

  useEffect(() => { loadOrders() }, [loadOrders])

  // Realtime 구독 — 새 주문 도착 시 팝업
  useEffect(() => {
    const channel = supabase
      .channel('demo_pos_inserts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'demo_orders' },
        (payload) => {
          const newOrder = payload.new as DemoOrder
          setOrders(prev => [{ ...newOrder, _highlight: true }, ...prev].slice(0, 10))
          setTimeout(() => {
            setOrders(prev => prev.map(o => o.id === newOrder.id ? { ...o, _highlight: false } : o))
          }, 2000)
          // 팝업 표시 (현재 팝업 없을 때만)
          setPopup(prev => prev ?? newOrder)
          setStep('confirm')
          setPrepMinutes(10)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  // 거부
  async function handleReject() {
    if (!popup) return
    await supabase.from('demo_orders').update({ status: '취소' }).eq('id', popup.id)
    setOrders(prev => prev.map(o => o.id === popup.id ? { ...o, status: '취소' } : o))

    // 고객 success 페이지에 broadcast
    const ch = supabase.channel(`orders:order_code=${popup.id}`)
    await ch.subscribe()
    await ch.send({ type: 'broadcast', event: 'ORDER_REJECTED', payload: { reason: '점주가 주문을 거부했습니다.' } })
    supabase.removeChannel(ch)

    setPopup(null)
  }

  // 승인 클릭 → 소요시간 선택 단계
  function handleApprove() {
    setStep('time')
  }

  // 접수 (소요시간 확정 후)
  async function handleAccept() {
    if (!popup) return
    await supabase
      .from('demo_orders')
      .update({ status: '조리중', prep_minutes: prepMinutes })
      .eq('id', popup.id)

    setOrders(prev => prev.map(o => o.id === popup.id ? { ...o, status: '조리중' } : o))

    // 고객 success 페이지에 broadcast — 타이머 시작
    const ch = supabase.channel(`orders:order_code=${popup.id}`)
    await ch.subscribe()
    await ch.send({
      type: 'broadcast',
      event: 'ORDER_ACCEPTED',
      payload: { estimated_minutes: prepMinutes },
    })
    supabase.removeChannel(ch)

    setPopup(null)
  }

  const shortId = (id: string) => id.slice(0, 6).toUpperCase()

  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F5', fontFamily: "'Apple SD Gothic Neo', '맑은 고딕', sans-serif", position: 'relative' }}>
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
        @keyframes popup-in {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes highlight-in {
          0%   { background: #FFF9C4; }
          100% { background: #fff; }
        }
      `}</style>

      {/* 헤더 */}
      <div style={{
        background: '#1E1E1E', color: '#fff',
        padding: '14px 20px',
        display: 'flex', alignItems: 'center', gap: '12px',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <span style={{ fontWeight: 800, fontSize: '16px' }}>프리POS 데모</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: '#4CAF50', display: 'inline-block',
            animation: 'pulse-dot 1.5s ease-in-out infinite',
          }} />
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>LIVE</span>
        </span>
        <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>최근 3분 주문</span>
      </div>

      {/* 주문 목록 */}
      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {orders.length === 0 ? (
          <div style={{ marginTop: '60px', textAlign: 'center', padding: '40px 20px' }}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#727272' }}>
              주문을 접수해보세요
            </p>
          </div>
        ) : (
          orders.map(order => {
            const ss = STATUS_STYLE[order.status] ?? STATUS_STYLE['주문완료']
            return (
              <div key={order.id} style={{
                background: '#fff', borderRadius: '12px', padding: '14px',
                boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
                animation: order._highlight ? 'highlight-in 2s ease-out forwards' : undefined,
                border: `1.5px solid ${order._highlight ? '#FFD600' : 'transparent'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, fontFamily: 'monospace', color: '#1E1E1E' }}>#{shortId(order.id)}</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, background: '#F0F0F0', color: '#555', borderRadius: '6px', padding: '2px 7px' }}>
                    {METHOD_EMOJI[order.method] ?? ''} {order.method}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 700, background: ss.bg, color: ss.text, borderRadius: '20px', padding: '3px 9px' }}>
                    {order.status}
                  </span>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E1E1E', marginBottom: '6px' }}>
                  {order.account_name} <span style={{ fontWeight: 400, color: '#727272' }}>{order.orderer}</span>
                </div>
                <div style={{ borderTop: '1px solid #F0F0F0', paddingTop: '8px' }}>
                  {(order.items as DemoOrderItem[]).map((item, i) => (
                    <div key={i} style={{ fontSize: '12px', color: '#444', marginBottom: '2px' }}>
                      {item.name} × {item.qty}
                      {item.options && <span style={{ color: '#AAAAAA', marginLeft: '6px' }}>{item.options}</span>}
                    </div>
                  ))}
                  <div style={{ marginTop: '8px', fontSize: '14px', fontWeight: 800, color: '#017333' }}>
                    {formatWon(order.total)}
                    <span style={{ fontSize: '11px', color: '#AAAAAA', fontWeight: 400, marginLeft: '8px' }}>{getElapsed(order.created_at)}</span>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* 주문 팝업 오버레이 */}
      {popup && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px',
        }}>
          <div style={{
            width: '100%', maxWidth: '480px',
            borderRadius: '16px', overflow: 'hidden',
            boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
            animation: 'popup-in 0.25s ease-out',
          }}>
            {/* 팝업 헤더 (다크) */}
            <div style={{ background: '#1E1E1E', padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: '18px', fontFamily: 'monospace' }}>
                  #{shortId(popup.id)}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>
                  {formatTime(popup.created_at)} 주문
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '14px', fontWeight: 600 }}>
                  {popup.account_name} · {popup.orderer}
                </span>
                <span style={{
                  background: 'rgba(255,255,255,0.15)', color: '#fff',
                  fontSize: '13px', fontWeight: 700,
                  borderRadius: '8px', padding: '4px 10px',
                }}>
                  {METHOD_EMOJI[popup.method] ?? ''} {popup.method}
                </span>
              </div>
            </div>

            {/* 팝업 바디 (화이트) */}
            <div style={{ background: '#fff', padding: '20px' }}>
              {step === 'confirm' ? (
                <>
                  {/* 메뉴 목록 */}
                  <div style={{ marginBottom: '16px' }}>
                    {(popup.items as DemoOrderItem[]).map((item, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between',
                        alignItems: 'flex-start', paddingBottom: '10px',
                        borderBottom: i < popup.items.length - 1 ? '1px solid #F0F0F0' : 'none',
                        marginBottom: i < popup.items.length - 1 ? '10px' : 0,
                      }}>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#1E1E1E' }}>
                            {item.name} · {item.qty}개
                          </div>
                          {item.options && (
                            <div style={{ fontSize: '12px', color: '#AAAAAA', marginTop: '2px' }}>↳ {item.options}</div>
                          )}
                        </div>
                        <div style={{ fontSize: '13px', color: '#555', fontWeight: 600, whiteSpace: 'nowrap', marginLeft: '12px' }}>
                          {formatWon(item.price)}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 합계 */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    borderTop: '2px solid #F0F0F0', paddingTop: '14px', marginBottom: '20px',
                  }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: '#1E1E1E' }}>합계</span>
                    <span style={{ fontSize: '18px', fontWeight: 900, color: '#1E1E1E' }}>{formatWon(popup.total)}</span>
                  </div>

                  {/* 거부 / 승인 */}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={handleReject} style={{
                      flex: 1, padding: '14px', borderRadius: '12px',
                      background: '#1E1E1E', color: '#fff',
                      border: 'none', fontSize: '16px', fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                      거부
                    </button>
                    <button onClick={handleApprove} style={{
                      flex: 2, padding: '14px', borderRadius: '12px',
                      background: '#017333', color: '#fff',
                      border: 'none', fontSize: '16px', fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                      승인
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* 소요시간 선택 */}
                  <p style={{ fontSize: '14px', fontWeight: 700, color: '#1E1E1E', marginBottom: '14px' }}>
                    예상 준비 시간을 선택하세요
                  </p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
                    {PREP_OPTIONS.map(min => (
                      <button key={min} onClick={() => setPrepMinutes(min)} style={{
                        padding: '10px 18px', borderRadius: '10px',
                        border: `2px solid ${prepMinutes === min ? '#017333' : '#E0E0E0'}`,
                        background: prepMinutes === min ? '#E6F4EC' : '#fff',
                        color: prepMinutes === min ? '#017333' : '#555',
                        fontWeight: 700, fontSize: '14px',
                        cursor: 'pointer', fontFamily: 'inherit',
                        transition: 'all 0.15s',
                      }}>
                        {min}분
                      </button>
                    ))}
                  </div>
                  <button onClick={handleAccept} style={{
                    width: '100%', padding: '15px', borderRadius: '12px',
                    background: '#017333', color: '#fff',
                    border: 'none', fontSize: '16px', fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    접수 ({prepMinutes}분 소요)
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
