import { createClient } from '@supabase/supabase-js'

// singleton 인스턴스 (DB 스키마 타입 없이 any로 사용)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: any = null

export function getSupabaseClient() {
  if (client) return client

  client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  return client
}
