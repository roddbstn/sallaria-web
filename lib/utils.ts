import type { SelectedOption } from './types'

// 배달료 상수
export const DELIVERY_FEE = 3500

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
  return selectedOptions.reduce((sum, o) => sum + o.plus, 0)
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
export function formatOptionsLabel(selectedOptions: SelectedOption[]): string {
  if (selectedOptions.length === 0) return ''
  return selectedOptions.map(o => o.optionName).join(', ')
}

// 장바구니 아이템 고유 ID 생성
export function generateCartId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
