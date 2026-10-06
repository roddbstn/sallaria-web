import * as amplitude from '@amplitude/analytics-browser'

let initialized = false

function init() {
  if (initialized || typeof window === 'undefined') return
  amplitude.init('92a00b75032df57457cd2f6aa66366ac', {
    defaultTracking: false, // page_view 등 자동 이벤트 끔 — 수동으로만 찍음
  })
  initialized = true
}

export function ampTrack(eventName: string, properties?: Record<string, unknown>) {
  init()
  amplitude.track(eventName, properties)
}

export function ampIdentify(accountCode: string, accountType?: string) {
  init()
  const identifyEvent = new amplitude.Identify()
  if (accountType) identifyEvent.set('account_type', accountType)
  amplitude.setUserId(accountCode)
  amplitude.identify(identifyEvent)
}
