import { createClient } from '@supabase/supabase-js'
import MenuDetailClient from './menu-detail-client'

// output: 'export' 에서 정적 생성. Firebase rewrite (**→/index.html)가 fallback 처리함.
export const dynamicParams = false

export async function generateStaticParams() {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return [{ code: '__placeholder__' }]

  try {
    const supabase = createClient(url, anon)
    const { data } = await supabase
      .from('menus')
      .select('id')
      .eq('is_hidden', false)

    const ids = (data ?? []).map((m: { id: string }) => ({ code: m.id }))
    return ids.length > 0 ? ids : [{ code: '__placeholder__' }]
  } catch {
    return [{ code: '__placeholder__' }]
  }
}

export default async function MenuDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <MenuDetailClient code={code} />
}
