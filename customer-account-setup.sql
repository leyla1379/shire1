-- شیرین‌کده پاریس: جدول علاقه‌مندی‌های مشتریان
-- در Supabase > SQL Editor اجرا شود.
-- نام و قیمت محصولات از فهرست محصولات موجود در سایت گرفته می‌شود.

create table if not exists public.customer_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

alter table public.customer_favorites enable row level security;
revoke all on table public.customer_favorites from anon;
grant select, insert, delete on table public.customer_favorites to authenticated;

drop policy if exists "customers_read_own_favorites" on public.customer_favorites;
create policy "customers_read_own_favorites"
on public.customer_favorites for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "customers_add_own_favorites" on public.customer_favorites;
create policy "customers_add_own_favorites"
on public.customer_favorites for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "customers_remove_own_favorites" on public.customer_favorites;
create policy "customers_remove_own_favorites"
on public.customer_favorites for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists customer_favorites_user_id_idx
on public.customer_favorites (user_id);
