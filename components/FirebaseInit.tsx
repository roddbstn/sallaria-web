'use client'

import { useEffect } from 'react'
import { getFirebaseAnalytics } from '@/lib/firebase'

/** Analytics 초기화 — layout에서 한 번만 마운트 */
export default function FirebaseInit() {
  useEffect(() => {
    getFirebaseAnalytics()
  }, [])
  return null
}
