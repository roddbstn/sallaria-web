// 예상 수령시간 — 고객이 "몇 분 뒤에 받으러 올지" 고르는 값.
//
// 왜 필요한가:
//   선결제 주문은 결제가 이미 끝나 있어서 주문이 들어오는 즉시 주방이 조리를 시작한다.
//   그런데 점심 피크에 "10분 뒤 들를게요"인 주문과 "지금 문 앞"인 주문이 섞이면
//   먼저 조리한 음식이 식은 채로 기다린다. 수령시간을 받으면 주방이 조리 순서를 정할 수 있다.
//
// 분(minutes) 단위 offset 으로 다룬다 — 절대시각은 orders.ordered_at + 이 값으로 계산.
// DB: orders.requested_pickup_minutes (0 = 지금, NULL = 미선택)
//
// ⚠️ sunpos-kakao 에도 같은 목록이 있다. 칩을 바꾸면 양쪽을 같이 바꿀 것.
//    (별 레포라 import 가 안 된다 — 공용 패키지로 뽑을 만큼 크지 않아 복사본으로 둔다)

export interface PickupOption {
  /** 주문시각 기준 분. 0 = 지금 */
  minutes: number
  label: string
  /** true 면 눌러도 선택되지 않음 (안내 목적) */
  disabled?: boolean
}

export const PICKUP_OPTIONS: PickupOption[] = [
  { minutes: 0,  label: '지금' },
  { minutes: 5,  label: '+5분' },
  { minutes: 10, label: '+10분' },
  { minutes: 15, label: '+15분' },
  { minutes: 20, label: '+20분' },
  { minutes: 30, label: '+30분' },
  { minutes: 40, label: '+40분' },
  // 1시간 넘는 예약은 아직 안 받는다. 숨기지 않고 비활성으로 두는 이유:
  // 없으면 "왜 1시간은 없지?"로 끝나고, 보이면 "요청사항에 적으면 되는구나"로 이어진다.
  { minutes: 60, label: '1시간 이상', disabled: true },
]

/** 수령시간이 필요한 이용방법 — 배달은 그 자리에 주소 입력이 들어가고 도착시간이 거리에 달려 있다 */
export function needsPickupTime(method: string | null | undefined): boolean {
  return method === '포장' || method === '내점'
}

/** 주문시각 + 분 → '오후 12:40' */
function clockLabel(at: Date): string {
  const h24 = at.getHours()
  const ampm = h24 < 12 ? '오전' : '오후'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${ampm} ${h12}:${String(at.getMinutes()).padStart(2, '0')}`
}

/**
 * 선택 결과 카드에 쓸 한 줄.
 * 칩에 적힌 '+10분'을 그대로 되읊지 않고 "몇 시에 받는지"를 머리말로 올린다 —
 * 손님이 실제로 알고 싶은 건 분이 아니라 시각이다.
 *
 * 전엔 아래에 '지금부터 약 30분 뒤예요' 보조 줄이 하나 더 있었는데,
 * 바로 위 칩에서 이미 '+30분'을 고른 참이라 같은 말을 세 번 하는 셈이었다.
 */
export function pickupSummary(minutes: number, from: Date = new Date()): { headline: string } {
  if (minutes === 0) {
    return { headline: '지금 바로 받을 수 있어요' }
  }
  const at = new Date(from.getTime() + minutes * 60_000)
  return { headline: `${clockLabel(at)}쯤 받을 수 있어요` }
}
