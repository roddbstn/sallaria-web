'use client'

import { useEffect, useRef, useState } from 'react'
import { searchPlaces, submitStoreLead, type PlaceResult } from '@/lib/store-leads'

// "다른 가게도 선결제하고 계세요?" 중앙 모달.
//
// 흐름은 한 화면이다 — 검색해서 고르거나, 없으면 직접 적는다.
// 단계를 나누지 않은 이유: 제보는 호의로 하는 일이라 단계가 늘수록 그냥 닫는다.
//
// ⚠️ 이 앱은 로그인이 없다 — 제보는 anon RPC(submit_store_lead)로 간다(lib/store-leads.ts).
//
// ⚠️ **직접 입력 길이 반드시 있어야 한다.** 선결제를 쓰는 곳은 작은 가게가 많아
//    카카오 장소 DB 에 없거나 이름이 다르게 올라 있다. 검색만 두면
//    "우리가 가장 찾고 싶은 가게"가 제보되지 못한다.

export default function OtherStoreLeadSheet({
  storeLocation, accountCode, reporter, onClose, onDone,
}: {
  /** 지금 매장 좌표 — 검색 결과를 이 동네부터 보여주기 위해 */
  storeLocation?: { lat: number; lng: number } | null
  /** 로그인이 없는 앱이라 '누가'는 거래처 + 주문자명으로만 남는다 */
  accountCode: string
  reporter:    string
  onClose: () => void
  onDone: () => void
}) {
  const [query,   setQuery]   = useState('')
  const [picked,  setPicked]  = useState<PlaceResult | null>(null)
  /** 검색에 없어서 직접 적는 중 */
  const [manual,  setManual]  = useState(false)
  const [memo,    setMemo]    = useState('')
  const [notify,  setNotify]  = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [done,    setDone]    = useState(false)

  /**
   * 검색 결과를 **그 결과를 만든 질의와 함께** 들고 있는다.
   *
   * 이렇게 두면 "찾는 중"·"결과 없음"·"비우기" 가 모두 query 에서 파생돼 effect 안에서
   * 상태를 건드릴 일이 없다(cascading render 가 사라진다). 결과만 들고 있으면
   * 글자를 지우는 순간 지난 질의의 결과가 남아 다른 가게가 선택돼 보이는 문제도 있다.
   *
   * failed: 검색 **실패**와 **결과 없음**은 다르다 — 같은 문구로 보여주면
   * 서버 설정이 빠진 상황에서 손님은 "그런 가게 없네" 로 오해하고 그냥 닫는다.
   */
  const [found, setFound] = useState<{ q: string; places: PlaceResult[]; failed: boolean } | null>(null)

  const q       = query.trim()
  const active  = !manual && q.length >= 2
  const fresh   = found && found.q === q ? found : null
  const results = fresh?.places ?? []
  const searching   = active && !fresh
  const searchFailed = !!fresh?.failed

  // 검색 — 입력이 멎고 300ms 뒤에 한 번. 글자마다 부르면 카카오 호출만 늘고
  // 결과가 입력을 못 따라와 깜빡인다.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!active || fresh) return

    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      searchPlaces(q, storeLocation ?? undefined)
        .then(places => setFound({ q, places, failed: false }))
        .catch(()     => setFound({ q, places: [], failed: true }))
    }, 300)

    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [q, active, fresh, storeLocation])

  const canSubmit = manual ? q.length > 0 : !!picked

  async function submit() {
    if (!canSubmit || saving) return
    setSaving(true); setError('')
    try {
      await submitStoreLead({
        accountCode,
        reporter,
        storeName:   manual ? query : picked!.name,
        placeId:     manual ? null : picked!.placeId,
        roadAddress: manual ? null : picked!.roadAddress,
        phone:       manual ? null : picked!.phone,
        lat:         manual ? null : picked!.lat,
        lng:         manual ? null : picked!.lng,
        memo,
        notifyConsent: notify,
      })
      setDone(true)
    } catch (e) {
      setError((e as Error).message || '보내지 못했어요. 잠시 후 다시 시도해 주세요')
      setSaving(false)
    }
  }

  const field = 'w-full h-[48px] px-4 rounded-xl border border-[#D7D7D7] text-[15px] text-[#1E1E1E] placeholder:text-[#C4C4C4] outline-none focus:border-[#1E1E1E] transition-colors'

  // 중앙 모달이다(전엔 하단 시트였다).
  //
  // 모션(searchModalOpen)이 원래 scale(0)→scale(1) 팝이라 하단에서 올라오는 시트에는
  // 애초에 안 맞았다 — 아래에 붙은 채로 커지기만 했다. 중앙이 그 모션의 자리다.
  //
  // 테두리·너비·배경은 이 앱의 다른 중앙 모달(feedback-modal · notice-modal)과 맞췄다.
  // max-h 와 안쪽 스크롤은 남긴다 — 검색 결과가 길어질 수 있다.
  // dvh 를 쓰는 이유: 입력창에 포커스가 가면 키보드가 올라와 화면이 줄어드는데,
  // vh 로 두면 모달이 키보드 아래로 밀려 내려간다.
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[380px] bg-surface rounded-[24px] flex flex-col max-h-[80dvh] overflow-hidden"
        style={{ animation: 'searchModalOpen 0.28s cubic-bezier(0.34, 1.4, 0.64, 1)' }}
        onClick={e => e.stopPropagation()}
      >
        {done ? (
          // 보내고 나면 **약속을 다시 말해준다.** 제보할 이유가 그거였으니,
          // 끝나는 화면에서 "그래서 뭐가 돌아오나"를 한 번 더 확인시켜 준다.
          <div className="px-5 pt-8 pb-6 text-center">
            <div className="text-[34px] mb-3">🙏</div>
            <h2 className="text-[19px] font-bold text-[#1E1E1E] leading-snug mb-2">
              알려주셔서 고맙습니다
            </h2>
            <p className="text-[14px] text-[#727272] leading-relaxed">
              {notify
                ? <>그 가게가 선포스를 시작하면<br />문자로 알려드릴게요.</>
                : <>알려주신 가게를 확인해 볼게요.</>}
            </p>
            <button
              onClick={() => { onDone(); onClose() }}
              className="mt-6 w-full py-4 rounded-xl bg-ink text-white text-[16px] font-bold active:scale-95 transition-transform"
            >
              확인
            </button>
          </div>
        ) : (
          <>
            <div className="px-5 pt-6 pb-4 flex-shrink-0">
              <h2 className="text-[19px] font-bold text-[#1E1E1E] leading-snug">
                어느 가게에서 선결제하고 계세요?
              </h2>
              <p className="text-[13px] text-[#727272] mt-1.5 leading-relaxed">
                알려주시면 그 가게가 선포스를 시작할 때 문자로 알려드려요.
              </p>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-4">
              <input
                autoFocus
                value={query}
                onChange={e => { setQuery(e.target.value); setPicked(null) }}
                placeholder={manual ? '가게 이름을 적어주세요' : '가게 이름으로 찾기'}
                className={field}
              />

              {!manual && (
                <>
                  {searching && (
                    <p className="text-[13px] text-[#ADADAD] mt-3 px-1">찾는 중…</p>
                  )}

                  {!searching && results.length > 0 && (
                    <div className="mt-3 flex flex-col gap-1.5">
                      {results.map(p => {
                        const on = picked?.placeId === p.placeId
                        return (
                          <button
                            key={p.placeId}
                            onClick={() => setPicked(p)}
                            className={`text-left rounded-xl px-3.5 py-3 transition-colors ${
                              on ? 'border-[1.5px] border-[#1E1E1E] bg-[#FAFAFA]' : 'border border-[#E8E8E8]'
                            }`}
                          >
                            <p className="text-[14px] font-semibold text-[#1E1E1E] leading-snug">{p.name}</p>
                            {p.roadAddress && (
                              <p className="text-[12px] text-[#727272] leading-snug mt-1">{p.roadAddress}</p>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {!searching && active && results.length === 0 && (
                    searchFailed ? (
                      // 검색이 안 되는 건 우리 쪽 문제다. 손님을 막지 말고 바로 다음 길을 준다.
                      <button
                        onClick={() => setManual(true)}
                        className="mt-3 w-full text-left rounded-xl bg-[#FFF8F0] px-3.5 py-3"
                      >
                        <p className="text-[13px] font-semibold text-[#1E1E1E] leading-snug">
                          지금 검색이 잘 안 돼요
                        </p>
                        <p className="text-[12px] text-[#727272] leading-relaxed mt-0.5">
                          가게 이름을 직접 적어주시면 저희가 찾아볼게요
                        </p>
                      </button>
                    ) : (
                      <p className="text-[13px] text-[#ADADAD] mt-3 px-1">검색 결과가 없어요</p>
                    )
                  )}

                  {/* 검색에 없는 가게가 오히려 우리가 찾는 곳일 수 있다 — 늘 보이게 둔다 */}
                  <button
                    onClick={() => { setManual(true); setPicked(null) }}
                    className="mt-3 w-full text-left px-1 py-2 text-[13px] font-semibold text-[#1E1E1E] underline underline-offset-2"
                  >
                    검색에 없나요? 직접 적을게요
                  </button>
                </>
              )}

              {manual && (
                <button
                  onClick={() => setManual(false)}
                  className="mt-3 w-full text-left px-1 py-2 text-[13px] font-semibold text-[#727272] underline underline-offset-2"
                >
                  ← 검색으로 찾기
                </button>
              )}

              <div className="mt-4">
                <label className="block text-[13px] font-semibold text-[#727272] mb-2">
                  남기고 싶은 말 <span className="font-normal text-[#ADADAD]">(선택)</span>
                </label>
                <textarea
                  value={memo}
                  onChange={e => setMemo(e.target.value.slice(0, 200))}
                  rows={2}
                  placeholder="예) 여기도 과에서 선결제로 쓰고 있어요"
                  className="w-full rounded-xl border border-[#D7D7D7] px-4 py-3 text-[15px] text-[#1E1E1E] placeholder:text-[#C4C4C4] outline-none focus:border-[#1E1E1E] resize-none transition-colors"
                />
              </div>

              {/* 약속을 끌 수 있게 둔다 — 알림을 원치 않는 사람에게 문자를 보내면 안 된다 */}
              <label className="mt-4 flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notify}
                  onChange={e => setNotify(e.target.checked)}
                  className="mt-0.5 w-[18px] h-[18px] flex-shrink-0 accent-[#1E1E1E]"
                />
                <span className="text-[13px] text-[#1E1E1E] leading-relaxed">
                  이 가게가 선포스를 시작하면 문자로 알려주세요
                </span>
              </label>

              {error && <p className="text-[13px] text-[#C92A2A] mt-3 px-1">{error}</p>}
            </div>

            <div className="flex-shrink-0 px-5 pb-5 pt-2 flex gap-2">
              <button
                onClick={onClose}
                disabled={saving}
                className="flex-shrink-0 px-5 py-4 rounded-xl bg-[#F2F2F2] text-[#727272] text-[15px] font-bold active:scale-95 transition-transform disabled:opacity-40"
              >
                닫기
              </button>
              <button
                onClick={submit}
                disabled={!canSubmit || saving}
                className="flex-1 py-4 rounded-xl bg-ink text-white text-[16px] font-bold active:scale-95 transition-transform disabled:opacity-30"
              >
                {saving ? '보내는 중…' : '알려주기'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
