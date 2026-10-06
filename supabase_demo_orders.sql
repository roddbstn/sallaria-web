create table if not exists demo_orders (
  id uuid default gen_random_uuid() primary key,
  account_name text not null default '데모 거래처',
  orderer text not null default '익명',
  method text not null default '포장',
  items jsonb not null default '[]',
  subtotal integer not null default 0,
  delivery_fee integer not null default 0,
  total integer not null default 0,
  status text not null default '주문완료',
  created_at timestamptz default now()
);

alter table demo_orders enable row level security;

drop policy if exists "demo_anon_insert" on demo_orders;
drop policy if exists "demo_anon_select" on demo_orders;
drop policy if exists "demo_anon_update" on demo_orders;

create policy "demo_anon_insert" on demo_orders
  for insert to anon with check (true);

create policy "demo_anon_select" on demo_orders
  for select to anon using (
    created_at > now() - interval '30 minutes'
  );

create policy "demo_anon_update" on demo_orders
  for update to anon using (true) with check (true);

alter publication supabase_realtime add table demo_orders;
