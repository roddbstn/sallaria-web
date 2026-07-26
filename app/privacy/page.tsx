'use client'

import { useRouter } from 'next/navigation'

export default function PrivacyPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-white max-w-[430px] mx-auto flex flex-col">
      {/* 헤더 */}
      <header className="flex items-center h-14 px-4 border-b border-[#D7D7D7] flex-shrink-0 sticky top-0 bg-white z-10">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F5F5F5] transition-colors"
        >
          <svg width="9" height="15" viewBox="0 0 9 15" fill="none"><path d="M8 1L1 7.5L8 14" stroke="#1E1E1E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h1 className="flex-1 text-center text-base font-bold text-[#1E1E1E] pr-9">
          개인정보처리방침
        </h1>
      </header>

      <div className="flex-1 px-5 py-6 space-y-7 text-[13px] leading-relaxed text-[#4A4A4A]">
        <div className="bg-[#F5F9F6] rounded-xl px-4 py-3">
          <p className="text-[11px] text-[#727272]">시행일: 2026년 7월 20일 · 최종 개정: 2026년 7월 20일</p>
          <p className="mt-1 text-[12px] text-[#4A4A4A]">
            프리POS(이하 "서비스")는 선결제 주문 시스템 운영 과정에서 수집하는
            개인정보를 「개인정보 보호법」에 따라 처리하며, 이용자의 권리 보호를 위해
            아래와 같이 방침을 공개합니다.
          </p>
        </div>

        {/* 1 */}
        <section>
          <h2 className="text-[15px] font-bold text-[#1E1E1E] mb-3">1. 수집하는 개인정보 항목</h2>
          <div className="space-y-3">
            <div className="border border-[#E8E8E8] rounded-xl overflow-hidden">
              <div className="bg-[#FAFAFA] px-4 py-2 border-b border-[#E8E8E8]">
                <span className="text-[12px] font-bold text-[#1E1E1E]">주문 시 수집 (필수)</span>
              </div>
              <div className="px-4 py-3 space-y-1">
                <p>• 주문자 이름</p>
                <p>• 휴대폰 번호</p>
                <p>• 주문 내역 (메뉴명, 수량, 옵션, 금액, 이용방법)</p>
                <p>• 주문 일시</p>
              </div>
            </div>
            <div className="border border-[#E8E8E8] rounded-xl overflow-hidden">
              <div className="bg-[#FAFAFA] px-4 py-2 border-b border-[#E8E8E8]">
                <span className="text-[12px] font-bold text-[#1E1E1E]">배달 주문 시 추가 수집 (필수)</span>
              </div>
              <div className="px-4 py-3 space-y-1">
                <p>• 배달 주소 (도로명 주소, 상세주소)</p>
                <p>• 배달 요청사항</p>
              </div>
            </div>
            <div className="border border-[#E8E8E8] rounded-xl overflow-hidden">
              <div className="bg-[#FAFAFA] px-4 py-2 border-b border-[#E8E8E8]">
                <span className="text-[12px] font-bold text-[#1E1E1E]">거래처 계약 시 수집 (필수)</span>
              </div>
              <div className="px-4 py-3 space-y-1">
                <p>• 거래처명 (기관명, 부서명 또는 개인명)</p>
                <p>• 담당자 이름 · 휴대폰 번호</p>
                <p>• 사업자등록번호 (법인 거래처에 한함)</p>
                <p>• 선결제 PIN 번호</p>
              </div>
            </div>
            <p className="text-[12px] text-[#727272] mt-2">
              ※ 민감정보(건강정보, 신용정보 등)는 일절 수집하지 않습니다.
            </p>
          </div>
        </section>

        {/* 2 */}
        <section>
          <h2 className="text-[15px] font-bold text-[#1E1E1E] mb-3">2. 개인정보 수집 및 이용 목적</h2>
          <div className="space-y-2">
            {[
              { title: '선결제 주문 접수 및 처리', desc: '주문 확인, 조리 지시, 픽업·배달 안내' },
              { title: '주문자 신원 확인', desc: '선결제 거래처 소속 여부 확인 및 잔액 차감' },
              { title: '재주문 편의 제공', desc: '이전 주문자 자동완성(이름 칩) 기능 제공' },
              { title: '배달 서비스 제공', desc: '배달 기사에게 주소 전달' },
              { title: '분쟁 해결 및 민원 처리', desc: '주문 오류, 취소, 환불 관련 처리' },
              { title: '법령상 의무 이행', desc: '세금계산서 발행, 전자상거래법 등 법적 의무' },
            ].map(item => (
              <div key={item.title} className="flex gap-3">
                <span className="text-[#017333] mt-0.5 flex-shrink-0">▶</span>
                <div>
                  <p className="font-semibold text-[#1E1E1E]">{item.title}</p>
                  <p className="text-[#727272] text-[12px]">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 3 */}
        <section>
          <h2 className="text-[15px] font-bold text-[#1E1E1E] mb-3">3. 개인정보 보유 및 이용 기간</h2>
          <div className="border border-[#E8E8E8] rounded-xl overflow-hidden">
            <div className="grid grid-cols-2 bg-[#FAFAFA] border-b border-[#E8E8E8]">
              <div className="px-4 py-2 text-[12px] font-bold text-[#1E1E1E] border-r border-[#E8E8E8]">항목</div>
              <div className="px-4 py-2 text-[12px] font-bold text-[#1E1E1E]">보유 기간</div>
            </div>
            {[
              ['주문자 이름·전화번호', '거래처 계약 종료 후 1년'],
              ['주문 내역', '거래처 계약 종료 후 1년'],
              ['배달 주소', '배달 완료 후 6개월'],
              ['거래처 계약 정보', '계약 종료 후 5년 (상법 제33조)'],
            ].map(([item, period]) => (
              <div key={item} className="grid grid-cols-2 border-b border-[#E8E8E8] last:border-0">
                <div className="px-4 py-2.5 text-[12px] border-r border-[#E8E8E8]">{item}</div>
                <div className="px-4 py-2.5 text-[12px] text-[#727272]">{period}</div>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-[#727272] mt-2">
            ※ 관련 법령에 따라 보존이 필요한 경우 해당 기간 동안 별도 보관 후 파기합니다.
          </p>
        </section>

        {/* 4 */}
        <section>
          <h2 className="text-[15px] font-bold text-[#1E1E1E] mb-3">4. 개인정보 처리 위탁</h2>
          <div className="border border-[#E8E8E8] rounded-xl overflow-hidden mb-3">
            <div className="grid grid-cols-2 bg-[#FAFAFA] border-b border-[#E8E8E8]">
              <div className="px-4 py-2 text-[12px] font-bold text-[#1E1E1E] border-r border-[#E8E8E8]">수탁자</div>
              <div className="px-4 py-2 text-[12px] font-bold text-[#1E1E1E]">위탁 업무</div>
            </div>
            {[
              ['Supabase Inc.', '클라우드 DB 저장 및 관리 (AWS ap-northeast-2 서버)'],
              ['Firebase (Google LLC)', '웹 서비스 호스팅'],
            ].map(([company, task]) => (
              <div key={company} className="grid grid-cols-2 border-b border-[#E8E8E8] last:border-0">
                <div className="px-4 py-2.5 text-[12px] font-semibold border-r border-[#E8E8E8]">{company}</div>
                <div className="px-4 py-2.5 text-[12px] text-[#727272]">{task}</div>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-[#727272]">
            위탁 업체들은 개인정보를 위탁 목적 외 용도로 사용하지 않으며,
            각 사의 개인정보 보호 정책을 준수합니다.
          </p>
        </section>

        {/* 5 */}
        <section>
          <h2 className="text-[15px] font-bold text-[#1E1E1E] mb-3">5. 제3자 제공</h2>
          <p className="mb-2">원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다.</p>
          <p className="mb-2">단, 아래 경우에 한하여 제공됩니다.</p>
          <ul className="space-y-1 ml-3">
            <li>• <span className="font-semibold">배달 서비스 이용 시</span>: 배달 기사에게 배달 주소 전달</li>
            <li>• <span className="font-semibold">법적 요구</span>: 법령에 의거하거나 수사기관의 적법한 요청이 있는 경우</li>
          </ul>
        </section>

        {/* 6 */}
        <section>
          <h2 className="text-[15px] font-bold text-[#1E1E1E] mb-3">6. 개인정보 파기 절차 및 방법</h2>
          <div className="space-y-3">
            <div>
              <p className="font-semibold text-[#1E1E1E] mb-1">파기 절차</p>
              <p>보유 기간이 경과하거나 처리 목적이 달성된 경우, 지체 없이 파기합니다.
              종이에 출력된 경우 분쇄 또는 소각하며, 전자 파일은 복구 불가능한 방법으로 삭제합니다.</p>
            </div>
            <div>
              <p className="font-semibold text-[#1E1E1E] mb-1">기기 내 저장 정보 (브라우저)</p>
              <p>이 서비스는 주문 이력 확인을 위해 기기 내 로컬 저장소(localStorage)에
              주문번호, 거래처명, 주문자명, 금액, 주문일시를 최대 20건 저장합니다.
              공용 기기 사용 후 브라우저의 "사이트 데이터 삭제" 기능을 통해 직접 삭제할 수 있습니다.</p>
            </div>
          </div>
        </section>

        {/* 7 */}
        <section>
          <h2 className="text-[15px] font-bold text-[#1E1E1E] mb-3">7. 정보주체의 권리</h2>
          <p className="mb-3">이용자는 언제든지 아래 권리를 행사할 수 있습니다.</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['📋 열람', '본인 정보 확인 요청'],
              ['✏️ 정정', '부정확한 정보 수정 요청'],
              ['🗑️ 삭제', '불필요한 정보 삭제 요청'],
              ['🚫 처리 정지', '특정 처리 중단 요청'],
            ].map(([title, desc]) => (
              <div key={title} className="bg-[#FAFAFA] rounded-xl px-3 py-2.5">
                <p className="font-semibold text-[#1E1E1E] text-[12px]">{title}</p>
                <p className="text-[#727272] text-[11px] mt-0.5">{desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-[#727272]">
            권리 행사는 아래 담당자 연락처로 요청하시면 지체 없이 조치합니다.
          </p>
        </section>

        {/* 8 */}
        <section>
          <h2 className="text-[15px] font-bold text-[#1E1E1E] mb-3">8. 개인정보 보호를 위한 기술적 조치</h2>
          <ul className="space-y-2">
            <li className="flex gap-2"><span className="text-[#017333] flex-shrink-0">✓</span>데이터베이스 접근은 API 키 인증 필수 (직접 접근 불가)</li>
            <li className="flex gap-2"><span className="text-[#017333] flex-shrink-0">✓</span>모든 통신은 HTTPS/TLS 암호화 적용</li>
            <li className="flex gap-2"><span className="text-[#017333] flex-shrink-0">✓</span>점주 관리 화면은 별도 인증(이메일+비밀번호) 필요</li>
            <li className="flex gap-2"><span className="text-[#017333] flex-shrink-0">✓</span>비밀번호 찾기 기능은 서버에서 검증 후 결과만 반환 (데이터 미노출)</li>
            <li className="flex gap-2"><span className="text-[#017333] flex-shrink-0">✓</span>클라우드 DB는 행 단위 접근 제어(RLS) 적용</li>
            <li className="flex gap-2"><span className="text-[#017333] flex-shrink-0">✓</span>이전 주문자 선택 화면에서 휴대폰 번호는 끝 4자리만 표시 (예: 010-****-5678)</li>
          </ul>
        </section>

        {/* 9 */}
        <section>
          <h2 className="text-[15px] font-bold text-[#1E1E1E] mb-3">9. 개인정보 보호책임자 및 문의</h2>
          <div className="bg-[#FAFAFA] rounded-xl px-4 py-4 space-y-2">
            <div className="flex gap-3">
              <span className="text-[#727272] w-20 flex-shrink-0">서비스명</span>
              <span className="font-semibold text-[#1E1E1E]">프리POS</span>
            </div>
            <div className="flex gap-3">
              <span className="text-[#727272] w-20 flex-shrink-0">문의 방법</span>
              <span>이용 중인 매장에 직접 문의해 주세요.</span>
            </div>
            <div className="flex gap-3">
              <span className="text-[#727272] w-20 flex-shrink-0">처리 기한</span>
              <span>요청 접수 후 10일 이내</span>
            </div>
          </div>
          <p className="mt-3 text-[12px] text-[#727272]">
            개인정보 침해 신고는 개인정보보호위원회(국번없이 <strong>182</strong>) 또는
            한국인터넷진흥원 개인정보침해신고센터(privacy.kisa.or.kr)에 하실 수 있습니다.
          </p>
        </section>

        <div className="pb-8 text-[11px] text-[#AAAAAA] text-center">
          본 방침은 2026년 7월 20일부터 시행됩니다.
        </div>
      </div>
    </div>
  )
}
