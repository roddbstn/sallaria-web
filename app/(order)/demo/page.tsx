'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSessionStore } from '@/lib/store/session'
import { getSupabaseClient } from '@/lib/supabase/client'

export default function DemoPage() {
  const router = useRouter()
  const { setAccount, setLoginAt, setOrderer, setPhone } = useSessionStore()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const supabase = getSupabaseClient()

      // 실제 매장 ID 조회 — 첫 번째 활성 매장 사용
      const { data, error: dbErr } = await supabase
        .from('stores')
        .select('id, name')
        .ilike('name', '%침산%')
        .limit(1)
        .maybeSingle()

      if (dbErr || !data) {
        setError('데모를 불러올 수 없습니다.')
        return
      }

      // 데모 세션 설정 — 실제 주문은 접수되지 않음
      setAccount({
        code: '00000000-0000-0000-0000-000000000000',
        accountNumber: 0,
        name: '가상 거래처',
        type: '기업',
        org: '프리POS',
        balance: 500000,
        contactPhone: null,
        pin: '0000',
        storeId: data.id,
        storeName: data.name,
        isDemo: true,
      })
      setLoginAt(Date.now())
      setOrderer('')
      setPhone('')

      router.replace('/menu')
    }

    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="screen flex items-center justify-center">
        <div className="text-center p-6">
          <p className="text-[#C92A2A] text-sm mb-4">{error}</p>
          <a href="/" className="text-[13px] text-[#727272] underline">처음으로</a>
        </div>
      </div>
    )
  }

  return (
    <div className="screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#017333] border-t-transparent rounded-full animate-spin" />
        <p className="text-[14px] text-[#727272]">데모 메뉴를 불러오는 중...</p>
      </div>
    </div>
  )
}
