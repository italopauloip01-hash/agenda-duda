// Ponte entre o robô do WhatsApp (no computador ou servidor) e a fila de mensagens.
// O robô manda o header x-bot-key; aqui comparamos o SHA-256 com config_privada('bot_key_hash:<owner_id>').
// POST {acao:'status', conectado, numero}   → atualiza whatsapp_bot (o app mostra conectado/desligado)
// POST {acao:'config'}                       → texto da resposta automática e se o robô está ligado no app
// POST {acao:'pendentes'}                    → gera os lembretes e devolve até 10 mensagens
// POST {acao:'resultado', id, ok, erro}      → marca 'enviado' ou 'erro'
import { createClient } from "jsr:@supabase/supabase-js@2";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
const SITE = "https://bellisa.vercel.app/";
const PADRAO: Record<string, string> = {
  lembrete24: "{saudacao}, {nome}! Passando para lembrar do seu horário de {servico} {dia} às {hora} 💅 Qualquer imprevisto é só me avisar por aqui.",
  lembrete5: "{saudacao}, {nome}! Seu horário de {servico} é {dia} às {hora} 💖 Te espero!",
  auto_resposta: "{saudacao}! Aqui é do {studio} 💅 Já vi sua mensagem e logo te respondo. Se quiser agendar agora, escolha o dia e o horário por aqui: {link}",
};
// Bom dia (5h–12h) · Boa tarde (12h–18h) · Boa noite (18h–5h), horário de Brasília
const saudacao = () => { const h = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date())) % 24; return h >= 5 && h < 12 ? "Bom dia" : h >= 12 && h < 18 ? "Boa tarde" : "Boa noite"; };
const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...o }).format(d);

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { erro: "metodo" });
  const chave = req.headers.get("x-bot-key") || "";
  if (chave.length < 32) return json(401, { erro: "chave" });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: cfg } = await admin.from("config_privada").select("chave").like("chave", "bot_key_hash:%")
    .eq("valor", await sha256(chave)).maybeSingle();
  if (!cfg) return json(401, { erro: "chave" });
  const owner = cfg.chave.split(":")[1];
  const corpo = await req.json().catch(() => ({}));
  const { data: perfil } = await admin.from("perfil").select("nome, slug, agendamento_online, whatsapp_auto, modelos, lembrete1_h, lembrete2_h").eq("owner_id", owner).maybeSingle();
  const textos = (perfil?.modelos?.textos || {}) as Record<string, string>;
  const link = perfil?.agendamento_online && perfil?.slug ? SITE + perfil.slug : "";
  const preencher = (t: string, v: Record<string, string>) =>
    t.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? ({ studio: perfil?.nome || "studio", link, saudacao: saudacao() } as Record<string, string>)[k] ?? m)
      .replace(/\s+([.!?,])/g, "$1").replace(/ {2,}/g, " ").trim();

  if (corpo.acao === "status") {
    const numero = corpo.numero ? String(corpo.numero).replace(/\D/g, "").slice(0, 15) : null;
    await admin.from("whatsapp_bot").upsert({ owner_id: owner, conectado: !!corpo.conectado, numero, visto_em: new Date().toISOString() });
    // o WhatsApp do studio (botão do site, mensagens) passa a ser sempre o número vinculado ao robô.
    // No Brasil o WhatsApp às vezes guarda o celular sem o 9: 55 33 9828-9160 → 55 33 9 9828-9160
    if (corpo.conectado && numero) {
      const m = numero.match(/^55(\d{2})([6-9]\d{7})$/);
      const completo = m ? `55${m[1]}9${m[2]}` : numero;
      await admin.from("perfil").update({ whatsapp: completo }).eq("owner_id", owner).or(`whatsapp.is.null,whatsapp.neq.${completo}`);
    }
    return json(200, { ok: true });
  }
  if (corpo.acao === "config") {
    return json(200, { ligado: !!perfil?.whatsapp_auto, auto_resposta: preencher(textos.auto_resposta || PADRAO.auto_resposta, { saudacao: "{saudacao}" }) }); // o robô põe a saudação na hora de enviar
  }
  if (corpo.acao === "pendentes") {
    if (perfil?.whatsapp_auto) await gerarLembretes();
    // devolve à fila o que ficou "enviando" por mais de 5 min (robô caiu no meio)
    await admin.from("fila_whatsapp").update({ status: "pendente" }).eq("owner_id", owner).eq("status", "enviando")
      .lt("criado_em", new Date(Date.now() - 5 * 60e3).toISOString());
    const { data } = await admin.from("fila_whatsapp").select("id, telefone, texto, tentativas, tipo, agendamento_id")
      .eq("owner_id", owner).eq("status", "pendente").order("criado_em").limit(10);
    // a mesma mensagem do mesmo horário nunca sai duas vezes (ex.: tocou "Confirmar" duas vezes)
    const vistos = new Set<string>(), duplicadas: string[] = [], enviar = [];
    for (const m of data || []) {
      if (m.agendamento_id && m.tipo) {
        const k = m.agendamento_id + "|" + m.tipo;
        const { count } = await admin.from("fila_whatsapp").select("id", { count: "exact", head: true })
          .eq("agendamento_id", m.agendamento_id).eq("tipo", m.tipo).in("status", ["enviado", "enviando"]);
        if (vistos.has(k) || (count || 0) > 0) { duplicadas.push(m.id); continue; }
        vistos.add(k);
      }
      enviar.push(m);
    }
    if (duplicadas.length) await admin.from("fila_whatsapp").update({ status: "erro", erro: "duplicada (não enviada)" }).in("id", duplicadas);
    const ids = enviar.map((m) => m.id);
    if (ids.length) await admin.from("fila_whatsapp").update({ status: "enviando" }).in("id", ids);
    return json(200, { mensagens: enviar.map(({ id, telefone, texto, tentativas }) => ({ id, telefone, texto, tentativas })) });
  }
  if (corpo.acao === "resultado" && corpo.id) {
    const { data: m } = await admin.from("fila_whatsapp").select("tentativas").eq("id", corpo.id).eq("owner_id", owner).maybeSingle();
    if (!m) return json(404, { erro: "mensagem" });
    const tent = (m.tentativas || 0) + 1;
    await admin.from("fila_whatsapp").update(corpo.ok
      ? { status: "enviado", enviado_em: new Date().toISOString(), erro: null, tentativas: tent }
      : { status: tent >= 3 ? "erro" : "pendente", erro: String(corpo.erro || "falha").slice(0, 300), tentativas: tent })
      .eq("id", corpo.id);
    return json(200, { ok: true });
  }
  return json(400, { erro: "acao" });

  // Lembretes automáticos: lembrete 1 e 2 (horas antes, configuráveis em Ajustes; 0 = desligado).
  // - Nunca de madrugada: entre 21h e 7h não gera nada (o que vencer à noite sai às 7h).
  // - Só horários confirmados (ou marcados pelo painel), e só 30 min depois de marcado.
  // - Se os dois venceram juntos (marcou em cima da hora), manda só o mais próximo.
  async function gerarLembretes() {
    const agora = Date.now();
    const horaLocal = Number(fmt(new Date(), { hour: "2-digit", hour12: false })) % 24;
    if (horaLocal >= 21 || horaLocal < 7) return;
    const l1 = Number(perfil?.lembrete1_h ?? 24), l2 = Number(perfil?.lembrete2_h ?? 5);
    const maior = Math.max(l1, l2);
    if (!maior) return;
    const { data: ags } = await admin.from("agendamentos")
      .select("id, inicio, criado_em, status, origem, servico_nome, lembrete24_em, lembrete5_em, clientes(nome, telefone)")
      .eq("owner_id", owner).in("status", ["agendado", "confirmado"])
      .gt("inicio", new Date(agora).toISOString()).lt("inicio", new Date(agora + maior * 3600e3).toISOString());
    const hoje = fmt(new Date(), { day: "2-digit", month: "2-digit" }), amanha = fmt(new Date(agora + 864e5), { day: "2-digit", month: "2-digit" });
    for (const a of ags || []) {
      if (a.status === "agendado" && a.origem === "online") continue; // pedido ainda não confirmado
      // deno-lint-ignore no-explicit-any
      const cli = (a as any).clientes; if (!cli?.telefone) continue;
      if (agora - new Date(a.criado_em).getTime() < 30 * 60e3) continue;
      const falta = new Date(a.inicio).getTime() - agora;
      const d = fmt(new Date(a.inicio), { day: "2-digit", month: "2-digit" });
      const v = { nome: String(cli.nome || "").split(" ")[0], servico: a.servico_nome,
        dia: d === hoje ? "hoje" : d === amanha ? "amanhã" : "dia " + d, data: d, hora: fmt(new Date(a.inicio), { hour: "2-digit", minute: "2-digit" }) };
      // o lembrete "mais perto do horário" (menor número de horas) é o lembrete5; o outro é o lembrete24
      const perto = Math.min(l1 || 999, l2 || 999), longe = l1 && l2 ? Math.max(l1, l2) : 0;
      let tipo: "lembrete24" | "lembrete5" | null = null;
      if (perto < 999 && !a.lembrete5_em && falta <= perto * 3600e3) tipo = "lembrete5";
      else if (longe && !a.lembrete24_em && !a.lembrete5_em && falta <= longe * 3600e3) tipo = "lembrete24";
      if (!tipo) continue;
      // marca primeiro (evita duplicar se duas chamadas chegarem juntas); o lembrete5 marca os dois
      const marca = tipo === "lembrete5" ? { lembrete5_em: new Date().toISOString(), lembrete24_em: a.lembrete24_em || new Date().toISOString() }
                                         : { lembrete24_em: new Date().toISOString() };
      const col = tipo === "lembrete24" ? "lembrete24_em" : "lembrete5_em";
      const { data: marcou } = await admin.from("agendamentos").update(marca).eq("id", a.id).is(col, null).select("id");
      if (!marcou?.length) continue;
      await admin.from("fila_whatsapp").insert({ owner_id: owner, telefone: cli.telefone,
        texto: preencher(textos[tipo] || PADRAO[tipo], v), tipo, agendamento_id: a.id });
    }
  }
});
