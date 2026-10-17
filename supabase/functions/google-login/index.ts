// "Entrar com Google" sem depender do provedor Google do Supabase.
// POST {code, redirect_uri} (sem sessão; usa a chave publishable)
//  1. troca o código do consentimento no Google (com o client secret, que fica só aqui)
//  2. lê o e-mail verificado do id_token devolvido pelo próprio Google
//  3. cria a conta se não existir e gera um token de acesso de uso único
//  4. guarda o refresh token do Google para essa conta (calendário + contatos)
// O navegador recebe o token_hash e chama supabase.auth.verifyOtp para abrir a sessão.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const RETORNOS = new Set([
  "https://agenda-duda-ruddy.vercel.app/",
  "https://italopauloip01-hash.github.io/agenda-duda/",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { erro: "metodo" });

  const { code, redirect_uri } = await req.json().catch(() => ({}));
  if (!code || !RETORNOS.has(redirect_uri)) return json(400, { erro: "pedido_invalido" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: cfg } = await admin.from("config_privada").select("chave, valor")
    .in("chave", ["google_client_id", "google_client_secret"]);
  const get = (k: string) => cfg?.find((c) => c.chave === k)?.valor;
  const clientId = get("google_client_id"), clientSecret = get("google_client_secret");
  if (!clientId || !clientSecret) return json(500, { erro: "sem_credenciais" });

  // 1. troca do código
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", code, redirect_uri }),
  });
  const t = await r.json();
  if (!r.ok || !t.id_token) return json(400, { erro: "troca_falhou", detalhe: t.error_description || t.error });

  // 2. identidade (o id_token veio direto do Google por HTTPS com o nosso secret; conferimos destino e validade)
  let info: { email?: string; email_verified?: boolean; aud?: string; exp?: number; name?: string; picture?: string };
  try { info = JSON.parse(atob(t.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); }
  catch (_) { return json(400, { erro: "id_token" }); }
  if (info.aud !== clientId || !info.email || !info.email_verified || (info.exp ?? 0) * 1000 < Date.now())
    return json(401, { erro: "identidade" });
  const email = info.email.toLowerCase();

  // 3. conta + token de uso único
  const criado = await admin.auth.admin.createUser({
    email, email_confirm: true, user_metadata: { full_name: info.name, avatar_url: info.picture },
  });
  if (criado.error && !/already|registered|exists/i.test(criado.error.message))
    return json(500, { erro: "criar_conta", detalhe: criado.error.message });
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error || !link.data?.properties?.hashed_token) return json(500, { erro: "sessao", detalhe: link.error?.message });
  const userId = link.data.user.id;

  // 4. calendário e contatos já ficam vinculados
  if (t.refresh_token) {
    await admin.from("google_conexao").upsert({
      owner_id: userId, refresh_token: t.refresh_token, email_google: email, atualizado_em: new Date().toISOString(),
    }, { onConflict: "owner_id" });
  }
  const { data: c } = await admin.from("google_conexao").select("calendario_id").eq("owner_id", userId).maybeSingle();

  return json(200, {
    token_hash: link.data.properties.hashed_token, email, novo: !criado.error,
    access_token: t.access_token, expires_in: t.expires_in, calendario_id: c?.calendario_id ?? null,
    google_vinculado: !!t.refresh_token || !!c,
  });
});
