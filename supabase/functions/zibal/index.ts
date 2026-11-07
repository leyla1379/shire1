// Zibal payment gateway for Shirin Kadeh Paris.
//   POST  { order_code }                  -> creates a Zibal transaction, returns { payment_url }
//   POST  { action: "verify", trackId,
//           success }                     -> called by the site after Zibal sends the customer back
//                                            to https://shirinkadeh-paris.ir/?trackId=...&success=...
//                                            Verifies the payment, updates the order and returns
//                                            { payment, order, ref }.
//   GET   ?trackId=...                    -> legacy callback (verifies, then redirects to the site).
// Zibal only accepts a callbackUrl on the domain registered for the merchant, so the callback
// points at the site (SITE) and not at this function's supabase.co address.
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

type Outcome = { payment: "success" | "failed"; order?: string; ref?: string };

const back = (o: Outcome) => {
  const params: Record<string, string> = { payment: o.payment };
  if (o.order) params.order = o.order;
  if (o.payment === "success") params.ref = o.ref || "";
  return new Response(null, {
    status: 302,
    headers: { Location: `${SITE}/?${new URLSearchParams(params)}`, "Cache-Control": "no-store" },
  });
};

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

async function createPayment(body: Record<string, unknown>) {
  const merchant = Deno.env.get("ZIBAL_MERCHANT");
  if (!merchant) return json({ error: "درگاه پرداخت هنوز تنظیم نشده است." }, 500);

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
    // Must be on the domain registered in the Zibal panel (shirinkadeh-paris.ir).
    callbackUrl: `${SITE}/`,
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

async function verifyPayment(trackId: string, paidFlag: boolean): Promise<Outcome> {
  const merchant = Deno.env.get("ZIBAL_MERCHANT");
  if (!merchant || !/^\d+$/.test(trackId)) return { payment: "failed" };

  const supabase = db();
  // Never trust orderId from the query string: look the order up by the stored trackId.
  const { data: order } = await supabase
    .from("orders")
    .select("code,total,payment_status,payment_ref_id")
    .eq("payment_authority", trackId)
    .maybeSingle();
  if (!order) return { payment: "failed" };

  if (order.payment_status === "paid") {
    return { payment: "success", order: order.code, ref: order.payment_ref_id || "" };
  }

  if (!paidFlag) {
    await supabase.from("orders").update({ payment_status: "failed" }).eq("code", order.code).neq("payment_status", "paid");
    return { payment: "failed", order: order.code };
  }

  const v = await zibal("/v1/verify", { merchant, trackId: Number(trackId) });
  const verified = v?.result === 100 || v?.result === 201;
  const amountOk = Number(v?.amount) === toRial(order.total);

  if (!verified || !amountOk) {
    console.error("zibal verify failed", v?.result, v?.message, "amountOk=", amountOk);
    await supabase.from("orders").update({ payment_status: "failed" }).eq("code", order.code).neq("payment_status", "paid");
    return { payment: "failed", order: order.code };
  }

  const ref = String(v?.refNumber ?? "");
  await supabase
    .from("orders")
    .update({ payment_status: "paid", payment_provider: "zibal", payment_ref_id: ref })
    .eq("code", order.code);
  return { payment: "success", order: order.code, ref };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body?.action === "verify") {
        const outcome = await verifyPayment(String(body?.trackId || "").trim(), String(body?.success) === "1");
        return json(outcome);
      }
      return await createPayment(body);
    }
    if (req.method === "GET") {
      const url = new URL(req.url);
      const outcome = await verifyPayment(
        String(url.searchParams.get("trackId") || "").trim(),
        url.searchParams.get("success") === "1",
      );
      return back(outcome);
    }
    return json({ error: "Method not allowed" }, 405);
  } catch (err) {
    console.error("zibal function error", err);
    return json({ error: "خطای داخلی درگاه پرداخت." }, 500);
  }
});
