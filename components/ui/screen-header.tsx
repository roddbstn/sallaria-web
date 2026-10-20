'use client'

// 화면 상단 바 — 메뉴 선택 · 장바구니 · 주문 확인이 같은 것을 쓴다.
//
// 전엔 셋이 다 달랐다:
//   · 메뉴 선택: 테두리 없음 + 그림자 없음 + 세로 71px(px-5 py-4 + p-3 버튼)
//   · 장바구니 / 주문 확인: 아래 테두리 1px + 세로 56px(h-14)
// 그래서 담기를 누르고 장바구니로 넘어가면 제목이 위로 쑥 올라가고 선이 하나 생겼다.
// 기준은 **메뉴 선택 화면**으로 잡는다 — 테두리 대신 그림자, 더 긴 세로.
//
// ⚠️ 제목은 flex-1 + text-center 로 가운데 정렬하면 **진짜 가운데가 아니다.**
//    전에 `flex-1 text-center pr-9` 였는데, 왼쪽 뒤로가기 버튼의 실제 폭(33px)과
//    오른쪽 패딩(36px)이 어긋나 글자가 1.5px 왼쪽으로 치우쳤다. 눈에 띄는 양은
//    아니지만 "뭔가 안 맞는" 느낌의 정체가 이거였다.
//    그래서 제목은 바 전체에 absolute 로 깔고 justify-center 한다 — 버튼 폭이
//    무엇이든 바의 정확한 중앙에 온다.

/** 바 높이(px). 스크롤 영역 paddingTop 과 **같은 값을 써야** 내용이 가려지지 않는다 */
export const HEADER_H = 64

export default function ScreenHeader({
  title,
  onBack,
  /** 메뉴 선택 화면처럼 스크롤 위에 떠 있어야 할 때 */
  fixed = false,
  backLabel = '뒤로가기',
}: {
  title: string
  onBack: () => void
  fixed?: boolean
  backLabel?: string
}) {
  const bar = (
    <div className="relative flex items-center px-5" style={{ height: HEADER_H }}>
      <button
        onClick={onBack}
        aria-label={backLabel}
        className="-ml-3 p-3 z-10 rounded-full transition-colors hover:bg-[#F5F5F5] active:bg-[#F0F0F0]"
      >
        <svg width="9" height="15" viewBox="0 0 9 15" fill="none">
          <path d="M8 1L1 7.5L8 14" stroke="#1E1E1E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <span className="absolute inset-0 flex items-center justify-center text-[16px] font-bold text-ink pointer-events-none">
        {title}
      </span>
    </div>
  )

  // 테두리 없이 그림자만 — 선이 있으면 화면이 두 칸으로 잘려 보인다
  const skin = 'bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.06)]'

  if (fixed) {
    return (
      <div
        className={`fixed top-0 left-0 right-0 z-10 ${skin}`}
        style={{ maxWidth: '430px', margin: '0 auto', paddingTop: 'env(safe-area-inset-top)' }}
      >
        {bar}
      </div>
    )
  }

  return <header className={`flex-shrink-0 relative z-10 ${skin}`}>{bar}</header>
}
