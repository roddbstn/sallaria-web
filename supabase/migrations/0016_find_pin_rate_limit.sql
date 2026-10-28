-- find_pin 에 시도 상한을 넣는다. (2026-10-27)
--
-- ── 무엇이 문제였나 ────────────────────────────────────────────────────────
-- find_pin 은 이름+전화번호가 맞으면 **PIN 평문을 그대로 돌려준다.** anon 이고
-- 시도 횟수 제한이 없어서, QR 에 적힌 store_id/account_code 를 쥔 사람이
-- 이름 하나만 알면 전화번호를 무한히 대조해 PIN 을 알아낼 수 있었다.
-- 덤으로 "이 이름+번호가 이 매장에 등록돼 있나"를 되묻는 조회기로도 쓸 수 있었다.
--
-- PIN 이 뚫리면 그 뒤의 것들(verify_account_pin · member_contact ·
-- list_account_members)이 전부 의미를 잃는다. 그래서 여기가 먼저다.
--
-- ── 왜 이렇게 고쳤나 ──────────────────────────────────────────────────────
-- 시그니처와 반환 모양은 **그대로 둔다.** 두 QR웹이 모두 이 함수를 부른다:
--   · salaria-prepaid  app/(order)/page.tsx:188
--   · sunpos-kakao     app/(order)/qr/[accountCode]/page.tsx:188
-- 바꾸면 양쪽 'PIN 찾기'가 동시에 깨진다.
--
-- 문자 발송 인프라가 없어서 "PIN 을 화면에 띄우지 말고 문자로 보낸다"는 지금 못 한다.
-- 대신 submit_store_lead 가 쓰는 것과 같은 방식으로 **양으로 막는다.**
--
-- 실패만 센다 — 제대로 찾은 사람이 그 때문에 잠기면 안 된다.
-- 범위는 account_code(QR 로 들어온 경우) 또는 store_id. 한 시간 10회.

-- ── 1. 시도 기록 ───────────────────────────────────────────────────────────
-- 이름·전화번호는 **담지 않는다.** 제한을 걸려고 PII 를 쌓으면 막으려던 것보다
-- 더 큰 걸 만들게 된다. 범위와 성패, 시각이면 상한 판정에 충분하다.
create table if not exists public.pin_lookup_attempts (
  id           bigint generated always as identity primary key,
  store_id     uuid references public.stores(id)   on delete cascade,
  account_code uuid references public.accounts(account_code) on delete cascade,
  found        boolean not null,
  created_at   timestamptz not null default now()
);

create index if not exists pin_lookup_attempts_scope_idx
  on public.pin_lookup_attempts (account_code, store_id, created_at desc);

-- 정책 없이 RLS 만 켠다 = 클라이언트는 직접 못 읽고 못 쓴다.
-- 기록은 SECURITY DEFINER 인 find_pin 만 남긴다.
alter table public.pin_lookup_attempts enable row level security;
revoke all on public.pin_lookup_attempts from public, anon, authenticated;

-- ── 2. 상한을 건 find_pin ─────────────────────────────────────────────────
create or replace function public.find_pin(
  p_store_id uuid, p_name text, p_phone text, p_account_code uuid DEFAULT NULL::uuid
)
returns table(account_name text, pin_code text)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $fn$
DECLARE
  v_phone_clean text;
  v_name_clean  text;
  v_fails       int;
  v_found       boolean := false;
  v_name        text;
  v_pin         text;
BEGIN
  v_phone_clean := regexp_replace(trim(p_phone), '[^0-9]', '', 'g');
  v_name_clean  := trim(p_name);

  IF length(v_name_clean) = 0 OR length(v_phone_clean) < 10 THEN
    RETURN;
  END IF;

  -- 상한: 최근 1시간 실패 10회.
  -- 잠긴 동안에는 맞는 정보로도 막힌다 — 안 그러면 우회가 된다.
  SELECT count(*) INTO v_fails
  FROM pin_lookup_attempts t
  WHERE t.found = false
    AND t.created_at >= now() - interval '1 hour'
    AND (
      (p_account_code IS NOT NULL AND t.account_code = p_account_code)
      OR (p_account_code IS NULL AND p_store_id IS NOT NULL AND t.store_id = p_store_id)
    );

  IF v_fails >= 10 THEN
    RAISE EXCEPTION '잠시 후 다시 시도해 주세요. 시도가 너무 많았어요';
  END IF;

  SELECT a.account_name::text, a.pin_code::text
  INTO v_name, v_pin
  FROM accounts a
  WHERE a.is_active = true
    AND a.store_id  = p_store_id
    AND (p_account_code IS NULL OR a.account_code = p_account_code)
    AND regexp_replace(coalesce(a.contact_phone, ''), '[^0-9]', '', 'g') = v_phone_clean
    AND (
      -- 개인 거래처: account_name 과 비교
      (a.account_type = '개인'  AND a.account_name = v_name_clean)
      OR
      -- 기업/과/기타: contact_person 과 비교
      (a.account_type != '개인' AND coalesce(a.contact_person, '') = v_name_clean)
    )
  LIMIT 1;

  v_found := v_name IS NOT NULL;

  INSERT INTO pin_lookup_attempts (store_id, account_code, found)
  VALUES (p_store_id, p_account_code, v_found);

  IF v_found THEN
    account_name := v_name;
    pin_code     := v_pin;
    RETURN NEXT;
  END IF;
  RETURN;
END;
$fn$;
