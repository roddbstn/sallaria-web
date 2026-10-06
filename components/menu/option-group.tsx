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
  // 사이즈 그룹: 이름 + 우측 최종가 표시
  const showFinalPrice = group.group === '사이즈' && basePrice !== undefined
  // 가격 그룹: 이름 자체를 현재가(basePrice + extra)로 대체
  const isGaGyeok = (group.group === '가격' || group.group === '가격(필수)') && basePrice !== undefined
  // 그룹 전체 품절
  const groupSoldOut = group.isSoldOut ?? false

  return (
    <div className={[
      isMissing ? 'border-l-[3px] border-l-danger' : '',
      groupSoldOut ? 'opacity-50' : '',
    ].join(' ')}>
      {/* 그룹 헤더 */}
      <div className="flex items-center justify-between px-5 py-3">
        <span className="text-[16px] font-bold text-ink">{group.group}</span>
        {groupSoldOut ? (
          <span className="text-[11px] font-semibold text-white bg-gray-text px-[7px] py-[2px] rounded-full">
            품절
          </span>
        ) : group.required ? (
          <span className="text-[11px] font-semibold uppercase tracking-wide text-danger">
            필수
          </span>
        ) : (
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-text">
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
          // - 가격 그룹: 이름을 현재가로 대체, 우측 라벨 없음
          // - 사이즈 그룹: 이름 유지, 우측에 최종가
          // - 기타: +가격 또는 포함
          const displayName = isGaGyeok
            ? formatWon(basePrice! + item.plus)
            : item.name

          let priceLabel = ''
          if (!isGaGyeok) {
            if (showFinalPrice && basePrice !== undefined) {
              priceLabel = formatWon(basePrice + item.plus)
            } else if (item.plus > 0) {
              priceLabel = `+${formatWon(item.plus)}`
            } else if (item.plus === 0 && !showFinalPrice && isSoldOut) {
              priceLabel = '품절'
            }
          }

          return (
            <div
              key={item.id}
              onClick={() => !isSoldOut && !groupSoldOut && onToggle(groupIndex, item.id)}
              className={[
                'w-full flex items-center justify-between px-5 py-[13px]',
                isSoldOut ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              <div className="flex items-center gap-3">
                {/* 선택 인디케이터: 단일=원형, 복수=사각형 — 이 부분만 눌림 인터랙션 */}
                {group.multi ? (
                  <div className={[
                    'w-[20px] h-[20px] rounded-[4px] border-2 flex items-center justify-center flex-shrink-0',
                    'transition-transform active:scale-90',
                    isSelected
                      ? 'bg-green border-green'
                      : 'border-gray-border',
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
                    'transition-transform active:scale-90',
                    isSelected
                      ? 'border-green'
                      : 'border-gray-border',
                  ].join(' ')}>
                    {isSelected && (
                      <div className="w-[10px] h-[10px] rounded-full bg-green" />
                    )}
                  </div>
                )}

                <span className={[
                  'text-[14px] text-ink',
                  isSelected ? 'font-semibold' : '',
                  isSoldOut ? 'text-[#ABABAB]' : '',
                ].join(' ')}>
                  {displayName}
                </span>
              </div>

              {priceLabel && (
                <span className={[
                  'text-[13px] flex-shrink-0',
                  isSelected ? 'font-semibold text-green' : 'font-normal text-[#ABABAB]',
                  showFinalPrice ? 'text-[14px]' : '',
                ].join(' ')}>
                  {priceLabel}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
