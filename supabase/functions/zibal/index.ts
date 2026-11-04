// Zibal payment gateway for Shirin Kadeh Paris.
//   POST  { order_code }  -> creates a Zibal transaction, returns { payment_url }
//   GET   ?trackId=...    -> Zibal callback: verifies the payment, updates the order,
//                            then redirects the customer back to the site.
// The merchant code is read from the ZIBAL_MERCHANT secret, never from site code.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE = "https://shirinkadeh-paris.ir";
const ZIBAL = "https://gateway.zibal.ir";
const ORDER_CODE = /^SH-[A-Z0-9]{8}$/;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const back = (params: Record<string, string>) =>
  new Response(null, {
    status: 302,
    headers: { Location: `${SITE}/?${new URLSearchParams(params)}`, "Cache-Control": "no-store" },
  });

const db = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

async function zibal(path: string, payload: Record<string, unknown>) {
  const res = await fetch(`${ZIBAL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return await res.json().catch(() => ({}));
}

// Site prices are in Toman, Zibal expects Rial.
const toRial = (toman: number) => Math.round(Number(toman)) * 10;

async function createPayment(req: Request) {
  const merchant = Deno.env.get("ZIBAL_MERCHANT");
  if (!merchant) return json({ error: "درگاه پرداخت هنوز تنظیم نشده است." }, 500);

  const body = await req.json().catch(() => ({}));
  const code = String(body?.order_code || "").trim();
  if (!ORDER_CODE.test(code)) return json({ error: "کد سفارش نامعتبر است." }, 400);

  const supabase = db();
  const { data: order, error } = await supabase
    .from("orders")
    .select("code,total,phone,payment_status")
    .eq("code", code)
    .maybeSingle();
  if (error || !order) return json({ error: "سفارش پیدا نشد." }, 404);
  if (order.payment_status === "paid") return json({ error: "این سفارش قبلاً پرداخت شده است." }, 409);

  const amount = toRial(order.total);
  if (!Number.isFinite(amount) || amount < 1000) return json({ error: "مبلغ سفارش نامعتبر است." }, 400);

  const mobile = /^09\d{9}$/.test(String(order.phone || "").trim()) ? String(order.phone).trim() : undefined;
  const data = await zibal("/v1/request", {
    merchant,
    amount,
    callbackUrl: `${Deno.env.get("SUPABASE_URL")}/functions/v1/zibal`,
    orderId: code,
    description: `سفارش ${code} - شیرین‌کده پاریس`,
    mobile,
  });

  if (data?.result !== 100 || !data?.trackId) {
    console.error("zibal request failed", data?.result, data?.message);
    return json({ error: data?.message || "ساخت لینک پرداخت ناموفق بود." }, 502);
  }

  const trackId = String(data.trackId);
  const { error: upErr } = await supabase
    .from("orders")
    .update({ payment_provider: "zibal", payment_status: "pending", payment_authority: trackId })
    .eq("code", code)
    .neq("payment_status", "paid");
  if (upErr) {
    console.error("order update failed", upErr.message);
    return json({ error: "ثبت اطلاعات پرداخت ناموفق بود." }, 500);
  }

  return json({ payment_url: `${ZIBAL}/start/${trackId}` });
}

async function handleCallback(url: URL) {
  const merchant = Deno.env.get("ZIBAL_MERCHANT");
  const trackId = String(url.searchParams.get("trackId") || "").trim();
  if (!merchant || !/^\d+$/.test(trackId)) return back({ payment: "failed" });

  const supabase = db();
  // Never trust orderId from the query string: look the order up by the stored trackId.
  const { data: order } = await supabase
    .from("orders")
    .select("code,total,payment_status,payment_ref_id")
    .eq("payment_authority", trackId)
    .maybeSingle();
  if (!order) return back({ payment: "failed" });

  if (order.payment_status === "paid") {
    return back({ payment: "success", order: order.code, ref: order.payment_ref_id || "" });
  }

  const paidFlag = url.searchParams.get("success") === "1";
  if (!paidFlag) {
    await supabase.from("orders").update({ payment_status: "failed" }).eq("code", order.code).neq("payment_status", "paid");
    return back({ payment: "failed", order: order.code });
  }

  const v = await zibal("/v1/verify", { merchant, trackId: Number(trackId) });
  const verified = v?.result === 100 || v?.result === 201;
  const amountOk = Number(v?.amount) === toRial(order.total);

  if (!verified || !amountOk) {
    console.error("zibal verify failed", v?.result, v?.message, "amountOk=", amountOk);
    await supabase.from("orders").update({ payment_status: "failed" }).eq("code", order.code).neq("payment_status", "paid");
    return back({ payment: "failed", order: order.code });
  }

  const ref = String(v?.refNumber ?? "");
  await supabase
    .from("orders")
    .update({ payment_status: "paid", payment_provider: "zibal", payment_ref_id: ref })
    .eq("code", order.code);
  return back({ payment: "success", order: order.code, ref });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    if (req.method === "POST") return await createPayment(req);
    if (req.method === "GET") return await handleCallback(new URL(req.url));
    return json({ error: "Method not allowed" }, 405);
  } catch (err) {
    console.error("zibal function error", err);
    return json({ error: "خطای داخلی درگاه پرداخت." }, 500);
  }
});
