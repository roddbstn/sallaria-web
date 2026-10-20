'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useSessionStore } from '@/lib/store/session'

// 10분. 5분은 가혹했다 — 메뉴가 160개가 넘는 매장이라 처음 오는 손님은
// 훑어보다가 그냥 쫓겨났다. 장바구니·주문확인 단계는 애초에 면제라
// 이 시간은 '메뉴를 고르는 시간'만 센다.
const SESSION_MS = 10 * 60 * 1000  // 10분

// 주문 흐름 중에는 만료 체크 제외
const EXEMPT_PATHS = ['/cart', '/checkout', '/success']

export default function SessionExpiry() {
  const router   = useRouter()
  const pathname = usePathname()
  const loginAt      = useSessionStore(s => s.loginAt)
  const account      = useSessionStore(s => s.account)
  const resetSession = useSessionStore(s => s.resetSession)

  useEffect(() => {
    if (EXEMPT_PATHS.some(p => pathname?.startsWith(p))) return
    if (account?.isDemo) return  // 데모 세션은 만료 없음
    if (!loginAt) return

    function check() {
      if (Date.now() - loginAt! > SESSION_MS) {
        resetSession()
        // ?store= 보존 — 없으면 루트 페이지가 storeNotFound 화면을 띄움
        const storeId = account?.storeId
        router.replace(storeId ? `/?store=${storeId}&expired=1` : '/?expired=1')
      }
    }

    check()  // 마운트 시 즉시 한 번 체크
    const id = setInterval(check, 10_000)  // 10초 간격
    return () => clearInterval(id)
  }, [pathname, loginAt, account, resetSession, router])

  return null
}
