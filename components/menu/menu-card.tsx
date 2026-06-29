import type { Menu } from '@/lib/types'
import { formatWon } from '@/lib/utils'

interface MenuCardProps {
  menu: Menu
  onClick: () => void
}

export default function MenuCard({ menu, onClick }: MenuCardProps) {
  const isSoldOut = menu.isSoldOut ?? false

  return (
    <div
      role="button"
      tabIndex={isSoldOut ? -1 : 0}
      onClick={isSoldOut ? undefined : onClick}
      onKeyDown={(e) => {
        if (!isSoldOut && (e.key === 'Enter' || e.key === ' ')) onClick()
      }}
      className={[
        'flex flex-row-reverse gap-[14px] py-[14px] cursor-pointer',
        isSoldOut ? 'pointer-events-none opacity-50' : '',
      ].join(' ')}
    >
      {/* 이미지 썸네일 */}
      <div className="relative flex-shrink-0">
        <div className="w-[88px] h-[88px] bg-[#F5F5F5] rounded-xl overflow-hidden flex items-center justify-center text-[38px]">
          {menu.imageUrl
            ? <img src={menu.imageUrl} alt={menu.name} className="w-full h-full object-cover" />
            : menu.emoji
          }
        </div>
        {isSoldOut && (
          <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center">
            <span className="text-white text-[11px] font-bold">품절</span>
          </div>
        )}
      </div>

      {/* 텍스트 영역 */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-[4px]">
        {/* 인기 태그 */}
        {menu.popular && !isSoldOut && (
          <span className="inline-block w-fit text-[11px] font-bold text-[#017333] bg-[#E6F4EC] px-[8px] py-[2px] rounded-full">
            인기
          </span>
        )}
        <p className="text-[16px] font-semibold text-[#1E1E1E] leading-snug">{menu.name}</p>
        <p className="text-[12px] text-[#727272] leading-snug line-clamp-2">{menu.desc}</p>
        <p className="text-[15px] font-medium text-[#1E1E1E] mt-[2px]">{formatWon(menu.price)}</p>
      </div>
    </div>
  )
}
