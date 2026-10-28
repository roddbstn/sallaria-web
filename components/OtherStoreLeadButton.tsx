'use client'

import { useState } from 'react'
import OtherStoreLeadSheet from './OtherStoreLeadSheet'

// "다른 가게도 선결제하고 계세요?" — Figma node 825:702.
//
// 와이드 pill + 오른쪽 꺾쇠. **고정 CTA 가 아니라 본문에 흐르는 항목** 모양이다 —
// 주문 완료 화면의 초록색 '네이버 리뷰 남기기' 같은 주행동 버튼과 격이 다르다.
// 조용히 제안하는 자리라서 그렇게 생겼고, 그대로 쓴다.
//
// 아래 한 줄(약속)을 같이 적는 이유: 이게 없으면 그냥 설문으로 보인다.
// 제보할 이유는 "그 가게가 시작하면 알려준다" 하나뿐이라 버튼에 붙어 있어야 한다.

export default function OtherStoreLeadButton({
  storeLocation, accountCode, reporter, onReported,
}: {
  storeLocation?: { lat: number; lng: number } | null
  accountCode: string
  reporter:    string
  onReported?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [reported, setReported] = useState(false)

  if (reported) {
    return (
      <div className="w-full rounded-xl bg-[#F7F7F7] px-4 py-3.5 text-center">
        <p className="text-[13px] text-[#727272] leading-relaxed">
          알려주셔서 고맙습니다 🙏
        </p>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl bg-[#F2F2F2] pl-4 pr-3 py-3.5 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
      >
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-bold text-[#1E1E1E] leading-snug">
            다른 가게도 선결제하고 계세요?
          </span>
          <span className="block text-[12px] text-[#727272] leading-relaxed mt-1">
            알려주시면 그 가게가 선포스를 시작할 때 알려드려요
          </span>
        </span>
        <svg width="9" height="16" viewBox="0 0 9 16" fill="none" className="flex-shrink-0">
          <path d="M1 1L7.5 8L1 15" stroke="#1E1E1E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <OtherStoreLeadSheet
          storeLocation={storeLocation}
          accountCode={accountCode}
          reporter={reporter}
          onClose={() => setOpen(false)}
          onDone={() => { setReported(true); onReported?.() }}
        />
      )}
    </>
  )
}
