// Devolve um access token do Google novo para a usuária logada.
// O refresh token fica em public.google_conexao e o client secret em
// public.config_privada — nenhum dos dois chega ao navegador.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: { user }, error: eUser } = await admin.auth.getUser(jwt);
  if (eUser || !user) return json(401, { erro: "sessao" });

  const { data: conexao } = await admin.from("google_conexao")
    .select("refresh_token, calendario_id").eq("owner_id", user.id).maybeSingle();
  if (!conexao) return json(404, { erro: "nao_conectado" });

  const { data: cfg } = await admin.from("config_privada").select("chave, valor")
    .in("chave", ["google_client_id", "google_client_secret"]);
  const get = (k: string) => cfg?.find((c) => c.chave === k)?.valor;
  if (!get("google_client_id") || !get("google_client_secret")) return json(500, { erro: "sem_credenciais" });

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: conexao.refresh_token,
      client_id: get("google_client_id")!,
      client_secret: get("google_client_secret")!,
    }),
  });
  const t = await r.json();
  if (!r.ok) {
    // permissão revogada ou expirada: força a reconexão
    if (t.error === "invalid_grant") await admin.from("google_conexao").delete().eq("owner_id", user.id);
    return json(401, { erro: "reconectar", detalhe: t.error });
  }
  return json(200, { access_token: t.access_token, expires_in: t.expires_in, calendario_id: conexao.calendario_id });
});
