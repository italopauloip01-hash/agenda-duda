// Integração Google da usuária logada.
// POST {acao:'token'}                        → access token novo (renova pelo refresh token guardado)
// POST {acao:'trocar', code, redirect_uri}   → troca o código do consentimento pelo refresh token e guarda
// O refresh token fica em public.google_conexao e o client secret em public.config_privada —
// nenhum dos dois chega ao navegador.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Só aceita voltar para os endereços do próprio app
const RETORNOS = new Set([
  "https://bellisa.vercel.app/",
  "https://agenda-duda-ruddy.vercel.app/",
  "https://italopauloip01-hash.github.io/agenda-duda/",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: { user }, error: eUser } = await admin.auth.getUser(jwt);
  if (eUser || !user) return json(401, { erro: "sessao" });

  const corpo = await req.json().catch(() => ({}));
  const { data: cfg } = await admin.from("config_privada").select("chave, valor")
    .in("chave", ["google_client_id", "google_client_secret"]);
  const get = (k: string) => cfg?.find((c) => c.chave === k)?.valor;
  const clientId = get("google_client_id"), clientSecret = get("google_client_secret");
  if (!clientId || !clientSecret) return json(500, { erro: "sem_credenciais" });

  const tokenGoogle = (params: Record<string, string>) => fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }),
  }).then(async (r) => ({ ok: r.ok, j: await r.json() }));

  if (corpo.acao === "trocar") {
    if (!corpo.code || !RETORNOS.has(corpo.redirect_uri)) return json(400, { erro: "pedido_invalido" });
    const { ok, j } = await tokenGoogle({ grant_type: "authorization_code", code: corpo.code, redirect_uri: corpo.redirect_uri });
    if (!ok) return json(400, { erro: "troca_falhou", detalhe: j.error_description || j.error });
    if (!j.refresh_token) return json(400, { erro: "sem_refresh_token" });
    // e-mail da conta Google (vem no id_token quando o escopo "email" foi pedido)
    let email: string | null = null;
    try { email = JSON.parse(atob(j.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).email || null; } catch (_) { /* opcional */ }
    const { error } = await admin.from("google_conexao").upsert({
      owner_id: user.id, refresh_token: j.refresh_token, email_google: email, atualizado_em: new Date().toISOString(),
    }, { onConflict: "owner_id" });
    if (error) return json(500, { erro: "gravar", detalhe: error.message });
    const { data: c } = await admin.from("google_conexao").select("calendario_id").eq("owner_id", user.id).maybeSingle();
    return json(200, { access_token: j.access_token, expires_in: j.expires_in, email, calendario_id: c?.calendario_id ?? null });
  }

  // acao 'token' (padrão)
  const { data: conexao } = await admin.from("google_conexao")
    .select("refresh_token, calendario_id").eq("owner_id", user.id).maybeSingle();
  if (!conexao) return json(404, { erro: "nao_conectado" });
  const { ok, j } = await tokenGoogle({ grant_type: "refresh_token", refresh_token: conexao.refresh_token });
  if (!ok) {
    // permissão revogada ou expirada: força a reconexão
    if (j.error === "invalid_grant") await admin.from("google_conexao").delete().eq("owner_id", user.id);
    return json(401, { erro: "reconectar", detalhe: j.error });
  }
  return json(200, { access_token: j.access_token, expires_in: j.expires_in, calendario_id: conexao.calendario_id });
});
