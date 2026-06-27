// 모바일 프레임 래퍼 — 고객 주문 흐름 공통 레이아웃
export default function OrderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="max-w-[430px] mx-auto min-h-screen bg-white relative"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {children}
    </div>
  );
}
