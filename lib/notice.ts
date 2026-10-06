// 공지 팝업 "다시 보지 않기" 상태 — PIN 세션(sessionStorage)과 무관하게
// 브라우저 단위 localStorage에 "매장별로" 영구 저장. 한 브라우저(예: 사파리)로
// 여러 매장 QR을 넘나들어도 매장마다 독립적으로 다시 보지 않기가 적용된다.
// 공지 내용이 바뀌면 NOTICE_ID만 새 값으로 바꾸면 전원에게 다시 노출된다.
export const DELIVERY_FEE_NOTICE_ID = 'delivery-fee-2026-10'

function storageKey(noticeId: string, storeId: string): string {
  return `notice-dismissed-${noticeId}-${storeId}`
}

export function isNoticeDismissed(noticeId: string, storeId: string | undefined): boolean {
  if (!storeId) return false
  try {
    return localStorage.getItem(storageKey(noticeId, storeId)) === '1'
  } catch {
    return false
  }
}

export function dismissNotice(noticeId: string, storeId: string | undefined): void {
  if (!storeId) return
  try {
    localStorage.setItem(storageKey(noticeId, storeId), '1')
  } catch {
    // localStorage 접근 불가(프라이빗 모드 등) — 무시, 다음에도 다시 보임
  }
}
