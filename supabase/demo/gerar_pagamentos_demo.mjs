// Cria pagamentos de exemplo para os agendamentos de uma conta (rodar depois de gerar_demo.mjs).
// Uso: SB_KEY=<service_role> OWNER=<uuid> node gerar_pagamentos_demo.mjs
// Passado concluído: ~80% pago na hora, ~12% entrada + restante combinado, ~8% tudo pendente.
// Futuro: ~30% já deram entrada (sinal).
const BASE = 'https://rsrpfwtrkpclscpccaok.supabase.co/rest/v1';
const KEY = process.env.SB_KEY, OWNER = process.env.OWNER;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
async function api(method, path, body) {
  const r = await fetch(`${BASE}/${path}`, { method, headers: H, body: body && JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}
let seed = 777;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const forma = () => { const r = rnd(); return r < .5 ? 'pix' : r < .7 ? 'credito' : r < .85 ? 'debito' : 'dinheiro'; };
const ymd = d => d.toISOString().slice(0, 10);
const addDias = (d, n) => new Date(d.getTime() + n * 864e5);
const redondo = v => Math.max(10, Math.round(v / 10) * 10);

await api('DELETE', `pagamentos?owner_id=eq.${OWNER}`);
const ags = await fetch(`${BASE}/agendamentos?select=id,inicio,fim,valor,status&owner_id=eq.${OWNER}&order=inicio&limit=2000`, { headers: H }).then(r => r.json());
const agora = new Date();
const pags = [], pagarAte = [];
for (const a of ags) {
  if (a.status === 'cancelado' || a.status === 'faltou') continue;
  const ini = new Date(a.inicio), fim = new Date(a.fim), valor = Number(a.valor);
  const passou = fim <= agora || a.status === 'concluido';
  if (passou) {
    const r = rnd();
    if (r < .80) pags.push({ agendamento_id: a.id, valor, forma: forma(), pago_em: fim.toISOString() });
    else if (r < .92) {
      const entrada = Math.min(valor - 10, redondo(valor * (.3 + rnd() * .2)));
      pags.push({ agendamento_id: a.id, valor: entrada, forma: forma(), pago_em: ini.toISOString() });
      const combinado = addDias(ini, 7 + Math.floor(rnd() * 14));
      // parte dos combinados já foi quitada
      if (combinado < agora && rnd() < .55) pags.push({ agendamento_id: a.id, valor: valor - entrada, forma: forma(), pago_em: combinado.toISOString() });
      else pagarAte.push([a.id, ymd(combinado)]);
    } else {
      pagarAte.push([a.id, ymd(addDias(ini, 10 + Math.floor(rnd() * 10)))]);
    }
  } else if (rnd() < .3) {
    pags.push({ agendamento_id: a.id, valor: Math.min(valor, redondo(valor * .3)), forma: 'pix', pago_em: addDias(ini, -2 - Math.floor(rnd() * 4)).toISOString() });
  }
}
const comDono = pags.map(p => ({ owner_id: OWNER, ...p, pago_em: new Date(Math.min(new Date(p.pago_em), agora)).toISOString() }));
for (let i = 0; i < comDono.length; i += 300) await api('POST', 'pagamentos', comDono.slice(i, i + 300));
for (const [id, d] of pagarAte) await api('PATCH', `agendamentos?id=eq.${id}`, { pagar_ate: d });
console.log(JSON.stringify({ pagamentos: comDono.length, com_data_combinada: pagarAte.length }));
