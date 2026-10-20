// 분석 이벤트를 보낼 환경인지 — 개발 서버 트래픽을 프로덕션 지표에서 뺀다.
//
// 왜 필요했나: Firebase/Amplitude 어디에도 호스트 가드가 없어서 `pnpm dev` 중에 찍힌
// 이벤트가 그대로 프로덕션 지표에 섞였다. 2026-10 기준 `recent_menu_click` 29건 중
// 4건이 localhost:3100 / :3200 에서 온 것이었다(13.8%). 하루 수십 건 규모라 개발하며
// 몇 번 눌러본 게 바로 지표를 흔든다.
//
// 거부 목록으로 간다 — 허용 목록이면 나중에 도메인을 붙였을 때 조용히 수집이 끊긴다.
// 끊긴 건 티가 안 나고, 섞인 건 나중에 파내야 해서 전자가 더 비싸다.

/** 개발 호스트인가 — localhost · 127.0.0.1 · [::1] · *.localhost · *.test */
function isDevHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h.endsWith('.localhost') ||
    h.endsWith('.test')
  )
}

/** false 면 track/ampTrack 이 아무것도 보내지 않는다 */
export function isAnalyticsEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return !isDevHost(window.location.hostname)
  } catch {
    // location 접근이 막힌 샌드박스 등 — 섞이느니 안 보낸다
    return false
  }
}
