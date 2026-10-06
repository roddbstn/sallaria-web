interface MenuBadgesProps {
  popular?: boolean
  recommended?: boolean
  isNew?: boolean
}

// 메뉴카드 + 메뉴상세 화면 공용 "인기/추천/신메뉴" 배지
export default function MenuBadges({ popular, recommended, isNew }: MenuBadgesProps) {
  if (!popular && !recommended && !isNew) return null

  return (
    <div className="flex gap-1 flex-wrap">
      {popular && <span style={{ backgroundColor: '#F97316', color: 'white' }} className="inline-block w-fit text-[13px] font-bold px-[8px] py-[2px] rounded-full">인기</span>}
      {recommended && <span style={{ backgroundColor: '#16a84c', color: 'white' }} className="inline-block w-fit text-[13px] font-bold px-[8px] py-[2px] rounded-full">추천</span>}
      {isNew && <span style={{ backgroundColor: '#1D6FE8', color: 'white' }} className="inline-block w-fit text-[13px] font-bold px-[8px] py-[2px] rounded-full">신메뉴</span>}
    </div>
  )
}
