'use client'

import { useEffect, useState } from 'react'
import { track } from '@/lib/firebase'
import { ampTrack } from '@/lib/amplitude'

const FEEDBACK_FORM_URL = 'https://forms.gle/gtHcfPtSvMX3NzQ57'

type Rating = '만족' | '보통' | '불편함'

const RATINGS: { label: Rating; emoji: string }[] = [
  { label: '만족',  emoji: '😊' },
  { label: '보통',  emoji: '😐' },
  { label: '불편함', emoji: '😣' },
]

interface FeedbackModalProps {
  onClose: () => void
}

// 주문 접수 직후 떠서 간단 만족도 체크 → 설문 폼 유도. NoticeModal과 동일한 오버레이/카드 패턴.
export default function FeedbackModal({ onClose }: FeedbackModalProps) {
  const [step, setStep] = useState<'rating' | 'thanks'>('rating')

  // 노출 트래킹 — 모달이 실제로 화면에 뜨는 순간 (전환율 분모 계산용)
  useEffect(() => {
    track('feedback_modal_shown')
    ampTrack('feedback_modal_shown')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleRate(rating: Rating) {
    track('feedback_rating_click', { rating })
    ampTrack('feedback_rating_click', { rating })
    setStep('thanks')
  }

  function handleFormClick() {
    track('feedback_form_click')
    ampTrack('feedback_form_click')
    onClose()
  }

  function handleSkip() {
    track('feedback_skip_click', { step })
    ampTrack('feedback_skip_click', { step })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
      onClick={handleSkip}
    >
      <div
        className="w-full max-w-[380px] rounded-[24px] bg-surface px-6 py-7"
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'rating' ? (
          <>
            <p className="text-[20px] font-bold text-ink text-left leading-snug">
              주문 과정은 편리하셨나요?
            </p>

            <div className="grid grid-cols-3 gap-2 mt-7">
              {RATINGS.map(({ label, emoji }) => (
                <button
                  key={label}
                  onClick={() => handleRate(label)}
                  className="py-3.5 rounded-xl text-[14px] font-semibold text-ink transition-transform active:scale-95"
                  style={{ backgroundColor: '#F2F2F2' }}
                >
                  {emoji} {label}
                </button>
              ))}
            </div>

            <button
              onClick={handleSkip}
              className="block w-full text-center text-[13px] text-[#B0B0B0] mt-6"
            >
              다음에 할게요
            </button>
          </>
        ) : (
          <>
            <div className="text-left">
              <p className="text-[20px] font-bold text-ink leading-snug">
                💡 30초만 시간 내어 주실래요?
              </p>
              <p className="text-[14px] text-[#727272] mt-2 leading-relaxed">
                주문자님의 의견이 궁금해요
              </p>
            </div>

            <a
              href={FEEDBACK_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleFormClick}
              className="block w-full py-4 rounded-xl bg-green text-surface text-[16px] font-bold text-center mt-6 transition-transform active:scale-95"
            >
              서비스 의견 보내러 가기
            </a>

            <button
              onClick={handleSkip}
              className="block w-full text-center text-[13px] text-[#B0B0B0] mt-3"
            >
              다음에 할게요
            </button>
          </>
        )}
      </div>
    </div>
  )
}
