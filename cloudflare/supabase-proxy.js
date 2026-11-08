// Cloudflare Worker: reverse proxy for Supabase, served from api.shirinkadeh-paris.ir
// so browsers never talk to *.supabase.co directly (REST, Auth, Storage, Functions, Realtime).
const UPSTREAM = "bporqhbfwhvuzfdxfrbi.supabase.co";
const ALLOWED_ORIGINS = [
  "https://shirinkadeh-paris.ir",
  "https://www.shirinkadeh-paris.ir",
];

function corsHeaders(origin, reqHeaders) {
  const h = new Headers();
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
    h.set("Access-Control-Allow-Credentials", "true");
    h.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    h.set("Access-Control-Allow-Headers", reqHeaders || "authorization,apikey,content-type,x-client-info,prefer,range,accept-profile,content-profile,x-upsert");
    h.set("Access-Control-Expose-Headers", "content-range,content-length,etag");
    h.set("Access-Control-Max-Age", "86400");
  }
  return h;
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin, request.headers.get("Access-Control-Request-Headers")) });
    }

    // Only proxy the Supabase API surfaces the site uses.
    if (!/^\/(rest|auth|storage|functions|realtime)\/v1(\/|$)/.test(url.pathname)) {
      return new Response("Not found", { status: 404 });
    }

    url.hostname = UPSTREAM;
    url.protocol = "https:";
    url.port = "";

    const headers = new Headers(request.headers);
    headers.set("Host", UPSTREAM);
    headers.delete("cf-connecting-ip");
    headers.delete("x-forwarded-for");

    const upstreamReq = new Request(url.toString(), {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
    });

    const resp = await fetch(upstreamReq);

    // WebSocket upgrades (Realtime) pass straight through.
    if (resp.status === 101) return resp;

    const out = new Headers(resp.headers);
    out.delete("access-control-allow-origin");
    for (const [k, v] of corsHeaders(origin).entries()) out.set(k, v);

    // Cache public storage objects (product images) at the edge/browsers.
    if (request.method === "GET" && url.pathname.startsWith("/storage/v1/object/public/") && resp.ok) {
      out.set("Cache-Control", "public, max-age=86400, s-maxage=604800");
    }
    return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: out });
  },
};
