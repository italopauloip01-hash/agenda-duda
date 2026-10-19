-- Corrige: a lista de clientes não trazia o CPF (a view foi criada antes do campo) — o CPF salvo
-- não aparecia no app ao reabrir. Também traz google_resource. Mantém security_invoker (respeita o RLS).
create or replace view public.clientes_resumo with (security_invoker = true) as
select c.id, c.owner_id, c.nome, c.telefone, c.nascimento, c.tipo, c.origem, c.preferencias, c.observacoes,
       c.vip, c.cor, c.criado_em,
       count(a.id) filter (where a.status = 'concluido') as visitas,
       count(a.id) filter (where a.status = 'faltou') as faltas,
       max(a.inicio) filter (where a.status = 'concluido') as ultima_visita,
       c.cpf, c.google_resource
from public.clientes c
left join public.agendamentos a on a.cliente_id = c.id
group by c.id;

-- Índices para as consultas do app (avisos do Supabase: chaves estrangeiras sem índice)
create index if not exists agendamentos_cliente_idx on public.agendamentos (cliente_id);
create index if not exists agendamentos_servico_idx on public.agendamentos (servico_id);
create index if not exists agendamentos_owner_inicio_idx on public.agendamentos (owner_id, inicio);
create index if not exists avaliacoes_owner_idx on public.avaliacoes (owner_id, criado_em desc);
create index if not exists avaliacoes_cliente_idx on public.avaliacoes (cliente_id);
create index if not exists fila_whatsapp_agendamento_idx on public.fila_whatsapp (agendamento_id);
create index if not exists notificacoes_owner_idx on public.notificacoes (owner_id, criado_em desc);
create index if not exists notificacoes_agendamento_idx on public.notificacoes (agendamento_id);
create index if not exists portfolio_fotos_owner_idx on public.portfolio_fotos (owner_id);
create index if not exists produtos_owner_idx on public.produtos (owner_id);
create index if not exists push_inscricoes_owner_idx on public.push_inscricoes (owner_id);
create index if not exists servicos_owner_idx on public.servicos (owner_id);
create index if not exists clientes_owner_telefone_idx on public.clientes (owner_id, telefone);
