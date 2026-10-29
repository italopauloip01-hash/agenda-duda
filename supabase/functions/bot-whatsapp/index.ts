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
  lembrete24: "{saudacao}, {nome}! Passando para lembrar do seu horário de {servico} {dia} às {hora} ✨\n\nSe não puder vir, cancele aqui ainda dentro do prazo de 24h, para evitar a cobrança de 1/3 do valor ({taxa}): {link_cancelar}",
  lembrete5: "{saudacao}, {nome}! Seu horário de {servico} é {dia} às {hora} 💖 Te espero!",
  avaliacao: "{saudacao}, {nome}! Obrigada pela visita 💖 Pode me contar como foi seu {servico}? Leva só 10 segundinhos: {link_avaliacao}",
  auto_resposta: "{saudacao}! Aqui é do {studio} ✨ Já vi sua mensagem e logo te respondo. Se quiser agendar agora, escolha o dia e o horário por aqui: {link}",
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
  // "Duda Macena" → "Studio Duda Macena" (se o nome do perfil já diz Studio/Salão/Espaço…, fica como está)
  const nomeDoStudio = (n: string) => !n ? "studio" : /^(studio|est[uú]dio|sal[aã]o|espa[cç]o|ateli[eê]|cl[ií]nica|barbearia)\b/i.test(n) ? n : `Studio ${n}`;
  const preencher = (t: string, v: Record<string, string>) =>
    t.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? ({ studio: nomeDoStudio(perfil?.nome || ""), link, saudacao: saudacao() } as Record<string, string>)[k] ?? m)
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
    if (perfil?.whatsapp_auto) { await gerarLembretes(); await pedirAvaliacoes(); }
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
    // desistiu de vez (3 tentativas): avisa a profissional para conferir o número da cliente
    if (!corpo.ok && tent >= 3) {
      const { data: f } = await admin.from("fila_whatsapp").select("agendamento_id, telefone").eq("id", corpo.id).maybeSingle();
      let nome = "a cliente";
      if (f?.agendamento_id) {
        const { data: a } = await admin.from("agendamentos").select("clientes(nome)").eq("id", f.agendamento_id).maybeSingle();
        // deno-lint-ignore no-explicit-any
        nome = String((a as any)?.clientes?.nome || nome).split(" ")[0];
      }
      const motivo = /sem WhatsApp/i.test(String(corpo.erro)) ? "o número não tem WhatsApp — confira se foi digitado certo" : "deu erro no envio";
      await admin.from("notificacoes").insert({ owner_id: owner, icone: "⚠️", agendamento_id: f?.agendamento_id || null,
        texto: `Não consegui mandar WhatsApp para ${nome} (${String(f?.telefone || "").replace(/^55(\d{2})(\d+)(\d{4})$/, "($1) …$3")}): ${motivo}.` });
    }
    return json(200, { ok: true });
  }
  if (corpo.acao === "conversa") {
    if (!perfil?.whatsapp_auto) return json(200, { respostas: [], estado: null });
    return json(200, await conversar(String(corpo.texto || ""), corpo.estado || null, String(corpo.telefone || ""), String(corpo.nome || "")));
  }
  return json(400, { erro: "acao" });

  // ── Conversa do robô ──────────────────────────────────────────────
  // Só é chamada para conversas individuais que escreveram para o studio (o robô nunca puxa conversa).
  // Menu: 1 agendar · 2 serviços e preços · 3 meus horários · 4 endereço e horários · 5 falar com a profissional.
  // Agendar prioriza o link (mais bonito, com fotos); se a cliente preferir, marca por aqui mesmo
  // (categoria → serviço → dia → horário → confirmar), usando a mesma função do link (mesmas regras).
  // deno-lint-ignore no-explicit-any
  async function conversar(texto: string, estado: any, telefone: string, nomeWa: string) {
    const t = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const num = (t.match(/^\s*(\d{1,2})\b/) || [])[1];
    const R: string[] = [];
    const st = estado && Date.now() - (estado.em || 0) < 40 * 60e3 ? estado : { etapa: "inicio" };
    const fim = (e: unknown) => ({ respostas: R, estado: e ? { ...(e as object), em: Date.now() } : null });
    const nomeStudio = nomeDoStudio(perfil?.nome || "");
    const { data: svcs } = await admin.from("servicos").select("id, nome, tipo, duracao_min, intervalo_min, preco, preco_promo")
      .eq("owner_id", owner).eq("ativo", true).order("tipo").order("nome");
    const servicos = (svcs || []).filter((s) => Number(s.preco) > 0);
    const tipos = [...new Set(servicos.map((s) => s.tipo))];
    // as 4 categorias antigas têm id curto; as demais já são o nome que a profissional deu
    const nomeTipo = (x: string) => ({ esmalteria: "Unhas" } as Record<string, string>)[x] || x.charAt(0).toUpperCase() + x.slice(1);
    const reais = (v: number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const dur = (m: number) => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}` : `${m}min`;
    const MENU = `Como posso te ajudar? Responda com o número:\n\n1️⃣ Agendar horário\n2️⃣ Serviços e preços\n3️⃣ Meus horários\n4️⃣ Endereço e horário de atendimento\n5️⃣ Falar com a ${nomeStudio.replace(/^Studio (d[aeo] )?/i, "")}`;
    const quer = (re: RegExp) => re.test(t);
    // atalhos que valem em qualquer etapa
    if (quer(/\b(menu|inicio|voltar|opcoes)\b/) || (st.etapa === "inicio" && !num && !quer(/agend|marc|horario|preco|valor|quanto|servic|endereco|onde|local|cancel|desmarc|atendente|humana|falar/))) {
      R.push(`${saudacao()}! Aqui é do ${nomeStudio} ✨ Sou a assistente virtual.`, MENU);
      return fim({ etapa: "menu" });
    }
    if (quer(/atendente|humana|pessoa|falar com|5️⃣/) || (["menu", "inicio"].includes(st.etapa) && num === "5")) {
      await admin.from("notificacoes").insert({ owner_id: owner, icone: "💬", texto: `${nomeWa || "Uma cliente"} (${telefone ? "…" + telefone.slice(-4) : "WhatsApp"}) pediu para falar com você no WhatsApp.` });
      R.push("Prontinho! Já avisei e logo você recebe uma resposta por aqui 💖");
      return { respostas: R, estado: null, silenciar_min: 120 };
    }
    // ── menu principal ──
    if (["menu", "inicio"].includes(st.etapa) || !num) {
      const op = num || (quer(/preco|valor|quanto|servic|catalog/) ? "2" : quer(/meus|cancel|desmarc|remarc/) ? "3" : quer(/endereco|onde|local|funciona/) ? "4" : quer(/agend|marc|horario|vaga/) ? "1" : "");
      if (op === "2") {
        const blocos = tipos.map((tp) => `*${nomeTipo(tp)}*\n` + servicos.filter((s) => s.tipo === tp).map((s) => `• ${s.nome} — ${reais(Number(s.preco_promo ?? s.preco))} (${dur(s.duracao_min)})`).join("\n"));
        R.push(`Nossos serviços ✨\n\n${blocos.join("\n\n")}`);
        R.push(link ? `Para agendar, o jeito mais fácil é pelo link (tem fotos dos trabalhos e os horários livres):\n${link}\n\nOu responda *1* que eu marco por aqui.` : "Quer agendar? Responda *1*.");
        return fim({ etapa: "menu" });
      }
      if (op === "4") {
        const { data: hs } = await admin.rpc("agenda_publica", { p_slug: perfil?.slug || "" });
        const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
        // deno-lint-ignore no-explicit-any
        const horarios = ((hs as any)?.horarios || []).filter((h: any) => h.abre).map((h: any) => `${dias[h.dia]}: ${h.abre.slice(0, 5)}–${h.fecha.slice(0, 5)}`).join("\n");
        const { data: pf } = await admin.from("perfil").select("endereco").eq("owner_id", owner).maybeSingle();
        R.push(`📍 ${pf?.endereco || "Me chama aqui que te passo o endereço certinho."}${pf?.endereco ? `\nhttps://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pf.endereco)}` : ""}${horarios ? `\n\n🕐 Horários de atendimento:\n${horarios}` : ""}`);
        R.push("Posso ajudar em mais alguma coisa? Responda *menu* para ver as opções.");
        return fim({ etapa: "menu" });
      }
      if (op === "3") {
        const tel = telefone.replace(/\D/g, "");
        const vars = tel ? [tel, tel.replace(/^55(\d{2})9(\d{8})$/, "55$1$2"), tel.replace(/^55(\d{2})(\d{8})$/, "55$19$2")] : [];
        const { data: cls } = vars.length ? await admin.from("clientes").select("id").eq("owner_id", owner).in("telefone", vars) : { data: [] };
        const ids = (cls || []).map((c) => c.id);
        const { data: ags } = ids.length ? await admin.from("agendamentos").select("inicio, servico_nome, status, avaliacao_token")
          .in("cliente_id", ids).in("status", ["agendado", "confirmado"]).gt("inicio", new Date().toISOString()).order("inicio").limit(5) : { data: [] };
        if (!ags?.length) R.push(`Não encontrei horários marcados neste número 🤔${link ? `\nPara agendar: ${link}` : ""}\nOu responda *1* que eu marco por aqui.`);
        else R.push("Seus próximos horários:\n\n" + ags.map((a) => `• ${fmt(new Date(a.inicio), { weekday: "long", day: "2-digit", month: "2-digit" })} às ${fmt(new Date(a.inicio), { hour: "2-digit", minute: "2-digit" })} — ${a.servico_nome}${a.status === "agendado" ? " (aguardando confirmação)" : " ✅"}\n  Confirmar ou cancelar: ${SITE}confirmar.html?t=${a.avaliacao_token}`).join("\n\n"));
        return fim({ etapa: "menu" });
      }
      if (op === "1") {
        if (!perfil?.agendamento_online || !perfil?.slug) { R.push("No momento os agendamentos são combinados direto comigo. Responda *5* que eu te chamo 😉"); return fim({ etapa: "menu" }); }
        R.push(`Que ótimo! 💖 O jeito mais fácil e bonitinho é pelo link, com os horários livres e fotos dos trabalhos:\n${link}`);
        R.push("Se preferir marcar por aqui, escolha a categoria:\n\n" + tipos.map((tp, i) => `${i + 1}. ${nomeTipo(tp)}`).join("\n") + "\n\n(ou *menu* para voltar)");
        return fim({ etapa: "categoria" });
      }
      if (quer(/obrigad|brigad|valeu|agradec/)) { R.push("Imagina! 💖 Qualquer coisa é só chamar."); return { respostas: R, estado: null, silenciar_min: 60 }; }
      // conversa livre depois do menu (ex.: "oi, tudo bem?"): quem responde é a profissional
      if (st.etapa === "menu" && !num) return { respostas: [], estado: null, silenciar_min: 60 };
      R.push("Não entendi direitinho 🙈", MENU);
      return fim({ etapa: "menu" });
    }
    // ── fluxo de agendamento ──
    const n = Number(num);
    if (st.etapa === "categoria") {
      const tp = tipos[n - 1]; if (!tp) { R.push("Responda com o número da categoria 😉"); return fim(st); }
      const lista = servicos.filter((s) => s.tipo === tp);
      R.push(`*${nomeTipo(tp)}* — qual serviço?\n\n` + lista.map((s, i) => `${i + 1}. ${s.nome} — ${reais(Number(s.preco_promo ?? s.preco))} (${dur(s.duracao_min)})`).join("\n"));
      return fim({ etapa: "servico", tipo: tp });
    }
    if (st.etapa === "servico") {
      const s = servicos.filter((x) => x.tipo === st.tipo)[n - 1]; if (!s) { R.push("Responda com o número do serviço 😉"); return fim(st); }
      const dias = await diasLivres(s.duracao_min + (s.intervalo_min || 0));
      if (!dias.length) { R.push(`Poxa, não achei horário livre nos próximos dias para ${s.nome} 😔 Responda *5* que eu te ajudo a encaixar.`); return fim({ etapa: "menu" }); }
      R.push(`${s.nome} ✨ Qual dia fica melhor?\n\n` + dias.map((d, i) => `${i + 1}. ${d.rotulo} (${d.horas.length} horário${d.horas.length > 1 ? "s" : ""})`).join("\n"));
      return fim({ etapa: "dia", svc: s.id, dias: dias.map((d) => ({ data: d.data, rotulo: d.rotulo })) });
    }
    if (st.etapa === "dia") {
      const d = st.dias?.[n - 1]; if (!d) { R.push("Responda com o número do dia 😉"); return fim(st); }
      const s = servicos.find((x) => x.id === st.svc); if (!s) return fim({ etapa: "menu" });
      const horas = (await diasLivres(s.duracao_min + (s.intervalo_min || 0), d.data))[0]?.horas || [];
      if (!horas.length) { R.push("Esse dia acabou de lotar 😔 Responda *menu* e vamos de novo."); return fim({ etapa: "menu" }); }
      const mostra = horas.slice(0, 12);
      R.push(`${d.rotulo} — escolha o horário:\n\n` + mostra.map((h, i) => `${i + 1}. ${h}`).join("\n"));
      return fim({ ...st, etapa: "hora", data: d.data, rotulo: d.rotulo, horas: mostra });
    }
    if (st.etapa === "hora") {
      const h = st.horas?.[n - 1]; if (!h) { R.push("Responda com o número do horário 😉"); return fim(st); }
      const s = servicos.find((x) => x.id === st.svc);
      if (!telefone) { R.push("Para reservar, me manda seu WhatsApp com DDD (só números) 😉"); return fim({ ...st, etapa: "telefone", hora: h }); }
      R.push(`Confere?\n\n✨ ${s?.nome}\n📅 ${st.rotulo} às ${h}\n💰 ${reais(Number(s?.preco_promo ?? s?.preco ?? 0))}\n\n1. Confirmar\n2. Escolher outro horário`);
      return fim({ ...st, etapa: "confirmar", hora: h, tel: telefone });
    }
    if (st.etapa === "telefone") {
      const tel = t.replace(/\D/g, ""); if (tel.length < 10) { R.push("Me manda o número com DDD, só os números 😉"); return fim(st); }
      return conversar("1", { ...st, etapa: "hora", horas: [st.hora] }, tel, nomeWa);
    }
    if (st.etapa === "confirmar") {
      if (n === 2) return conversar(String(st.dias.findIndex((d: { data: string }) => d.data === st.data) + 1), { ...st, etapa: "dia" }, telefone, nomeWa);
      if (n !== 1) { R.push("Responda *1* para confirmar ou *2* para escolher outro horário."); return fim(st); }
      const inicio = new Date(`${st.data}T${st.hora}:00-03:00`).toISOString();
      const { error } = await admin.rpc("agendar_online", { p_slug: perfil?.slug, p_servico: st.svc, p_inicio: inicio, p_nome: nomeWa.trim().length >= 2 ? nomeWa.trim().slice(0, 80) : "Cliente WhatsApp", p_telefone: (telefone || st.tel || "").replace(/^55/, ""), p_obs: "Agendado pelo WhatsApp" });
      if (error) {
        const m = String(error.message);
        R.push(m.includes("ocupado") ? "Esse horário acabou de ser reservado 😔 Responda *menu* para escolher outro." : m.includes("limite") ? "Você já tem pedidos aguardando confirmação. Assim que forem confirmados, pode marcar mais 😉" : "Não consegui reservar agora 😔 Tenta pelo link: " + link);
        return fim({ etapa: "menu" });
      }
      R.push(`Pedido feito! 💖 ${st.rotulo} às ${st.hora}. Assim que for confirmado, te aviso por aqui.`);
      return { respostas: R, estado: null, silenciar_min: 30 };
    }
    R.push(MENU); return fim({ etapa: "menu" });
  }
  // próximos dias com horário livre (até 6) ou um dia específico
  async function diasLivres(durMin: number, soDia?: string) {
    const { data: pf } = await admin.from("perfil").select("antecedencia_min, dias_frente").eq("owner_id", owner).maybeSingle();
    const antec = Number(pf?.antecedencia_min ?? 60), frente = Math.min(Number(pf?.dias_frente ?? 30), 30);
    const res: { data: string; rotulo: string; horas: string[] }[] = [];
    const hoje = new Date(Date.now() - 3 * 3600e3); // hora de Brasília
    for (let k = 0; k <= frente && res.length < (soDia ? 1 : 6); k++) {
      const dt = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() + k));
      const ds = dt.toISOString().slice(0, 10); if (soDia && ds !== soDia) continue;
      const { data: hd } = await admin.rpc("horario_do_dia", { p_owner: owner, p_dow: dt.getUTCDay() });
      // deno-lint-ignore no-explicit-any
      const h: any = Array.isArray(hd) ? hd[0] : hd; if (!h?.abre) continue;
      const ini0 = new Date(`${ds}T00:00:00-03:00`), fim0 = new Date(ini0.getTime() + 864e5);
      const [{ data: ags }, { data: bls }] = await Promise.all([
        admin.from("agendamentos").select("inicio, fim").eq("owner_id", owner).not("status", "in", "(cancelado,faltou)").lt("inicio", fim0.toISOString()).gt("fim", ini0.toISOString()),
        admin.from("bloqueios").select("inicio, fim").eq("owner_id", owner).lt("inicio", fim0.toISOString()).gt("fim", ini0.toISOString())]);
      const oc = [...(ags || []), ...(bls || [])].map((x) => [new Date(x.inicio).getTime(), new Date(x.fim).getTime()]);
      const hm = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
      const horas: string[] = [];
      for (let m = hm(h.abre); m + durMin <= hm(h.fecha); m += 30) {
        if (h.almoco_inicio && m < hm(h.almoco_fim) && m + durMin > hm(h.almoco_inicio)) continue;
        const i = ini0.getTime() + m * 60e3, f = i + durMin * 60e3;
        if (i < Date.now() + antec * 60e3) continue;
        if (oc.some(([a, b]) => i < b && f > a)) continue;
        horas.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
      }
      if (horas.length) res.push({ data: ds, rotulo: k === 0 ? "Hoje" : k === 1 ? "Amanhã" : fmt(new Date(`${ds}T12:00:00-03:00`), { weekday: "long", day: "2-digit", month: "2-digit" }).replace(/^./, (c) => c.toUpperCase()), horas });
    }
    return res;
  }

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
      .select("id, inicio, criado_em, status, origem, servico_nome, valor, lembrete24_em, lembrete5_em, avaliacao_token, clientes(nome, telefone)")
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
        dia: d === hoje ? "hoje" : d === amanha ? "amanhã" : "dia " + d, data: d, hora: fmt(new Date(a.inicio), { hour: "2-digit", minute: "2-digit" }),
        link_confirmar: SITE + "confirmar.html?t=" + a.avaliacao_token, link_cancelar: SITE + "confirmar.html?t=" + a.avaliacao_token,
        taxa: (Math.round(Number(a.valor || 0) / 3 * 100) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) };
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
        // o link vai sempre junto: para confirmar (se ainda não confirmou) ou cancelar dentro do prazo de 24h
        texto: ((t) => t.includes(v.link_confirmar) ? t
          : a.status === "agendado" ? t + " Confirme ou cancele aqui: " + v.link_confirmar
          : tipo === "lembrete24" ? t + " Se precisar cancelar: " + v.link_cancelar : t)(preencher(textos[tipo] || PADRAO[tipo], v)), tipo, agendamento_id: a.id });
    }
  }
  // Pedido de avaliação: 1h depois do fim de um atendimento CONCLUÍDO (até 3 dias depois), uma vez só.
  async function pedirAvaliacoes() {
    const agora = Date.now();
    const horaLocal = Number(fmt(new Date(), { hour: "2-digit", hour12: false })) % 24;
    if (horaLocal >= 21 || horaLocal < 8) return;
    const { data: ags } = await admin.from("agendamentos")
      .select("id, fim, servico_nome, avaliacao_token, clientes(nome, telefone)")
      .eq("owner_id", owner).eq("status", "concluido").is("avaliacao_pedida_em", null)
      .lt("fim", new Date(agora - 60 * 60e3).toISOString()).gt("fim", new Date(agora - 3 * 864e5).toISOString()).limit(20);
    for (const a of ags || []) {
      // deno-lint-ignore no-explicit-any
      const cli = (a as any).clientes; if (!cli?.telefone) continue;
      const { count } = await admin.from("avaliacoes").select("id", { count: "exact", head: true }).eq("agendamento_id", a.id);
      const { data: marcou } = await admin.from("agendamentos").update({ avaliacao_pedida_em: new Date().toISOString() })
        .eq("id", a.id).is("avaliacao_pedida_em", null).select("id");
      if (!marcou?.length || (count || 0) > 0) continue;
      await admin.from("fila_whatsapp").insert({ owner_id: owner, telefone: cli.telefone, tipo: "avaliacao", agendamento_id: a.id,
        // se o texto editado não tiver o link, põe no fim (sem link a cliente não tem onde avaliar)
        texto: preencher(((t) => t.includes("{link_avaliacao}") ? t : t + " {link_avaliacao}")(textos.avaliacao || PADRAO.avaliacao), { nome: String(cli.nome || "").split(" ")[0], servico: a.servico_nome,
          link_avaliacao: SITE + "avaliar.html?t=" + a.avaliacao_token }) });
    }
  }
});
