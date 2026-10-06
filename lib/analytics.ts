import { getSupabaseClient } from '@/lib/supabase/client'

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return ''
  const key = 'sallaria_session_id'
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(key, id)
  }
  return id
}

export async function logEvent(
  eventName: string,
  properties: Record<string, unknown> = {},
  accountCode?: string,
) {
  if (typeof window === 'undefined') return
  try {
    const supabase = getSupabaseClient()
    await supabase.from('user_events').insert({
      session_id:   getOrCreateSessionId(),
      account_code: accountCode ?? null,
      event_name:   eventName,
      properties,
      platform:     'qr_web',
    })
  } catch {
    // 로깅 실패가 주문 흐름을 막으면 안 됨
  }
}
