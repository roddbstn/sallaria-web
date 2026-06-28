import { Suspense } from 'react'
import { createClient } from '@supabase/supabase-js'
import MenuDetailClient from './menu-detail-client'


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
  return (
    <Suspense>
      <MenuDetailClient code={code} />
    </Suspense>
  )
}
