// 공유 타입 정의

export type OrderMethod = '포장' | '내점' | '배달'
export type OrderStatus = '주문완료' | '조리중' | '완료' | '취소'

// ──────────────────────────────────────
// 와이어프레임 목업용 타입 (영문 필드명)
// ──────────────────────────────────────

export interface Account {
  code: string           // 거래처코드
  name: string           // 거래처명
  type: '구청 과' | '기업' | '개인' | '기타'
  org: string | null     // 기관명
  balance: number        // 현재잔액 (정수, 원)
  pin: string            // 4자리 PIN (mock only — real: server-side)
}

export interface MenuOptionItem {
  id: string
  name: string           // 옵션명
  plus: number           // 추가가격
  isSoldOut?: boolean
  isHidden?: boolean
}

export interface MenuOptionGroup {
  group: string          // 옵션그룹명
  required: boolean      // 필수여부
  multi: boolean         // 복수선택 여부
  items: MenuOptionItem[]
}

export interface Menu {
  code: string           // 메뉴코드
  cat: string            // 카테고리
  name: string           // 메뉴명
  desc: string           // 메뉴설명
  price: number          // 기본가격
  emoji: string          // 이모지 (임시 이미지 대체)
  popular?: boolean
  isSoldOut?: boolean
  isHidden?: boolean
  options: MenuOptionGroup[]
}

export interface Category {
  id: string
  name: string
}

export interface SelectedOption {
  optionGroupIndex: number
  optionId: string
  optionName: string
  plus: number
}

export interface CartItem {
  cartId: string         // 장바구니 내 고유 ID
  menuCode: string
  menuName: string
  basePrice: number
  qty: number
  selectedOptions: SelectedOption[]
  subtotal: number       // (basePrice + Σplus) * qty
}

// DB 주문 생성 페이로드 타입 (RPC 호출용)
export interface OrderItemPayload {
  menu_code: string
  qty: number
  unit_price: number    // 스냅샷
  options: { option_id: string; extra_price: number }[]
}
