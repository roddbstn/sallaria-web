-- 주문자 명단을 PIN 뒤로 숨긴다. (2026-10-27)
--
-- 기존 list_account_members(uuid) 는 anon 이고 내부 검사가 없어서,
-- account_code 만 알면 그 거래처의 주문자 이름 목록이 나왔다.
-- 그런데 account_code 는 **QR URL 에 그대로 들어 있어** 사무실에 붙인
-- QR 종이를 본 사람이면 누구나 아는 값이다. 신분 증명이 못 된다.
--
-- member_contact(p_account_code, p_pin, p_member_id) 가 이미 쓰는 패턴을 그대로 따랐다
-- — PIN 을 인자로 받아 accounts.pin_code 와 대조한다. 클라이언트는 PIN 인증 직후
-- 그 값을 Account.pin 으로 들고 있어서 새 세션/토큰 구조가 필요 없었다.
--
-- ── 배포 순서 (중요) ───────────────────────────────────────────────────────
-- 시그니처를 바로 바꾸면 그 순간 라이브(sallaria.web.app)의 주문자 선택 시트가
-- 깨진다. 그래서 세 단계로 나눠 넣었다:
--   1) 2인자 오버로드를 **추가** (1인자 버전은 그대로 둔다 — 라이브 안 깨짐)
--   2) 웹 배포 → 라이브 번들이 p_pin 을 보내는 것을 확인
--   3) 1인자 버전 drop   ← 아래 마지막 줄
-- 이 파일은 1)과 3)을 합쳐 기록한 것이다. 새 환경에 처음 올릴 때는 그냥 돌리면 된다.

create or replace function public.list_account_members(p_account_code uuid, p_pin text)
returns table(id uuid, name text, order_count integer, last_ordered_at timestamptz)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $fn$
  select m.id, m.name, m.order_count, m.last_ordered_at
  from account_members m
  join accounts a on a.account_code = m.account_code
  where m.account_code = p_account_code
    and a.is_active = true
    and a.pin_code = p_pin
  order by m.last_ordered_at desc nulls last, m.order_count desc nulls last, m.name
  limit 60;
$fn$;

revoke execute on function public.list_account_members(uuid, text) from public;
grant  execute on function public.list_account_members(uuid, text) to anon, authenticated;

-- PIN 없이 명단을 돌려주던 구버전 제거
drop function if exists public.list_account_members(uuid);
