// Edge Function TEJAM. Секрет: BOT_TOKEN (токен бота из BotFather).
// SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY Supabase добавляет сам.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("BOT_TOKEN") ?? "";
const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const enc = new TextEncoder();
async function hmac(key: Uint8Array | string, msg: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    "raw",
    typeof key === "string" ? enc.encode(key) : key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

// Проверка подписи Telegram initData. Возвращает пользователя или null.
async function verify(initData: string) {
  if (!initData || !BOT_TOKEN) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheck = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = await hmac("WebAppData", BOT_TOKEN);
  if (hex(await hmac(secret, dataCheck)) !== hash) return null;
  const age = Date.now() / 1000 - Number(params.get("auth_date") ?? 0);
  if (age > 60 * 60 * 24) return null;
  try {
    return JSON.parse(params.get("user") ?? "null") as { id: number } | null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const user = await verify(body.initData);
  if (!user) return json({ error: "unauthorized" }, 401);

  if (body.action === "my_stores") {
    const { data: own } = await sb.from("store_owners").select("store_id").eq("tg_id", user.id);
    const ids = (own ?? []).map((o) => o.store_id);
    if (!ids.length) return json({ stores: [] });
    const { data } = await sb.from("stores").select("id,name,address").in("id", ids);
    return json({ stores: data ?? [] });
  }

  if (body.action === "update_prices") {
    const { data: own } = await sb.from("store_owners").select("store_id")
      .eq("tg_id", user.id).eq("store_id", body.store_id);
    if (!own?.length) return json({ error: "forbidden" }, 403);
    const rows = (Array.isArray(body.items) ? body.items : [])
      .filter((i: any) => Number.isInteger(i.product_id) && Number.isInteger(i.price) && i.price > 0 && i.price < 100000000)
      .map((i: any) => ({
        store_id: body.store_id,
        product_id: i.product_id,
        price: i.price,
        in_stock: i.in_stock !== false,
        updated_at: new Date().toISOString(),
      }));
    if (!rows.length) return json({ error: "no_items" }, 400);
    const { error } = await sb.from("prices").upsert(rows, { onConflict: "store_id,product_id" });
    return error ? json({ error: error.message }, 500) : json({ ok: true, saved: rows.length });
  }

  if (body.action === "report") {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await sb.from("reports").select("id", { count: "exact", head: true })
      .eq("reporter_tg_id", user.id).gte("created_at", since);
    if ((count ?? 0) >= 20) return json({ error: "limit" }, 429);
    const { error } = await sb.from("reports").insert({
      store_id: body.store_id,
      product_id: body.product_id,
      reporter_tg_id: user.id,
    });
    return error ? json({ error: error.message }, 500) : json({ ok: true });
  }

  return json({ error: "unknown_action" }, 400);
});
