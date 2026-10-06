'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useSessionStore } from '@/lib/store/session'
import { getSupabaseClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

// '/success': 이미 접수된 주문을 확인하는 화면은 가게가 닫혀도 유지
// '/': PIN 화면 자체가 이미 is_open을 자체 체크함 — 로그인 직후
//      router.push('/menu')와 이 컴포넌트의 리다이렉트가 겹치는 걸 방지
const EXEMPT_PATHS = ['/success']
const EXEMPT_EXACT_PATHS = ['/']

// PIN 로그인 이후(menu/cart/checkout)에도 stores.is_open을 실시간 감시 —
// 점주가 운영 종료로 전환하면 즉시 PIN 화면으로 돌려보냄
export default function StoreOpenGuard() {
  const pathname = usePathname()
  const router = useRouter()
  const storeId = useSessionStore(s => s.account?.storeId)

  useEffect(() => {
    if (EXEMPT_PATHS.some(p => pathname?.startsWith(p))) return
    if (EXEMPT_EXACT_PATHS.includes(pathname ?? '')) return
    if (!storeId) return

    const supabase = getSupabaseClient()

    function handleClosed() {
      // PIN 화면(page.tsx)이 마운트 시 store.is_open을 다시 조회해
      // 운영 종료 안내 화면 + 세션/장바구니 초기화를 알아서 처리함
      router.replace(`/?store=${storeId}`)
    }

    supabase
      .from('stores')
      .select('is_open')
      .eq('id', storeId)
      .maybeSingle()
      .then(({ data }: { data: { is_open: boolean } | null }) => {
        if (data?.is_open === false) handleClosed()
      })

    const channel: RealtimeChannel = supabase
      .channel(`store-open-${storeId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'stores', filter: `id=eq.${storeId}` },
        (payload: { new: Record<string, unknown> }) => {
          if (payload.new['is_open'] === false) handleClosed()
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, storeId])

  return null
}
