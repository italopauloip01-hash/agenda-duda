// Envia a notificação "Novo agendamento" para todos os celulares da dona (Web Push),
// mesmo com o app fechado. Chamada pelo gatilho disparar_push (banco) com o header x-push-key.
// POST {notificacao_id}
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { erro: "metodo" });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: cfg } = await admin.from("config_privada").select("chave, valor")
    .in("chave", ["push_hook_key", "vapid_public", "vapid_private"]);
  const get = (k: string) => cfg?.find((c) => c.chave === k)?.valor;
  if (!get("push_hook_key") || req.headers.get("x-push-key") !== get("push_hook_key")) return json(401, { erro: "chave" });
  webpush.setVapidDetails("https://bellisa.vercel.app", get("vapid_public")!, get("vapid_private")!);

  const { notificacao_id } = await req.json().catch(() => ({}));
  const { data: n } = await admin.from("notificacoes").select("owner_id, icone, texto, agendamento_id").eq("id", notificacao_id).maybeSingle();
  if (!n) return json(404, { erro: "notificacao" });
  const { data: subs } = await admin.from("push_inscricoes").select("id, endpoint, p256dh, auth").eq("owner_id", n.owner_id);

  const payload = JSON.stringify({ titulo: "Novo agendamento", texto: n.texto, agendamento_id: n.agendamento_id, tag: "agend-" + (n.agendamento_id || notificacao_id) });
  let ok = 0;
  for (const s of subs || []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: "high" });
      ok++;
    } catch (e) {
      // celular desinstalou o app ou tirou a permissão: remove a inscrição
      // deno-lint-ignore no-explicit-any
      const st = (e as any)?.statusCode;
      if (st === 404 || st === 410) await admin.from("push_inscricoes").delete().eq("id", s.id);
    }
  }
  return json(200, { enviados: ok, total: subs?.length || 0 });
});
