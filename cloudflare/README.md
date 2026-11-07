# پروکسی Supabase روی Cloudflare

۱. داشبورد Cloudflare ← Workers & Pages ← Create ← Worker (نام: `shirinkadeh-supabase-proxy`) ← Deploy.
۲. Edit code ← کل محتوای `supabase-proxy.js` را جایگزین کن ← Deploy.
۳. Settings ← Domains & Routes ← Add ← Custom domain ← `api.shirinkadeh-paris.ir`
   (رکورد DNS خودکار ساخته می‌شود چون دامنه روی همین اکانت است).
۴. تست: باز کردن `https://api.shirinkadeh-paris.ir/rest/v1/` باید پاسخ Supabase (مثلاً خطای کلید) بدهد، نه 404 یا خطای SSL.
۵. فقط بعد از موفق بودن مرحلهٔ ۴، تغییرات سایت را پوش کن.

در Supabase (Authentication ← URL Configuration) آدرس‌های `https://shirinkadeh-paris.ir` باید در Site URL / Redirect URLs باشند.
