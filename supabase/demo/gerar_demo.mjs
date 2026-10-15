// Gera e insere dados de demonstração para uma conta da Agenda da Duda.
// Uso: SB_KEY=<service_role> OWNER=<uuid> node demo.mjs
const BASE = 'https://rsrpfwtrkpclscpccaok.supabase.co/rest/v1';
const KEY = process.env.SB_KEY, OWNER = process.env.OWNER;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

async function api(method, path, body) {
  const r = await fetch(`${BASE}/${path}`, { method, headers: H, body: body && JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}

// PRNG determinístico (mesmos dados a cada execução)
let seed = 20261015;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = a => a[Math.floor(rnd() * a.length)];
const pad = n => String(n).padStart(2, '0');
const TZ = '-03:00';
const iso = (d, min) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(Math.floor(min / 60))}:${pad(min % 60)}:00${TZ}`;
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
const agoraMin = new Date().getHours() * 60 + new Date().getMinutes();
const addDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// ── serviços já cadastrados ──
const servicos = await api('GET', `servicos?select=*&owner_id=eq.${OWNER}&ativo=eq.true`);
if (!servicos.length) throw new Error('conta sem serviços');
const nail = servicos.filter(s => s.tipo === 'esmalteria');
const pod = servicos.filter(s => s.tipo === 'podologia');
// pesos: serviços mais comuns aparecem mais
const peso = { 'Unhas em Gel': 5, 'Manutenção Acrílico': 4, 'Esmaltação Simples': 4, 'Esmaltação em Gel': 3, 'Unhas em Acrílico': 2, 'Nail Design (por unha)': 1, 'Remoção de Acrílico': 1, 'Podologia Básica': 4, 'Tratamento de Micose': 2, 'Calosidades': 2, 'Palmilha Personalizada': 1 };
const sorteia = lista => { const tot = lista.reduce((s, x) => s + (peso[x.nome] || 1), 0); let r = rnd() * tot; for (const x of lista) { r -= peso[x.nome] || 1; if (r <= 0) return x; } return lista[0]; };

// ── clientes ──
const CORES = ['#B5637A', '#7366B0', '#5E8C7A', '#A07F5C', '#6F7F99', '#9A6B8F', '#7C8B5E', '#8A6E6E'];
const pessoas = [
  ['Ana Lima', 'esmalteria', '1990-04-10', true, 'Instagram', 'Prefere gel, cores nude'],
  ['Juliana Costa', 'esmalteria', '1992-01-05', true, 'Indicação', null],
  ['Camila Nunes', 'esmalteria', '1995-10-22', false, 'Instagram', 'Gosta de nail art floral'],
  ['Maria Souza', 'esmalteria', '2000-10-20', false, 'WhatsApp', null],
  ['Fernanda Reis', 'podologia', '1988-07-14', false, 'Google', 'Diabética — cuidado redobrado'],
  ['Patrícia Alves', 'podologia', '1985-03-08', true, 'Indicação', 'Tratamento de micose em andamento'],
  ['Renata Moura', 'ambos', ymd(addDias(hoje, 1)).replace(/^\d{4}/, '1998'), false, 'Instagram', null],
  ['Silvia Torres', 'esmalteria', '1975-12-25', false, 'WhatsApp', null],
  ['Beatriz Rocha', 'esmalteria', '1997-06-30', false, 'Instagram', 'Alérgica a acetona'],
  ['Larissa Mendes', 'ambos', '1993-09-12', true, 'Indicação', null],
  ['Carla Ferreira', 'podologia', '1968-02-17', false, 'Google', null],
  ['Tatiane Ribeiro', 'esmalteria', '2001-11-03', false, 'Instagram', null],
  ['Débora Martins', 'esmalteria', '1989-08-21', false, 'WhatsApp', 'Sempre atrasa uns 10 min'],
  ['Luciana Prado', 'podologia', '1979-05-02', false, 'Indicação', null],
  ['Gabriela Santos', 'esmalteria', '1996-03-27', false, 'Instagram', null],
  ['Helena Duarte', 'ambos', '1982-12-09', true, 'Indicação', null],
];
// mais 24 clientes para a carteira ficar realista
const nomes = ['Aline','Bruna','Cristina','Daniela','Elaine','Flávia','Giovana','Isabela','Jéssica','Karina','Letícia','Mariana','Natália','Olívia','Paula','Priscila','Raquel','Sabrina','Talita','Vanessa','Viviane','Yasmin','Rosana','Kelly'];
const sobrenomes = ['Almeida','Barbosa','Cardoso','Dias','Gomes','Lopes','Moreira','Nascimento','Oliveira','Pereira','Ramos','Teixeira','Vieira','Araújo','Castro','Freitas'];
nomes.forEach((n, i) => {
  const tipo = rnd() < .7 ? 'esmalteria' : rnd() < .7 ? 'podologia' : 'ambos';
  const ano = 1965 + Math.floor(rnd() * 40), mes = 1 + Math.floor(rnd() * 12), dia = 1 + Math.floor(rnd() * 28);
  pessoas.push([n + ' ' + sobrenomes[i % sobrenomes.length], tipo, rnd() < .7 ? ano + '-' + pad(mes) + '-' + pad(dia) : null, rnd() < .08, pick(['Instagram','WhatsApp','Indicação','Google']), null]);
});
const clientes = await api('POST', 'clientes', pessoas.map(([nome, tipo, nasc, vip, origem, pref], i) => ({
  owner_id: OWNER, nome, tipo, nascimento: nasc, vip, origem, preferencias: pref,
  telefone: `55319${String(80000000 + i * 197531).slice(0, 8)}`, cor: CORES[i % CORES.length],
})));
// algumas clientes vêm mais (VIP e fiéis)
const freq = clientes.map(c => (c.vip ? 2.5 : 1) * (rnd() < .3 ? 1.6 : rnd() < .3 ? .4 : 1));
const sorteiaCliente = tipo => {
  const ok = clientes.map((c, i) => [c, freq[i]]).filter(([c]) => c.tipo === tipo || c.tipo === 'ambos');
  const tot = ok.reduce((s, x) => s + x[1], 0); let r = rnd() * tot;
  for (const [c, f] of ok) { r -= f; if (r <= 0) return c; } return ok[0][0];
};

// ── agendamentos: de 1º de agosto até daqui a 14 dias, seg–sáb ──
const inicio = new Date(hoje.getFullYear(), 7, 1);
const folgaDia = addDias(hoje, 9);
const ags = [];
for (let d = new Date(inicio); d <= addDias(hoje, 14); d = addDias(d, 1)) {
  if (d.getDay() === 0) continue;
  if (ymd(d) === ymd(folgaDia)) continue;
  const futuro = d > hoje, ehHoje = ymd(d) === ymd(hoje);
  const sab = d.getDay() === 6;
  const fim = sab ? 13 * 60 : 18 * 60;
  // dias futuros vão ficando mais vazios
  const distancia = Math.round((d - hoje) / 864e5);
  const alvo = futuro ? Math.max(1, Math.round((sab ? 3 : 5) - distancia / 4 + rnd() * 2 - 1)) : Math.round((sab ? 3 : 4) + rnd() * 2);
  let t = 8 * 60 + (rnd() < .4 ? 30 : 0), n = 0;
  while (n < alvo) {
    const svc = rnd() < .68 ? sorteia(nail) : sorteia(pod);
    const dur = svc.duracao_min + svc.intervalo_min;
    if (t + dur > fim) break;
    if (t === 12 * 60 || (t > 11 * 60 + 30 && t < 13 * 60)) { t = 13 * 60; continue; } // almoço
    const cli = sorteiaCliente(svc.tipo);
    let status;
    if (futuro) status = rnd() < .45 ? 'confirmado' : 'agendado';
    else if (ehHoje) status = t + dur <= agoraMin ? 'concluido' : t <= agoraMin ? 'em_atendimento' : 'confirmado';
    else { const r = rnd(); status = r < .05 ? 'faltou' : r < .09 ? 'cancelado' : 'concluido'; }
    ags.push({
      owner_id: OWNER, cliente_id: cli.id, servico_id: svc.id, servico_nome: svc.nome, tipo: svc.tipo,
      inicio: iso(d, t), fim: iso(d, t + dur), status, valor: Number(svc.preco_promo ?? svc.preco),
      local: rnd() < .06 ? 'Domicílio' : 'Studio', origem: rnd() < .35 ? 'whatsapp' : 'painel',
    });
    n++;
    t += dur + pick([0, 0, 10, 20, 30, 60]);
    t = Math.ceil(t / 10) * 10;
  }
}
for (let i = 0; i < ags.length; i += 200) await api('POST', 'agendamentos', ags.slice(i, i + 200));

// ── bloqueios ──
const dentista = addDias(hoje, 3).getDay() === 0 ? addDias(hoje, 4) : addDias(hoje, 3);
await api('POST', 'bloqueios', [
  { owner_id: OWNER, tipo: 'folga', inicio: iso(folgaDia, 0), fim: iso(addDias(folgaDia, 1), 0), motivo: 'Feriado prolongado' },
  { owner_id: OWNER, tipo: 'bloqueio', inicio: iso(dentista, 17 * 60), fim: iso(dentista, 18 * 60), motivo: 'Dentista' },
]);

// ── estoque ──
await api('POST', 'produtos', [
  ['Base Rubber Rosa', 'Gel', 1, 3, 28], ['Gel UV Francesinha', 'Gel', 2, 4, 35], ['Top Coat Brilho', 'Gel', 5, 3, 32],
  ['Esmalte Vermelho Clássico', 'Esmalte', 8, 4, 12], ['Esmalte Nude Rosé', 'Esmalte', 3, 5, 12],
  ['Pó Acrílico Pink', 'Acrílico', 2, 2, 45], ['Lâmina descartável', 'Material Podologia', 15, 20, 1.5],
  ['Acetona pura 500ml', 'Outros', 4, 3, 18], ['Lixa 100/180 (cx)', 'Outros', 6, 2, 22],
].map(([nome, categoria, quantidade, minimo, custo]) => ({ owner_id: OWNER, nome, categoria, quantidade, minimo, custo })));

// ── despesas ──
const desp = [];
for (let m = 7; m <= hoje.getMonth(); m++) {
  const ano = hoje.getFullYear();
  const dia = (n) => ymd(new Date(ano, m, n));
  desp.push({ descricao: 'Aluguel do studio', categoria: 'Aluguel', valor: 800, data: dia(5) });
  desp.push({ descricao: 'Energia', categoria: 'Outros', valor: 140 + Math.round(rnd() * 40), data: dia(12) });
  desp.push({ descricao: 'Esmaltes e géis', categoria: 'Material', valor: 260 + Math.round(rnd() * 120), data: dia(8) });
  desp.push({ descricao: 'Descartáveis (lixas, luvas, lâminas)', categoria: 'Material', valor: 90 + Math.round(rnd() * 40), data: dia(20) });
}
desp.push({ descricao: 'Curso de nail art avançado', categoria: 'Curso / Capacitação', valor: 350, data: ymd(new Date(hoje.getFullYear(), 8, 14)) });
desp.push({ descricao: 'Cabine LED nova', categoria: 'Equipamento', valor: 420, data: ymd(new Date(hoje.getFullYear(), 7, 22)) });
await api('POST', 'despesas', desp.filter(x => x.data <= ymd(hoje)).map(x => ({ owner_id: OWNER, ...x })));

// ── avaliações ──
const porNome = n => clientes.find(c => c.nome === n);
const aval = [
  ['Ana Lima', 5, 'Amei! Ficou perfeito, já marquei a próxima.', true, 20],
  ['Juliana Costa', 5, 'Super caprichosa, o gel durou três semanas.', true, 15],
  ['Patrícia Alves', 5, 'A Duda é incrível, meu pé melhorou demais.', true, 11],
  ['Larissa Mendes', 4, 'Muito bom! Só achei que atrasou um pouquinho.', true, 8],
  ['Helena Duarte', 5, 'Atendimento impecável e ambiente muito limpo.', true, 5],
  ['Camila Nunes', 5, 'A nail art ficou linda, todo mundo elogiou.', false, 1],
  ['Beatriz Rocha', 4, 'Gostei bastante, voltarei com certeza.', false, 0],
];
await api('POST', 'avaliacoes', aval.map(([n, nota, comentario, publicada, dias]) => ({
  owner_id: OWNER, cliente_id: porNome(n).id, nome: n, nota, comentario, publicada,
  criado_em: new Date(Date.now() - dias * 864e5 - 3 * 36e5).toISOString(),
})));

// ── notificações ──
const proxAg = ags.filter(a => a.origem === 'whatsapp' && new Date(a.inicio) > new Date())[0];
const nomeDe = id => clientes.find(c => c.id === id).nome;
await api('POST', 'notificacoes', [
  [proxAg ? `${nomeDe(proxAg.cliente_id)} agendou pelo WhatsApp: ${proxAg.servico_nome}` : 'Novo agendamento pelo WhatsApp', '📩', 12, false],
  ['Beatriz Rocha avaliou o atendimento com 4 estrelas', '⭐', 50, false],
  ['Lembretes enviados para as clientes de amanhã', '⏰', 180, true],
  ['Estoque baixo: Base Rubber Rosa (1 un, mínimo 3)', '📦', 300, true],
  ['Aniversário amanhã: Renata Moura', '🎂', 600, true],
].map(([texto, icone, min, lida]) => ({ owner_id: OWNER, texto, icone, lida, criado_em: new Date(Date.now() - min * 6e4).toISOString() })));

const cont = s => ags.filter(a => a.status === s).length;
console.log(JSON.stringify({
  clientes: clientes.length, agendamentos: ags.length,
  concluidos: cont('concluido'), faltas: cont('faltou'), cancelados: cont('cancelado'),
  futuros: ags.filter(a => new Date(a.inicio) > new Date()).length,
  despesas: desp.filter(x => x.data <= ymd(hoje)).length,
}));
