'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSessionStore } from '@/lib/store/session'
import { getSupabaseClient } from '@/lib/supabase/client'

/** 공개 데모 링크(sallaria.web.app/demo)가 보여줄 대표 매장 — 샐러리아 침산점 */
const DEMO_STORE_ID = 'c4645a2a-06b2-4a1f-bb1e-32ae0a741db6'

export default function DemoPage() {
  return (
    <Suspense>
      <DemoPageInner />
    </Suspense>
  )
}

function DemoPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setAccount, setLoginAt, setOrderer, setPhone } = useSessionStore()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const supabase = getSupabaseClient()

      // sunpos(POS 앱)의 메뉴 화면 QR오더 미리보기 iframe은 ?store=<storeId>로 자기 매장을 넘겨준다.
      // 그 경우엔 반드시 넘어온 매장을 쓴다 — 예전처럼 이름으로 "침산"을 찾는 하드코딩이면
      // 어떤 계정으로 접속하든 침산점만 떠서 조용히 엉뚱한 매장을 보여주게 된다.
      // 파라미터가 없는 맨 /demo 는 공유용 공개 데모 링크라, 대표 매장을 명시적으로 고정한다.
      const storeIdParam = searchParams.get('store') ?? DEMO_STORE_ID

      const { data, error: dbErr } = await supabase
        .from('stores')
        .select('id, name')
        .eq('id', storeIdParam)
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
      <div className="screen flex flex-col">
        <div className="flex-1 flex items-center justify-center px-8 text-center">
          <p className="text-[#C92A2A] text-[14px]">{error}</p>
        </div>
        <div className="px-5 pb-10 pt-4">
          <a href="/" className="block w-full py-4 rounded-2xl bg-[#222222] text-white text-[15px] font-bold text-center">
            처음으로
          </a>
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
