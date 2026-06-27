'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { CartItem, SelectedOption, OrderMethod } from '@/lib/types'
import { calcSubtotal, generateCartId, DELIVERY_FEE } from '@/lib/utils'

interface CartState {
  items: CartItem[]
  method: OrderMethod
  remarks: string

  addItem: (
    menuCode: string,
    menuName: string,
    basePrice: number,
    qty: number,
    selectedOptions: SelectedOption[],
    imageUrl?: string
  ) => void
  updateItem: (cartId: string, qty: number, selectedOptions: SelectedOption[]) => void
  removeItem: (cartId: string) => void
  setMethod: (m: OrderMethod) => void
  setRemarks: (r: string) => void
  clearCart: () => void

  // computed
  totalQty: () => number
  totalSubtotal: () => number
  deliveryFee: () => number
  totalAmount: () => number
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      method: null,
      remarks: '',

      addItem: (menuCode, menuName, basePrice, qty, selectedOptions, imageUrl) => {
        const item: CartItem = {
          cartId: generateCartId(),
          menuCode,
          menuName,
          imageUrl,
          basePrice,
          qty,
          selectedOptions,
          subtotal: calcSubtotal(basePrice, selectedOptions, qty),
        }
        const items = [...get().items, item]
        set({ items })
      },

      updateItem: (cartId, qty, selectedOptions) => {
        const items = get().items.map(i =>
          i.cartId === cartId
            ? { ...i, qty, selectedOptions, subtotal: calcSubtotal(i.basePrice, selectedOptions, qty) }
            : i
        )
        set({ items })
      },

      removeItem: (cartId) => {
        const items = get().items.filter(i => i.cartId !== cartId)
        set({ items })
      },

      setMethod: (method) => set({ method }),
      setRemarks: (remarks) => set({ remarks }),

      clearCart: () => set({ items: [], method: null, remarks: '' }),

      // 총 수량
      totalQty: () => get().items.reduce((s, i) => s + i.qty, 0),

      // 메뉴소계 = Σ(subtotal)
      totalSubtotal: () => get().items.reduce((s, i) => s + i.subtotal, 0),

      // 배달료: 배달 선택 시에만 3,500원
      deliveryFee: () => get().method === '배달' ? DELIVERY_FEE : 0,

      // 총금액 = 메뉴소계 + 배달료
      totalAmount: () => {
        const { totalSubtotal, deliveryFee } = get()
        return totalSubtotal() + deliveryFee()
      },
    }),
    {
      name: 'sallaria-cart',
      storage: createJSONStorage(() => {
        // SSR 시 sessionStorage 접근 방지
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          }
        }
        return sessionStorage
      }),
    },
  ),
)
