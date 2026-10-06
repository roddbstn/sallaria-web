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
  return `${mins}분 전`
}

function formatWon(amount: number): string {
  return `₩${amount.toLocaleString('ko-KR')}`
}

function formatTime(ts: string): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

const METHOD_LABEL: Record<string, string> = { '포장': '포장', '내점': '매장 식사', '배달': '배달' }
const METHOD_EMOJI: Record<string, string> = { '포장': '🛍️', '내점': '🍽️', '배달': '🛵' }

// 상태별 카드 상단 색상
const STATUS_COLOR: Record<string, string> = {
  '주문완료': '#222222',
  '조리중':   '#017333',
  '완료':     '#727272',
  '취소':     '#C92A2A',
}

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  '주문완료': { bg: 'rgba(255,255,255,0.18)', text: '#fff' },
  '조리중':   { bg: 'rgba(255,255,255,0.22)', text: '#fff' },
  '완료':     { bg: 'rgba(255,255,255,0.18)', text: '#fff' },
}

const PREP_OPTIONS = [5, 10, 15, 20, 30]

function playAlarmSound() {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
  const notes = [523.25, 659.25, 783.99, 1046.5]
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const g   = ctx.createGain()
    osc.connect(g); g.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = freq
    const t = ctx.currentTime + i * 0.14
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.28, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55)
    osc.start(t); osc.stop(t + 0.55)
  })
}

export default function PosDemoPage() {
  const [orders, setOrders] = useState<DemoOrder[]>([])
  const [popup, setPopup] = useState<DemoOrder | null>(null)
  const [step, setStep] = useState<'confirm' | 'time'>('confirm')
  const [prepMinutes, setPrepMinutes] = useState(10)
  const [, setTick] = useState(0)
  const [soundPlaying, setSoundPlaying] = useState(false)
  const supabaseRef = useRef(createClient(SUPABASE_URL, SUPABASE_ANON_KEY))
  const supabase = supabaseRef.current

  // 경과 시간 갱신
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30_000)
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

  // Realtime 구독
  useEffect(() => {
    const channel = supabase
      .channel('demo_pos_inserts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'demo_orders' }, (payload) => {
        const newOrder = payload.new as DemoOrder
        setOrders(prev => [{ ...newOrder, _highlight: true }, ...prev].slice(0, 10))
        setTimeout(() => {
          setOrders(prev => prev.map(o => o.id === newOrder.id ? { ...o, _highlight: false } : o))
        }, 2000)
        setPopup(prev => prev ?? newOrder)
        setStep('confirm')
        setPrepMinutes(10)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  // 거부
  async function handleReject() {
    if (!popup) return
    await supabase.from('demo_orders').update({ status: '취소' }).eq('id', popup.id)
    setOrders(prev => prev.map(o => o.id === popup.id ? { ...o, status: '취소' } : o))
    const ch = supabase.channel(`orders:order_code=${popup.id}`)
    await ch.subscribe()
    await ch.send({ type: 'broadcast', event: 'ORDER_REJECTED', payload: { reason: '점주가 주문을 거부했습니다.' } })
    supabase.removeChannel(ch)
    setPopup(null)
  }

  // 승인 → 소요시간 선택
  function handleApprove() { setStep('time') }

  // 접수 확정
  async function handleAccept() {
    if (!popup) return
    await supabase.from('demo_orders').update({ status: '조리중', prep_minutes: prepMinutes }).eq('id', popup.id)
    setOrders(prev => prev.map(o => o.id === popup.id ? { ...o, status: '조리중' } : o))
    const ch = supabase.channel(`orders:order_code=${popup.id}`)
    await ch.subscribe()
    await ch.send({ type: 'broadcast', event: 'ORDER_ACCEPTED', payload: { estimated_minutes: prepMinutes } })
    supabase.removeChannel(ch)
    setPopup(null)
  }

  // 완료
  async function handleComplete(order: DemoOrder) {
    await supabase.from('demo_orders').update({ status: '완료' }).eq('id', order.id)
    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: '완료' } : o))
    const ch = supabase.channel(`orders:order_code=${order.id}`)
    await ch.subscribe()
    await ch.send({ type: 'broadcast', event: 'ORDER_COMPLETED', payload: {} })
    supabase.removeChannel(ch)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F0F0F0', fontFamily: "'Apple SD Gothic Neo', '맑은 고딕', sans-serif", position: 'relative' }}>
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
        @keyframes slide-in {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes popup-in {
          from { opacity: 0; transform: scale(0.95) translateY(12px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      {/* 헤더 */}
      <div style={{
        background: '#222222', color: '#fff',
        padding: '13px 18px',
        display: 'flex', alignItems: 'center', gap: '10px',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <span style={{ fontWeight: 800, fontSize: '15px', letterSpacing: '-0.3px' }}>프리POS 데모</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{
            width: '7px', height: '7px', borderRadius: '50%',
            background: '#4ade80', display: 'inline-block',
            animation: 'pulse-dot 1.5s ease-in-out infinite',
          }} />
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>LIVE</span>
        </span>
        <button
          onClick={() => {
            if (soundPlaying) return
            setSoundPlaying(true)
            playAlarmSound()
            setTimeout(() => setSoundPlaying(false), 900)
          }}
          style={{
            marginLeft: 'auto',
            display: 'flex', alignItems: 'center', gap: '5px',
            background: soundPlaying ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: '8px',
            padding: '5px 11px',
            color: soundPlaying ? 'rgba(255,255,255,0.5)' : '#fff',
            fontSize: '12px', fontWeight: 700,
            cursor: soundPlaying ? 'default' : 'pointer',
            fontFamily: 'inherit',
            transition: 'all 0.15s',
          }}
        >
          {soundPlaying ? '🔊 재생 중…' : '🔔 알림음 듣기'}
        </button>
      </div>

      {/* 주문 목록 */}
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {orders.length === 0 ? (
          <div style={{ marginTop: '80px', textAlign: 'center' }}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#999' }}>주문을 접수해보세요</p>
          </div>
        ) : (
          orders.map(order => {
            const headerColor = STATUS_COLOR[order.status] ?? '#222222'
            const badge = STATUS_BADGE[order.status] ?? STATUS_BADGE['주문완료']
            const isActive = order.status !== '완료' && order.status !== '취소'

            return (
              <div key={order.id} style={{
                borderRadius: '14px',
                overflow: 'hidden',
                boxShadow: isActive
                  ? '0 4px 20px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)'
                  : '0 1px 4px rgba(0,0,0,0.06)',
                animation: order._highlight ? 'slide-in 0.3s ease-out' : undefined,
                opacity: order.status === '완료' || order.status === '취소' ? 0.55 : 1,
                transition: 'opacity 0.3s',
              }}>
                {/* 카드 헤더 (상태 색) */}
                <div style={{
                  background: headerColor,
                  padding: '12px 14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontWeight: 900, fontSize: '16px', color: '#fff', fontFamily: 'monospace', letterSpacing: '0.5px' }}>
                      #1001
                    </span>
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)' }}>
                      {formatTime(order.created_at)} 주문
                    </span>
                  </div>
                  <span style={{
                    fontSize: '11px', fontWeight: 700,
                    background: badge.bg, color: badge.text,
                    borderRadius: '20px', padding: '3px 10px',
                  }}>
                    {order.status}
                  </span>
                </div>

                {/* 카드 바디 */}
                <div style={{ background: '#fff', padding: '12px 14px' }}>
                  {/* 거래처 · 주문자 · 이용방법 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: '#222222' }}>{order.account_name}</span>
                      <span style={{ fontSize: '13px', color: '#727272', marginLeft: '6px' }}>{order.orderer}</span>
                    </div>
                    <span style={{
                      fontSize: '12px', fontWeight: 700,
                      background: '#F4F4F4', color: '#444',
                      borderRadius: '8px', padding: '4px 9px',
                    }}>
                      {METHOD_EMOJI[order.method]} {METHOD_LABEL[order.method] ?? order.method}
                    </span>
                  </div>

                  {/* 구분선 */}
                  <div style={{ height: '1px', background: '#F0F0F0', marginBottom: '10px' }} />

                  {/* 메뉴 목록 */}
                  <div style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {(order.items as DemoOrderItem[]).map((item, i) => (
                      <div key={i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: '#222222' }}>
                            {item.name} · {item.qty}개
                          </span>
                          <span style={{ fontSize: '12px', color: '#727272', fontWeight: 600, whiteSpace: 'nowrap', marginLeft: '8px' }}>
                            {formatWon(item.price)}
                          </span>
                        </div>
                        {item.options && (
                          <div style={{ fontSize: '11px', color: '#AAAAAA', marginTop: '2px', paddingLeft: '2px' }}>
                            ↳ {item.options}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* 합계 + 버튼 */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    borderTop: '1px solid #F0F0F0', paddingTop: '10px',
                  }}>
                    <div>
                      <span style={{ fontSize: '17px', fontWeight: 900, color: '#017333' }}>
                        {formatWon(order.total)}
                      </span>
                      <span style={{ fontSize: '11px', color: '#BBBBB', marginLeft: '6px' }}>
                        {getElapsed(order.created_at)}
                      </span>
                    </div>
                    {order.status === '조리중' && (
                      <button
                        onClick={() => handleComplete(order)}
                        style={{
                          background: '#017333', color: '#fff',
                          border: 'none', borderRadius: '10px',
                          padding: '9px 18px', fontSize: '13px', fontWeight: 700,
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        완료
                      </button>
                    )}
                    {order.status === '완료' && (
                      <span style={{ fontSize: '12px', color: '#017333', fontWeight: 700 }}>✓ 완료</span>
                    )}
                    {order.status === '취소' && (
                      <span style={{ fontSize: '12px', color: '#C92A2A', fontWeight: 700 }}>✗ 거부됨</span>
                    )}
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
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px',
        }}>
          <div style={{
            width: '100%', maxWidth: '480px',
            borderRadius: '16px', overflow: 'hidden',
            boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
            animation: 'popup-in 0.22s ease-out',
          }}>
            {/* 팝업 헤더 */}
            <div style={{ background: '#222222', padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: '#fff', fontWeight: 900, fontSize: '20px', fontFamily: 'monospace' }}>#1001</span>
                <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '12px' }}>{formatTime(popup.created_at)} 주문</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '14px', fontWeight: 600 }}>
                  {popup.account_name} · {popup.orderer}
                </span>
                <span style={{
                  background: 'rgba(255,255,255,0.15)', color: '#fff',
                  fontSize: '13px', fontWeight: 700,
                  borderRadius: '8px', padding: '4px 12px',
                }}>
                  {METHOD_EMOJI[popup.method]} {METHOD_LABEL[popup.method] ?? popup.method}
                </span>
              </div>
            </div>

            {/* 팝업 바디 */}
            <div style={{ background: '#fff', padding: '20px' }}>
              {step === 'confirm' ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                    {(popup.items as DemoOrderItem[]).map((item, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                        paddingBottom: i < popup.items.length - 1 ? '12px' : 0,
                        borderBottom: i < popup.items.length - 1 ? '1px solid #F4F4F4' : 'none',
                      }}>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#222222' }}>
                            {item.name} · {item.qty}개
                          </div>
                          {item.options && (
                            <div style={{ fontSize: '12px', color: '#AAAAAA', marginTop: '3px' }}>↳ {item.options}</div>
                          )}
                        </div>
                        <div style={{ fontSize: '13px', color: '#555', fontWeight: 600, marginLeft: '16px', whiteSpace: 'nowrap' }}>
                          {formatWon(item.price)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    borderTop: '2px solid #F0F0F0', paddingTop: '14px', marginBottom: '20px',
                  }}>
                    <span style={{ fontSize: '15px', fontWeight: 700 }}>합계</span>
                    <span style={{ fontSize: '20px', fontWeight: 900 }}>{formatWon(popup.total)}</span>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={handleReject} style={{
                      flex: 1, padding: '14px', borderRadius: '12px',
                      background: '#222222', color: '#fff',
                      border: 'none', fontSize: '16px', fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>거부</button>
                    <button onClick={handleApprove} style={{
                      flex: 2, padding: '14px', borderRadius: '12px',
                      background: '#017333', color: '#fff',
                      border: 'none', fontSize: '16px', fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>승인</button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: '#222222', marginBottom: '14px' }}>
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
                      }}>{min}분</button>
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
