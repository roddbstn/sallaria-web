import * as Sentry from '@sentry/nextjs'
import pkg from './package.json'

// output: 'export' — 서버 런타임이 없어 instrumentation.ts(register/onRequestError)는 호출되지 않음.
// 클라이언트 에러만 잡으면 되므로 여기서 한 번만 init.
Sentry.init({
  dsn:     process.env.NEXT_PUBLIC_SENTRY_DSN,
  release: `salaria-prepaid@${pkg.version}`,
})
