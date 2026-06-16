'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface ToastContextValue {
  showToast: (msg: string) => void
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const timerRef = { current: null as ReturnType<typeof setTimeout> | null }

  const showToast = useCallback((msg: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setMessage(msg)
    setVisible(true)
    timerRef.current = setTimeout(() => {
      setVisible(false)
    }, 3000)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* 토스트 메시지 */}
      <div
        aria-live="polite"
        className={[
          'fixed top-6 left-1/2 -translate-x-1/2 z-[300]',
          'bg-[#1E1E1E] text-white px-[22px] py-[11px] rounded-full text-[14px] font-semibold',
          'whitespace-nowrap pointer-events-none',
          'transition-all duration-200',
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2',
        ].join(' ')}
      >
        {message}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
