import type { SelectedOption } from './types'

// 배달료 상수 (26년 10월 1일부터 배달대행 기본요금 인상으로 500원 상향)
export const DELIVERY_FEE = 4000

// 잔액 경고 기준
export const LOW_BALANCE = 30000

// 금액을 한국어 원화 포맷으로 표시
// formatWon(12345) → "12,345원"
export function formatWon(n: number): string {
  return n.toLocaleString('ko-KR') + '원'
}

// 잔액이 경고 기준 이하인지 확인
export function isLowBalance(balance: number, threshold = LOW_BALANCE): boolean {
  return balance <= threshold
}

// 잔액이 음수인지 확인
export function isNegativeBalance(balance: number): boolean {
  return balance < 0
}

// 옵션 추가금액 합산
export function calcOptionExtra(selectedOptions: SelectedOption[]): number {
  // 수량 버튼을 쓰는 옵션(qty>1)은 추가금액도 수량만큼 곱한다 — 서버(create_order)도 동일하게 계산
  return selectedOptions.reduce((sum, o) => sum + o.plus * (o.qty ?? 1), 0)
}

// 카트 아이템 소계 계산: (기본가 + 옵션 합) × 수량
export function calcSubtotal(
  basePrice: number,
  selectedOptions: SelectedOption[],
  qty: number
): number {
  return (basePrice + calcOptionExtra(selectedOptions)) * qty
}

// 선택된 옵션 표시 문자열 (예: "현미밥, 100g, 오리엔탈")
// 수량 버튼으로 2개 이상 담은 옵션은 "발사믹 소스 ×2"처럼 수량을 함께 보여준다
export function formatOptionsLabel(selectedOptions: SelectedOption[]): string {
  if (selectedOptions.length === 0) return ''
  return selectedOptions.map(o => (o.qty && o.qty > 1 ? `${o.optionName} ×${o.qty}` : o.optionName)).join(', ')
}

// 장바구니 아이템 고유 ID 생성
export function generateCartId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
