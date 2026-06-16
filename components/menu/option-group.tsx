import type { MenuOptionGroup } from '@/lib/types'
import { formatWon } from '@/lib/utils'

interface OptionGroupProps {
  group: MenuOptionGroup
  groupIndex: number
  selectedIds: string[]
  onToggle: (groupIndex: number, itemId: string) => void
  isMissing?: boolean
  basePrice?: number  // '가격' 그룹에서 최종가 표시용
}

export default function OptionGroup({
  group,
  groupIndex,
  selectedIds,
  onToggle,
  isMissing = false,
  basePrice,
}: OptionGroupProps) {
  // 가격/사이즈 그룹: 최종가 표시 여부
  const showFinalPrice = ['가격', '사이즈'].includes(group.group) && basePrice !== undefined

  return (
    <div className={[
      'border-t border-[#F0F0F0]',
      isMissing ? 'border-l-[3px] border-l-[#C92A2A]' : '',
    ].join(' ')}>
      {/* 그룹 헤더 */}
      <div className="flex items-center gap-2 px-5 py-3">
        <span className="text-[14px] font-bold text-[#1E1E1E]">{group.group}</span>
        {group.required ? (
          <span className="text-[11px] font-semibold text-[#C92A2A] bg-[#FFF0F0] px-[7px] py-[2px] rounded-full">
            필수
          </span>
        ) : (
          <span className="text-[11px] font-semibold text-[#727272] bg-[#F5F5F5] px-[7px] py-[2px] rounded-full">
            {group.multi ? '복수선택' : '선택'}
          </span>
        )}
      </div>

      {/* 옵션 아이템 목록 */}
      <div className="pb-1">
        {group.items.map((item) => {
          const isSelected = selectedIds.includes(item.id)
          const isSoldOut = item.isSoldOut ?? false

          // 가격 표시 로직
          let priceLabel = ''
          if (showFinalPrice && basePrice !== undefined) {
            priceLabel = formatWon(basePrice + item.plus)
          } else if (item.plus > 0) {
            priceLabel = `+${formatWon(item.plus)}`
          } else if (item.plus === 0 && !showFinalPrice) {
            priceLabel = '포함'
          }

          return (
            <button
              key={item.id}
              type="button"
              disabled={isSoldOut}
              onClick={() => !isSoldOut && onToggle(groupIndex, item.id)}
              className={[
                'w-full flex items-center justify-between px-5 py-[13px] text-left',
                'transition-colors hover:bg-[#FAFAFA]',
                isSoldOut ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              <div className="flex items-center gap-3">
                {/* 선택 인디케이터: 단일=원형, 복수=사각형 */}
                {group.multi ? (
                  <div className={[
                    'w-[20px] h-[20px] rounded-[4px] border-2 flex items-center justify-center flex-shrink-0',
                    isSelected
                      ? 'bg-[#017333] border-[#017333]'
                      : 'border-[#D7D7D7]',
                  ].join(' ')}>
                    {isSelected && (
                      <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                        <path d="M1 4L4.5 7.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                ) : (
                  <div className={[
                    'w-[20px] h-[20px] rounded-full border-2 flex items-center justify-center flex-shrink-0',
                    isSelected
                      ? 'border-[#017333]'
                      : 'border-[#D7D7D7]',
                  ].join(' ')}>
                    {isSelected && (
                      <div className="w-[10px] h-[10px] rounded-full bg-[#017333]" />
                    )}
                  </div>
                )}

                <span className={[
                  'text-[14px]',
                  isSelected ? 'font-semibold text-[#1E1E1E]' : 'text-[#1E1E1E]',
                  isSoldOut ? 'line-through text-[#727272]' : '',
                ].join(' ')}>
                  {item.name}
                  {isSoldOut && <span className="ml-2 text-[11px] text-[#727272]">품절</span>}
                </span>
              </div>

              {priceLabel && (
                <span className={[
                  'text-[13px] font-semibold flex-shrink-0',
                  isSelected ? 'text-[#017333]' : 'text-[#727272]',
                  showFinalPrice ? 'text-[14px]' : '',
                ].join(' ')}>
                  {priceLabel}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
