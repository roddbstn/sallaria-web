import type { Menu } from '@/lib/types'
import { formatWon } from '@/lib/utils'
import MenuBadges from './menu-badges'

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
        'flex flex-row-reverse gap-[14px] py-[14px] px-2 -mx-2 rounded-xl cursor-pointer',
        'transition-colors hover:bg-gray-bg active:bg-gray-bg',
        isSoldOut ? 'pointer-events-none opacity-50' : '',
      ].join(' ')}
    >
      {/* 이미지 썸네일 */}
      <div className="relative flex-shrink-0 w-[88px] h-[88px]">
        <div className="w-[88px] h-[88px] bg-gray-50 rounded-xl overflow-hidden flex items-center justify-center text-[38px]">
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
        {!isSoldOut && (
          <div className="absolute bottom-[6px] right-[6px] w-[26px] h-[26px] bg-surface rounded-full flex items-center justify-center pointer-events-none"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <line x1="5.5" y1="2" x2="5.5" y2="9" stroke="#1E1E1E" strokeWidth="1.8" strokeLinecap="round"/>
              <line x1="2" y1="5.5" x2="9" y2="5.5" stroke="#1E1E1E" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
        )}
      </div>

      {/* 텍스트 영역 */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-[4px]">
        {!isSoldOut && <MenuBadges popular={menu.popular} recommended={menu.recommended} isNew={menu.isNew} />}
        <p className="text-[16px] font-semibold text-ink leading-snug">{menu.name}</p>
        <p className="text-[12px] text-gray-text leading-snug line-clamp-2">{menu.desc}</p>
        <p className="text-[15px] font-normal text-ink mt-[2px]">{formatWon(menu.price)}</p>
      </div>
    </div>
  )
}
