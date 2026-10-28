// "다른 가게도 선결제하고 계세요?" — 손님이 알려주는 선결제 가게 제보.
//
// 선결제를 이미 쓰고 있는 가게는 가장 좋은 후보다. 설득할 게 아니라
// 이미 하고 있는 일을 편하게 해주면 되니까.
//
// 제보할 이유는 하나뿐이다: **그 가게가 선포스를 시작하면 알려주기로 한 약속.**
//
// ⚠️ 이 앱(PIN 방식)은 Supabase Auth 를 쓰지 않아 auth.uid() 가 없다.
//    store_leads 의 RLS 는 `insert to authenticated` 라서 **직접 INSERT 는 거절된다.**
//    그래서 anon 이 부를 수 있는 RPC(submit_store_lead)를 거친다 —
//    supabase/migrations/0014_store_leads_pin_path.sql 참고.
//    (sunpos-kakao 는 로그인이 있어 같은 테이블에 직접 INSERT 한다. 같은 표, 다른 길)

import { getSupabaseClient } from './supabase/client'

export interface PlaceResult {
  placeId:     string
  name:        string
  roadAddress: string
  phone:       string
  lat:         number
  lng:         number
  category:    string
}

/**
 * 가게 이름으로 검색 — 카카오 로컬 API(Edge Function 프록시).
 *
 * 키를 브라우저에서 직접 쓰지 않는다. near 를 주면 그 좌표 근처부터 —
 * 손님이 말하는 가게는 대개 그 동네에 있다.
 */
export async function searchPlaces(
  query: string,
  near?: { lat: number; lng: number },
): Promise<PlaceResult[]> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.functions.invoke('place-search', {
    body: { query, ...(near ?? {}) },
  })
  if (error) throw error
  return (data?.places ?? []) as PlaceResult[]
}

export interface StoreLeadInput {
  /** 지금 로그인한 거래처 — 누가 알려줬는지의 근거 */
  accountCode: string
  /** 주문자명 — 로그인이 없으니 사람은 이 이름으로만 남는다 */
  reporter:    string
  storeName:   string
  placeId?:    string | null
  roadAddress?: string | null
  phone?:      string | null
  lat?:        number | null
  lng?:        number | null
  memo?:       string | null
  notifyConsent: boolean
}

export async function submitStoreLead(input: StoreLeadInput): Promise<void> {
  const supabase = getSupabaseClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('submit_store_lead', {
    p_account_code: input.accountCode,
    p_reporter:     input.reporter,
    p_store_name:   input.storeName.trim(),
    p_place_id:     input.placeId ?? null,
    p_road_address: input.roadAddress ?? null,
    p_phone:        input.phone ?? null,
    p_lat:          input.lat ?? null,
    p_lng:          input.lng ?? null,
    p_memo:         input.memo?.trim() || null,
    p_notify:       input.notifyConsent,
  })

  // RPC 가 raise exception 으로 보낸 문구를 그대로 쓴다 —
  // "이미 알려주신 가게예요" 같은 말은 서버가 더 정확히 안다.
  if (error) throw new Error(error.message || '보내지 못했어요. 잠시 후 다시 시도해 주세요')
}
