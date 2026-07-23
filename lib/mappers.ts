import type { Menu, MenuOptionGroup } from './types'

// DB row → Menu 타입 변환 (menu/page.tsx, menu/[code]/menu-detail-client.tsx 공용)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapDbMenu(row: any): Menu {
  const options: MenuOptionGroup[] = (row.menu_option_groups ?? [])
    .sort((a: any, b: any) => a.display_order - b.display_order)
    .filter((mog: any) => !mog.option_groups?.is_hidden)
    .map((mog: any) => {
      const og = mog.option_groups
      return {
        group:     og.name,
        required:  og.is_required,
        multi:     og.is_multi,
        isSoldOut: og.is_sold_out ?? false,
        items: (og.option_items ?? [])
          .filter((it: any) => !it.is_hidden)
          .sort((a: any, b: any) => a.display_order - b.display_order)
          .map((it: any) => ({
            id:        it.id,
            name:      it.name,
            plus:      it.extra_price,
            isSoldOut: it.is_sold_out,
          })),
      }
    })

  return {
    code:      row.id,
    cat:       row.category_id,
    name:      row.name,
    desc:      row.description ?? '',
    price:     row.base_price,
    emoji:     '🍽️',
    imageUrl:  row.image_url ?? undefined,
    popular:     row.is_popular     ?? false,
    recommended: row.is_recommended ?? false,
    isNew:       row.is_new         ?? false,
    isSoldOut:   row.is_sold_out,
    isHidden:    row.is_hidden,
    options,
  }
}
