-- شیرین‌کده پاریس: اصلاح سفارش‌های مشتری و رهگیری پستی
-- این فایل را یک‌بار در Supabase Dashboard > SQL Editor اجرا کنید.
-- اجرای این اسکریپت سفارش‌های قبلی را حذف نمی‌کند.

-- 1) اطمینان از وجود ستون کد رهگیری پستی
alter table public.orders
  add column if not exists postal_tracking_code text;

-- 2) دسترسی خواندن فقط به سفارش‌های خود مشتری و همه سفارش‌ها برای مالک
alter table public.orders enable row level security;

drop policy if exists "shire_customer_read_own_orders" on public.orders;
create policy "shire_customer_read_own_orders"
  on public.orders
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'leylakazempoor79@gmail.com'
  );

-- 3) سفارش مهمان فقط بدون user_id؛ مشتری واردشده فقط برای حساب خودش
drop policy if exists "shire_guest_insert_orders" on public.orders;
create policy "shire_guest_insert_orders"
  on public.orders
  for insert
  to anon
  with check (user_id is null);

drop policy if exists "shire_customer_insert_orders" on public.orders;
create policy "shire_customer_insert_orders"
  on public.orders
  for insert
  to authenticated
  with check (
    user_id is null
    or user_id = auth.uid()
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'leylakazempoor79@gmail.com'
  );

-- 4) فقط مالک می‌تواند وضعیت، کد رهگیری یا سفارش را تغییر/حذف کند
drop policy if exists "shire_owner_update_orders" on public.orders;
create policy "shire_owner_update_orders"
  on public.orders
  for update
  to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'leylakazempoor79@gmail.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'leylakazempoor79@gmail.com');

drop policy if exists "shire_owner_delete_orders" on public.orders;
create policy "shire_owner_delete_orders"
  on public.orders
  for delete
  to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'leylakazempoor79@gmail.com');

grant select, insert, update, delete on public.orders to authenticated;
grant insert on public.orders to anon;

-- 5) پیگیری امن با کد سفارش؛ فقط اطلاعات مورد نیاز مشتری برگردانده می‌شود
create or replace function public.track_order_details(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'code', o.code,
    'status', o.status,
    'total', o.total,
    'created_at', o.created_at,
    'items', o.items,
    'postal_tracking_code', o.postal_tracking_code
  )
  from public.orders as o
  where upper(trim(o.code::text)) = upper(trim(p_code))
  limit 1;
$$;

revoke all on function public.track_order_details(text) from public;
grant execute on function public.track_order_details(text) to anon, authenticated;
