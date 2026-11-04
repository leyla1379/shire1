-- شیرین‌کده پاریس: تنظیمات محتوای قابل ویرایش سایت
-- در Supabase Dashboard > SQL Editor اجرا شود.
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

drop policy if exists "Public can read site content" on public.site_settings;
create policy "Public can read site content"
  on public.site_settings for select
  to anon, authenticated
  using (key = 'site_content');

drop policy if exists "Store owner can insert site content" on public.site_settings;
create policy "Store owner can insert site content"
  on public.site_settings for insert
  to authenticated
  with check (
    key = 'site_content'
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'leylakazempoor79@gmail.com'
  );

drop policy if exists "Store owner can update site content" on public.site_settings;
create policy "Store owner can update site content"
  on public.site_settings for update
  to authenticated
  using (
    key = 'site_content'
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'leylakazempoor79@gmail.com'
  )
  with check (
    key = 'site_content'
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'leylakazempoor79@gmail.com'
  );

grant select on public.site_settings to anon, authenticated;
grant insert, update on public.site_settings to authenticated;

-- پیگیری سفارش برای مشتری: خروجی محدود شامل کد رهگیری پستی
-- این بخش را در Supabase Dashboard > SQL Editor اجرا کنید.
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
