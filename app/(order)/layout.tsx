import SessionExpiry from '@/components/SessionExpiry'
import StoreOpenGuard from '@/components/StoreOpenGuard'

// 모바일 프레임 래퍼 — 고객 주문 흐름 공통 레이아웃
export default function OrderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex justify-center" style={{ backgroundColor: '#E5E5E5' }}>
      <div
        className="w-full max-w-[430px] min-h-screen bg-surface relative"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <SessionExpiry />
        <StoreOpenGuard />
        {children}
      </div>
    </div>
  );
}
