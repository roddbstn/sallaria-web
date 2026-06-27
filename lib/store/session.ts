'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Account } from '@/lib/types'

interface SessionState {
  account: Account | null
  orderer: string
  phone: string
  pinAttempts: number
  pinLocked: boolean
  loginAt: number | null   // PIN 인증 성공 시각 (ms)
  setAccount: (account: Account) => void
  setOrderer: (name: string) => void
  setPhone: (phone: string) => void
  setLoginAt: (t: number) => void
  incrementPinAttempts: () => void
  lockPin: () => void
  resetSession: () => void
  // 하위 호환
  clearSession: () => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      account: null,
      orderer: '',
      phone: '',
      pinAttempts: 0,
      pinLocked: false,
      loginAt: null,

      setAccount: (account) => set({ account }),
      setOrderer: (orderer) => set({ orderer }),
      setPhone: (phone) => set({ phone }),
      setLoginAt: (t) => set({ loginAt: t }),

      incrementPinAttempts: () => {
        const attempts = get().pinAttempts + 1
        set({ pinAttempts: attempts })
      },

      lockPin: () => set({ pinLocked: true }),

      resetSession: () => set({ account: null, orderer: '', phone: '', pinAttempts: 0, pinLocked: false, loginAt: null }),

      clearSession: () => set({ account: null, orderer: '', phone: '', pinAttempts: 0, pinLocked: false, loginAt: null }),
    }),
    {
      name: 'sallaria-session',
      storage: createJSONStorage(() => {
        // SSR 시 sessionStorage 접근 방지
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          }
        }
        return sessionStorage
      }),
    },
  ),
)
