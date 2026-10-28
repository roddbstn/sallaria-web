-- 잔액과 담당자 연락처를 PIN 뒤로 옮긴다. (2026-10-27)
--
-- ── 무엇이 문제였나 ────────────────────────────────────────────────────────
-- get_account_public(account_code) 은 PIN 전에 불리는 함수다. QR 로 들어왔을 때
-- 매장 이름·영업 여부를 보여주고 거래처를 특정하는 데 쓴다.
-- 그런데 **잔액(current_balance)과 담당자 연락처(contact_phone)까지** 같이 내려줬다.
-- account_code 는 QR URL 에 그대로 들어 있으므로, 사무실에 붙은 QR 종이를 본 사람이면
-- 누구나 그 거래처의 잔액과 담당자 번호를 볼 수 있었다.
--
-- CLAUDE.md 에 "accounts 는 anon 읽기가 막혀 있다 … 잔액은 PIN 을 거치는 RPC 로만
-- 나간다"고 적혀 있는데, 그 규칙이 이 함수로 새고 있었다.
--
-- ── 호출부 조사 (2026-10-27) ──────────────────────────────────────────────
--   salaria-prepaid app/(order)/page.tsx:108   → store_name, store_is_open
--   salaria-prepaid app/(order)/page.tsx:148   → account_code
--   salaria-prepaid app/(order)/menu/page.tsx  → current_balance   ← 유일한 잔액 사용처
--   contact_phone 은 **어디서도 쓰지 않았다**
--     (page.tsx:269 의 contactPhone 은 verify_account_pin 쪽 값이다 — 헷갈리기 쉽다)
--   sunpos-kakao · sallaria-pos 는 이 함수를 부르지 않는다.
--
-- ── 배포 순서 ─────────────────────────────────────────────────────────────
--   1) account_balance(p_account_code, p_pin) 추가   ← 아래 1번
--   2) menu/page.tsx 를 그쪽으로 옮기고 Firebase 배포 (라이브 번들로 확인 완료)
--   3) get_account_public 에서 두 컬럼 제거          ← 아래 2번
-- 새 환경에 처음 올릴 때는 그냥 순서대로 돌리면 된다.

-- ── 1. PIN 을 거치는 잔액 조회 ────────────────────────────────────────────
-- member_contact · list_account_members 와 같은 패턴이다.
-- 못 읽으면 null 을 돌려준다(예외로 던지지 않는다) — 메뉴 화면의 주기적 새로고침이라
-- 실패했다고 주문 흐름을 끊을 이유가 없다.
create or replace function public.account_balance(p_account_code uuid, p_pin text)
returns integer
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $fn$
  select a.current_balance
  from accounts a
  where a.account_code = p_account_code
    and a.is_active = true
    and a.pin_code = p_pin;
$fn$;

revoke execute on function public.account_balance(uuid, text) from public;
grant  execute on function public.account_balance(uuid, text) to anon, authenticated;

-- ── 2. get_account_public 에서 민감 컬럼 제거 ─────────────────────────────
-- 반환 TABLE 모양이 바뀌어 CREATE OR REPLACE 가 안 된다. drop 후 재생성한다.
drop function if exists public.get_account_public(uuid);

create function public.get_account_public(p_account_code uuid)
returns table(
  account_code      uuid,
  account_number    integer,
  account_name      text,
  account_type      text,
  organization_name text,
  store_id          uuid,
  store_name        text,
  store_is_open     boolean
)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $fn$
  select a.account_code, a.account_number, a.account_name, a.account_type::text,
         a.organization_name, a.store_id,
         s.name, s.is_open
  from accounts a
  join stores s on s.id = a.store_id
  where a.account_code = p_account_code and a.is_active = true;
$fn$;

revoke execute on function public.get_account_public(uuid) from public;
grant  execute on function public.get_account_public(uuid) to anon, authenticated;
