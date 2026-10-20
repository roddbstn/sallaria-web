'use client'

import { useEffect, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { track } from '@/lib/firebase'
import { ampTrack } from '@/lib/amplitude'
import { personProps } from '@/lib/person-key'
import LoadingTimer from '@/components/ui/loading-timer'

// ── 주문자 선택 하단 시트 ────────────────────────────────────────────────────
//
// PIN 을 통과한 뒤 "누가 주문하시나요?"를 묻는 자리.
//
// 처음엔 전체 화면 한 장으로 만들었다가 시트로 바꿨다. 화면을 통째로 갈아끼우면
// 단계가 하나 더 늘어난 것처럼 느껴지는데, PIN 화면이 뒤에 어둡게 남아 있으면
// "인증은 끝났고 한 가지만 더"로 읽힌다. 실제로 하는 일도 그쪽에 가깝다 —
// 거래처 인증은 PIN 이 이미 끝냈고, 여기서 고르는 건 그 안의 사람일 뿐이다.
//
// 두 곳에서 쓴다:
//   · 루트(/)      — PIN 성공 직후 자동으로 올라옴
//   · 메뉴(/menu)  — 이름 옆 '변경' 버튼으로 다시 올림
//
// 명단에는 **이름과 마지막 주문 시점만** 내려온다(list_account_members RPC).
// 전화번호는 고른 뒤에 따로 읽는다.

export interface MemberRow {
  id:              string
  name:            string
  order_count:     number
  last_ordered_at: string | null
}

/** '어제' · '3일 전' — 동명이인을 가를 때 쓰는 단서 */
function sinceLabel(iso: string | null): string {
  if (!iso) return ''
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return '오늘'
  if (days === 1) return '어제'
  if (days < 7)   return `${days}일 전`
  if (days < 30)  return `${Math.floor(days / 7)}주 전`
  return `${Math.floor(days / 30)}개월 전`
}

export default function OrdererSheet({
  open, accountCode, currentName, onPick, onSkip, onClose,
}: {
  open:        boolean
  accountCode: string
  /** 이미 고른 사람이 있으면 그 카드를 선택 상태로 */
  currentName?: string
  onPick: (m: MemberRow) => void
  /** '명단에 없어요' — 체크아웃에서 직접 입력하는 기존 흐름으로 */
  onSkip: () => void
  /** 바깥 탭·닫기. 아직 아무도 안 고른 첫 노출에서는 넘기지 않는다(닫을 수 없게) */
  onClose?: () => void
}) {
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  // 닫히는 애니메이션이 끝날 때까지 DOM 에 남겨둔다 — 바로 지우면 내려가는 모습이 안 보인다
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (open) { setMounted(true); setClosing(false); return }
    if (!mounted) return
    setClosing(true)
    const t = setTimeout(() => { setMounted(false); setClosing(false) }, 220)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open || !accountCode) return
    let cancelled = false
    setLoading(true)
    getSupabaseClient()
      .rpc('list_account_members', { p_account_code: accountCode })
      .then(({ data, error }: { data: unknown; error: unknown }) => {
        if (cancelled) return
        const list = error ? [] : ((data ?? []) as MemberRow[])
        setMembers(list)
        setLoading(false)
        if (list.length > 0) {
          track('member_list_shown', { account_code: accountCode, count: list.length })
          ampTrack('member_list_shown', { account_code: accountCode, count: list.length })
        }
      })
    return () => { cancelled = true }
  }, [open, accountCode])

  // 시트가 떠 있는 동안 뒤 화면이 스크롤되지 않게
  useEffect(() => {
    if (!mounted) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [mounted])

  if (!mounted) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* 뒷배경 — 누르면 닫힌다(onClose 를 준 경우에만) */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/45 ${closing ? 'backdrop-out' : 'backdrop-in'}`}
      />

      <div
        className={`relative w-full max-w-[430px] bg-surface rounded-t-[24px] pt-3 pb-8 max-h-[82dvh] flex flex-col ${
          closing ? 'sheet-out' : 'sheet-in'
        }`}
      >
        {/* 손잡이 — 끌어올린 종이라는 걸 알려주는 유일한 단서 */}
        <div className="mx-auto w-[42px] h-[4px] rounded-full bg-[#E0E0E0] mb-4 flex-shrink-0" />

        <div className="px-5 pb-4 flex-shrink-0">
          <h2 className="text-[22px] font-extrabold text-[#222222] leading-tight">
            누가 주문하시나요?
          </h2>
        </div>

        {/* pt-1: overflow 컨테이너가 첫 줄 카드의 윗변을 1~2px 잘라먹는다.
            스크롤 박스는 자기 패딩 박스 경계에서 자르는데, 카드가 그 선에 딱 붙어 있어서다. */}
        <div className="px-5 pt-1 flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-10 flex justify-center">
              <LoadingTimer size={40} />
            </div>
          ) : members.length === 0 ? (
            <p className="py-8 text-center text-[14px] text-[#727272] leading-relaxed">
              아직 등록된 주문자가 없어요.<br />주문할 때 이름을 직접 입력해 주세요.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 pb-2">
              {members.map((m, i) => {
                const picked = currentName === m.name
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      // 누가 골랐는지 사람별로 갈라 본다. 이름 그대로는 안 보낸다 —
                      // orderer_masked('장○○') + orderer_key(고정 해시)만 (lib/person-key.ts).
                      const p = {
                        account_code: accountCode,
                        order_count:  m.order_count,
                        rank:         i + 1,          // 명단에서 몇 번째 칸이었나
                        ...personProps(m.name),
                      }
                      track('member_pick', p)
                      ampTrack('member_pick', p)
                      onPick(m)
                    }}
                    className={`sheet-pick flex flex-col items-start gap-1 px-4 py-[18px] rounded-2xl text-left ${
                      picked ? 'bg-[#E6F4EC]' : 'bg-[#F2F2F2] active:bg-[#E6E6E6]'
                    }`}
                  >
                    <span className={`text-[16px] font-semibold truncate w-full ${picked ? 'text-green' : 'text-[#222222]'}`}>
                      {m.name}
                    </span>
                    {m.last_ordered_at && (
                      /* 선택된 카드는 **두 줄 다** 초록 — 이름만 바꾸면 아래 날짜가 혼자 회색으로
                         남아 "반쯤 선택된" 것처럼 보인다 */
                      <span className={`text-[12px] truncate w-full ${picked ? 'text-green' : 'text-[#727272]'}`}>
                        {sinceLabel(m.last_ordered_at)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* 명단에 없는 사람도 막지 않는다 — 체크아웃에서 이름·전화번호를 직접 받는
            기존 흐름으로 그냥 넘긴다. 여기서 가로막으면 신규 직원이 주문을 못 한다. */}
        <div className="px-5 pt-3 flex-shrink-0">
          <button
            onClick={() => {
              track('member_skip', { account_code: accountCode })
              ampTrack('member_skip', { account_code: accountCode })
              onSkip()
            }}
            className="w-full py-3.5 text-[14px] text-[#727272] underline underline-offset-2"
          >
            명단에 없어요 (처음 주문해요)
          </button>
        </div>
      </div>
    </div>
  )
}
