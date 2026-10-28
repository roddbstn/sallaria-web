import type { SelectedOption, CartItem } from './types'

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

/**
 * 장바구니를 유입 경로별로 집계한다 — 담기 이후 이벤트(cart_bar_click, cart_view,
 * cart_to_checkout, purchase)에 그대로 실어 보내는 값.
 *
 * 한 장바구니에 여러 경로가 **섞이기** 때문에 단일 값이 아니라 구성비로 보낸다.
 * 계산을 이벤트마다 따로 하면 반드시 어긋나므로 여기 한 곳에서만 한다.
 *
 * `entrySource` 가 없는 항목은 `unknown` 으로 **따로** 센다. `list` 로 뭉뚱그리면
 * 꼬리표를 심기 전에 담아둔 세션 때문에 배포 직후 며칠간 `list` 가 부풀어 오른다.
 */
export function entrySourceBreakdown(items: CartItem[]) {
  const countOf = (s: string) => items.filter(i => i.entrySource === s).length
  const valueOf = (s: string) =>
    items.filter(i => i.entrySource === s).reduce((sum, i) => sum + i.subtotal, 0)

  return {
    item_count:     items.length,
    recent_count:   countOf('recent'),
    recent_value:   valueOf('recent'),
    search_count:   countOf('search'),
    list_count:     countOf('list'),
    direct_count:   countOf('direct'),
    unknown_count:  items.filter(i => !i.entrySource).length,
  }
}
