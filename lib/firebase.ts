import { initializeApp, getApps } from 'firebase/app'
import { getAnalytics, logEvent, type Analytics } from 'firebase/analytics'

const firebaseConfig = {
  apiKey:            'AIzaSyClvk8-NJRk3-AJE2Ns_69vPic-bHMu0rI',
  authDomain:        'sallaria.firebaseapp.com',
  projectId:         'sallaria',
  storageBucket:     'sallaria.firebasestorage.app',
  messagingSenderId: '486697301968',
  appId:             '1:486697301968:web:7fc9191674c62fd1e1abd5',
  measurementId:     'G-NJXGY6HD8S',
}

let analytics: Analytics | null = null

export function getFirebaseAnalytics(): Analytics | null {
  if (typeof window === 'undefined') return null
  if (analytics) return analytics
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
  analytics = getAnalytics(app)
  return analytics
}

/** 래퍼 — 서버사이드에서도 안전하게 호출 가능 */
export function track(eventName: string, params?: Record<string, unknown>) {
  const a = getFirebaseAnalytics()
  if (!a) return
  logEvent(a, eventName, params)
}
