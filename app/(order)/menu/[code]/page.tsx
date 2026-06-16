import { MENUS } from '@/lib/mock-data'
import MenuDetailClient from './menu-detail-client'

export function generateStaticParams() {
  return MENUS.map(m => ({ code: m.code }))
}

export default async function MenuDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <MenuDetailClient code={code} />
}
