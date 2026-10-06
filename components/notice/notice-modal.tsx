'use client'

interface NoticeModalProps {
  onConfirm: () => void
  onDontShowAgain: () => void
}

// 배달료 변동사항 공지 — Figma: node 541:3511
export default function NoticeModal({ onConfirm, onDontShowAgain }: NoticeModalProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
      onClick={onConfirm}
    >
      <div
        className="w-full max-w-[380px] rounded-[32px] bg-surface px-6 py-7"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더: 아이콘 + 제목 / 날짜 */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <img src="/notice/alert-badge.svg" alt="" className="w-[26px] h-[26px] flex-shrink-0" />
            <p className="text-[22px] font-semibold text-ink">배달료 변동사항 공지</p>
          </div>
          <p className="text-[14px] font-medium text-[#787878] pt-2 whitespace-nowrap">26.10.2(금)</p>
        </div>

        {/* 본문 */}
        <div className="mt-8 text-[15px] leading-[20px] tracking-[-0.3px] text-[#2c261f] space-y-4">
          <p>안녕하세요 샐러리아 침산점입니다.</p>
          <p>
            10월 1일(목)부터 배달대행 기본요금이 인상되어, 부득이하게{' '}
            <span className="font-semibold">배달료를 500원 상향조정하게 되었습니다.</span>
          </p>
          <p>
            배민과 같은 배달 플랫폼은 배달료와 수수료로 인해 메인메뉴 가격이 매장보다 1,000원 높게 책정되어 있습니다.
          </p>
          <p>
            선결제 사이트는 매장에서 오로지 매장 운영과 고객님들의 편의를 위해 직접 개발한 프로그램으로 운영되기
            때문에, 수수료 없이 매장과 똑같은 가격으로 드리고 있어 배달료 인상분까지 메뉴 가격에 녹여내기는 어려운
            상황입니다.
          </p>
          <p>
            배달료만 조정하게 된 점 너그럽게 이해 부탁드립니다.
            <br />
            감사합니다.
          </p>
          <p>샐러리아 침산점 드림.</p>
        </div>

        {/* 푸터: 다시 보지 않기 / 확인 — 밑변 기준 정렬 */}
        <div className="mt-9 flex items-end justify-between">
          <button
            onClick={onDontShowAgain}
            className="text-[15px] font-medium text-[#787878]"
          >
            다시 보지 않기
          </button>
          <button
            onClick={onConfirm}
            className="px-7 py-3 rounded-[12px] bg-ink text-surface text-[16px] font-semibold"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}
