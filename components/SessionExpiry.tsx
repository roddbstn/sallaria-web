'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useSessionStore } from '@/lib/store/session'

const SESSION_MS = 5 * 60 * 1000  // 5분

// /success 경로는 만료 체크에서 제외
const EXEMPT_PATHS = ['/success']

export default function SessionExpiry() {
  const router   = useRouter()
  const pathname = usePathname()
  const loginAt      = useSessionStore(s => s.loginAt)
  const resetSession = useSessionStore(s => s.resetSession)

  useEffect(() => {
    if (EXEMPT_PATHS.some(p => pathname?.startsWith(p))) return
    if (!loginAt) return

    function check() {
      if (Date.now() - loginAt! > SESSION_MS) {
        resetSession()
        router.replace('/?expired=1')
      }
    }

    check()  // 마운트 시 즉시 한 번 체크
    const id = setInterval(check, 10_000)  // 10초 간격
    return () => clearInterval(id)
  }, [pathname, loginAt, resetSession, router])

  return null
}
