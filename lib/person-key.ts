// 분석에 사람을 구분해 보내되, **이름 그대로는 내보내지 않기** 위한 유틸.
//
// 점주가 알고 싶은 건 "누가 어떤 메뉴를 고르나"라 사람을 구분할 수단이 필요하다.
// 그런데 주문자는 대부분 공무원이고, 이름은 개인정보다. 체크아웃의 동의 문구가 덮는 건
// "매장이 이름·전화번호를 수집한다"이지 "해외 분석 서비스로 보낸다"가 아니다.
//
// 그래서 두 가지만 보낸다:
//   orderer_masked — '김○○'  (사람 읽기용. 누군지 특정되진 않지만 화면에서 구분은 된다)
//   orderer_key    — 이름에서 만든 짧은 고정 해시 (세그먼트·퍼널의 기준)
// 같은 이름이면 늘 같은 키가 나오므로 Amplitude 에서 사람별 분해가 그대로 된다.
// 키 → 실명은 매장이 자기 DB(account_members)로만 되돌릴 수 있다.

/** '장혜령' → '장○○' · 'ㄱㅇ' → 'ㄱ○' */
export function maskName(name: string): string {
  const n = name.trim()
  if (!n) return ''
  if (n.length === 1) return n
  return n[0] + '○'.repeat(n.length - 1)
}

/** 이름 → 8자 고정 키. 같은 이름이면 항상 같은 값 (FNV-1a) */
export function personKey(name: string): string {
  const n = name.trim()
  if (!n) return ''
  let h = 0x811c9dc5
  for (let i = 0; i < n.length; i++) {
    h ^= n.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36).padStart(7, '0').slice(0, 8)
}

/** 이벤트에 붙이는 사람 식별 묶음 */
export function personProps(name: string | null | undefined) {
  if (!name) return {}
  return { orderer_masked: maskName(name), orderer_key: personKey(name) }
}
