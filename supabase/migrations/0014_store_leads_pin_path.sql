-- ════════════════════════════════════════════════════════════════════════════
-- store_leads — PIN 방식 QR웹(sallaria.web.app)에서도 제보할 수 있게 (2026-10-24)
--
-- 왜 필요한가: 두 QR웹이 같은 Supabase 프로젝트를 쓰지만 인증이 다르다.
--   · sunpos-kakao      — 카카오 로그인 → auth.uid() 있음 → 기존 RLS 로 직접 INSERT
--   · sallaria.web.app  — PIN + anon 키   → auth.uid() **없음**
-- 기존 정책은 `insert to authenticated with check (reported_by = auth.uid())` 이고
-- reported_by 가 sunpos_users(id) NOT NULL 이라, PIN 쪽에서는 INSERT 가 거절된다.
--
-- 그래서 **anon 이 부를 수 있는 RPC 하나**를 연다. 테이블에 직접 INSERT 권한을 주지
-- 않는 이유: 그러면 anon 키로 아무 행이나 (status·matched_store_id 까지) 써넣을 수 있다.
-- RPC 는 받을 값만 받고 나머지는 서버가 정한다.
--
-- ⚠️ anon 호출 가능한 쓰기 엔드포인트가 하나 늘어난다. account_code 는 QR 종이에
--    적혀 있어 신분 증명이 못 되므로(CLAUDE.md), 신원 대신 **양을 막는다**:
--      · 같은 거래처가 같은 가게를 두 번 못 넣는다 (부분 유니크 인덱스)
--      · 한 거래처가 하루 5건까지
--      · 활성 거래처만
--      · 이름 길이 2~60자
--    이걸로 막는 건 스팸이지 사칭이 아니다. 제보는 영업 힌트일 뿐 금액을 움직이지
--    않으므로 이 수준이 맞다고 봤다. 금액을 건드리는 RPC 와 같은 기준을 쓰면 안 된다.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. 로그인 없는 제보를 담을 수 있게 ──────────────────────────────────────
-- reported_by 는 카카오 쪽에서만 채워진다. PIN 쪽은 "어느 거래처의 누가"로 남긴다.
alter table public.store_leads alter column reported_by drop not null;

alter table public.store_leads
  add column if not exists reporter_name text;

comment on column public.store_leads.reporter_name is
  'PIN 방식에서 제보한 사람 이름(주문자명). 카카오 쪽은 reported_by 로 누군지 알 수 있어 비어 있다.';

-- 기존 유니크 인덱스는 reported_by 기준이라 NULL 끼리는 서로 다른 값으로 취급된다
-- (Postgres 기본). PIN 쪽 중복은 거래처 기준으로 따로 막는다.
create unique index if not exists store_leads_once_per_account
  on public.store_leads (from_account_code, lower(btrim(store_name)))
  where reported_by is null;


-- ── 2. anon 이 부르는 제보 RPC ───────────────────────────────────────────────
create or replace function public.submit_store_lead(
  p_account_code uuid,
  p_reporter     text,
  p_store_name   text,
  p_place_id     text    default null,
  p_road_address text    default null,
  p_phone        text    default null,
  p_lat          double precision default null,
  p_lng          double precision default null,
  p_memo         text    default null,
  p_notify       boolean default true
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $fn$
declare
  v_store_id uuid;
  v_name     text := btrim(coalesce(p_store_name, ''));
  v_today    int;
  v_id       uuid;
begin
  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    raise exception '가게 이름은 2자 이상 60자 이하로 적어주세요';
  end if;

  -- 활성 거래처만. 비활성(테스트·해지)으로 들어오는 제보는 받을 이유가 없다.
  select store_id into v_store_id
    from accounts
   where account_code = p_account_code and is_active
   limit 1;
  if v_store_id is null then
    raise exception '거래처를 찾을 수 없어요';
  end if;

  -- 하루 상한. 신원을 못 믿으므로 양으로 막는다.
  select count(*) into v_today
    from store_leads
   where from_account_code = p_account_code
     and created_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  if v_today >= 5 then
    raise exception '오늘은 더 알려주실 수 없어요. 내일 다시 부탁드려요';
  end if;

  insert into store_leads (
    reported_by, reporter_name, from_store_id, from_account_code,
    store_name, place_id, road_address, phone, lat, lng, memo, notify_consent
  ) values (
    null, nullif(btrim(coalesce(p_reporter, '')), ''), v_store_id, p_account_code,
    v_name, p_place_id, p_road_address, p_phone, p_lat, p_lng,
    nullif(btrim(coalesce(p_memo, '')), ''), coalesce(p_notify, true)
  )
  returning id into v_id;

  return v_id;
exception
  -- 같은 거래처가 같은 가게를 또 넣은 경우 — 실패가 아니라 "이미 알려주셨어요"다
  when unique_violation then
    raise exception '이미 알려주신 가게예요. 고맙습니다!';
end;
$fn$;

-- 테이블 직접 INSERT 는 끝까지 안 준다. 이 함수만 연다.
revoke execute on function public.submit_store_lead(uuid, text, text, text, text, text, double precision, double precision, text, boolean) from public;
grant  execute on function public.submit_store_lead(uuid, text, text, text, text, text, double precision, double precision, text, boolean) to anon, authenticated;


-- ── 3. Slack 알림이 PIN 쪽 제보자 이름도 쓰도록 ──────────────────────────────
-- ⚠️ 013 의 notify_store_lead() 가 아직 적용돼 있지 않다면 이 블록이 그걸 겸한다.
--    (013 은 테이블·RLS 까지만 적용됐다 — 그 파일 머리말 참고)
create or replace function public.notify_store_lead()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $fn$
declare
  v_from_store text;
  v_reporter   text;
  v_url text := 'https://fcaoakdlbecamoyeqyha.supabase.co/functions/v1/store-lead-slack';
  -- anon 키는 공개 키(클라이언트 번들에도 들어간다)
  v_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjYW9ha2RsYmVjYW1veWVxeWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMTY1OTYsImV4cCI6MjA5Njc5MjU5Nn0.FlHwYKyddPR_ufi-vCOBFWzgSKE-_xsgGjypV6JVLpY';
begin
  select name into v_from_store from stores where id = new.from_store_id;

  -- 카카오 제보는 reported_by 로, PIN 제보는 reporter_name 으로 사람을 찾는다
  if new.reported_by is not null then
    select coalesce(nullif(btrim(nickname), ''), '이름없음') into v_reporter
      from sunpos_users where id = new.reported_by;
  else
    v_reporter := coalesce(nullif(btrim(new.reporter_name), ''), '이름없음');
  end if;

  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'Authorization', 'Bearer ' || v_key
                 ),
      body    := jsonb_build_object(
                   'record', to_jsonb(new),
                   'fromStoreName', coalesce(v_from_store, '(알 수 없음)'),
                   'reporterName',  coalesce(v_reporter, '(알 수 없음)')
                 )
    );
  exception when others then
    raise warning 'notify_store_lead 실패(무시): %', sqlerrm;
  end;

  return new;
end;
$fn$;

drop trigger if exists store_leads_notify_slack on public.store_leads;
create trigger store_leads_notify_slack
  after insert on public.store_leads
  for each row execute function public.notify_store_lead();
