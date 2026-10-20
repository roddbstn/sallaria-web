import * as amplitude from '@amplitude/analytics-browser'
import { isAnalyticsEnabled } from './analytics-env'

let initialized = false

/** 초기화됐으면 true — 개발 호스트에선 끝까지 false라 호출부가 통째로 빠진다 */
function init(): boolean {
  if (initialized) return true
  if (typeof window === 'undefined') return false
  if (!isAnalyticsEnabled()) return false
  amplitude.init('92a00b75032df57457cd2f6aa66366ac', {
    defaultTracking: false, // page_view 등 자동 이벤트 끔 — 수동으로만 찍음
  })
  initialized = true
  return true
}

export function ampTrack(eventName: string, properties?: Record<string, unknown>) {
  if (!init()) return
  amplitude.track(eventName, properties)
}

export function ampIdentify(accountCode: string, accountType?: string) {
  if (!init()) return
  const identifyEvent = new amplitude.Identify()
  if (accountType) identifyEvent.set('account_type', accountType)
  amplitude.setUserId(accountCode)
  amplitude.identify(identifyEvent)
}
