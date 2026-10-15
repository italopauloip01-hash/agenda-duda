-- ============================================================
-- Agenda da Duda — schema inicial
-- Rodar no Supabase: SQL Editor → New query → colar tudo → Run
-- Cada linha pertence a quem está logado (owner_id = auth.uid()).
-- O bot (n8n / Evolution API) usa a service_role no servidor e
-- informa owner_id explicitamente.
-- ============================================================

create extension if not exists btree_gist;

-- ── CLIENTES ────────────────────────────────────────────────
create table if not exists public.clientes (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users on delete cascade,
  nome          text not null,
  telefone      text,                      -- só dígitos, ex: 5531999990001
  nascimento    date,
  tipo          text not null default 'esmalteria'
                check (tipo in ('esmalteria','podologia','ambos')),
  origem        text check (origem in ('WhatsApp','Indicação','Instagram','Google','Outro')),
  preferencias  text,
  observacoes   text,
  vip           boolean not null default false,
  cor           text not null default '#C2637A',
  criado_em     timestamptz not null default now(),
  unique (owner_id, telefone)
);

-- ── SERVIÇOS ────────────────────────────────────────────────
create table if not exists public.servicos (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users on delete cascade,
  nome          text not null,
  tipo          text not null check (tipo in ('esmalteria','podologia')),
  duracao_min   int  not null check (duracao_min > 0),
  intervalo_min int  not null default 0 check (intervalo_min >= 0),
  preco         numeric(10,2) not null check (preco >= 0),
  preco_promo   numeric(10,2) check (preco_promo >= 0),
  cor           text not null default '#C2637A',
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

-- ── AGENDAMENTOS ────────────────────────────────────────────
create table if not exists public.agendamentos (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users on delete cascade,
  cliente_id    uuid not null references public.clientes on delete restrict,
  servico_id    uuid references public.servicos on delete set null,
  servico_nome  text not null,             -- cópia, para o histórico não mudar
  tipo          text not null check (tipo in ('esmalteria','podologia')),
  inicio        timestamptz not null,
  fim           timestamptz not null,
  status        text not null default 'agendado'
                check (status in ('agendado','confirmado','em_atendimento','concluido','cancelado','faltou')),
  valor         numeric(10,2) not null default 0,
  local         text not null default 'Studio' check (local in ('Studio','Domicílio')),
  observacoes   text,
  origem        text not null default 'painel' check (origem in ('painel','whatsapp')),
  lembrete_enviado_em timestamptz,
  criado_em     timestamptz not null default now(),
  check (fim > inicio),
  -- impede dois horários sobrepostos (ignora cancelados/faltas)
  exclude using gist (
    owner_id with =,
    tstzrange(inicio, fim) with &&
  ) where (status not in ('cancelado','faltou'))
);
create index if not exists agendamentos_owner_inicio on public.agendamentos (owner_id, inicio);

-- ── BLOQUEIOS E FOLGAS ──────────────────────────────────────
create table if not exists public.bloqueios (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users on delete cascade,
  tipo          text not null check (tipo in ('bloqueio','folga')),
  inicio        timestamptz not null,
  fim           timestamptz not null,
  motivo        text,
  check (fim > inicio)
);
create index if not exists bloqueios_owner_inicio on public.bloqueios (owner_id, inicio);

-- ── HORÁRIO DE FUNCIONAMENTO ────────────────────────────────
create table if not exists public.horarios (
  owner_id      uuid not null default auth.uid() references auth.users on delete cascade,
  dia_semana    smallint not null check (dia_semana between 0 and 6),  -- 0 = domingo
  abre          time,
  fecha         time,
  almoco_inicio time,
  almoco_fim    time,
  primary key (owner_id, dia_semana)
);

-- ── ESTOQUE ─────────────────────────────────────────────────
create table if not exists public.produtos (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users on delete cascade,
  nome          text not null,
  categoria     text not null default 'Outros',
  quantidade    numeric(10,2) not null default 0,
  minimo        numeric(10,2) not null default 0,
  custo         numeric(10,2) not null default 0,
  criado_em     timestamptz not null default now()
);

-- ── DESPESAS ────────────────────────────────────────────────
create table if not exists public.despesas (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users on delete cascade,
  descricao     text not null,
  categoria     text not null default 'Outros',
  valor         numeric(10,2) not null check (valor >= 0),
  data          date not null default current_date,
  criado_em     timestamptz not null default now()
);
create index if not exists despesas_owner_data on public.despesas (owner_id, data);

-- ── AVALIAÇÕES ──────────────────────────────────────────────
create table if not exists public.avaliacoes (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users on delete cascade,
  cliente_id     uuid references public.clientes on delete set null,
  agendamento_id uuid references public.agendamentos on delete set null,
  nome           text not null,
  nota           smallint not null check (nota between 1 and 5),
  comentario     text,
  publicada      boolean not null default false,
  criado_em      timestamptz not null default now()
);

-- ── NOTIFICAÇÕES ────────────────────────────────────────────
create table if not exists public.notificacoes (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users on delete cascade,
  icone         text not null default '🔔',
  texto         text not null,
  lida          boolean not null default false,
  criado_em     timestamptz not null default now()
);

-- ── PORTFÓLIO ───────────────────────────────────────────────
create table if not exists public.portfolio_fotos (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users on delete cascade,
  categoria     text not null
                check (categoria in ('gel','acrilico','esmaltacao','nailart','podologia','tratamentos')),
  caminho       text not null,             -- caminho no bucket 'portfolio'
  legenda       text,
  tags          text[] not null default '{}',
  criado_em     timestamptz not null default now()
);

-- ── VIEW: clientes com estatísticas (visitas, faltas, última) ──
create or replace view public.clientes_resumo with (security_invoker = true) as
select c.*,
  count(a.id) filter (where a.status = 'concluido')  as visitas,
  count(a.id) filter (where a.status = 'faltou')     as faltas,
  max(a.inicio) filter (where a.status = 'concluido') as ultima_visita
from public.clientes c
left join public.agendamentos a on a.cliente_id = c.id
group by c.id;

-- ── RLS: cada usuário só vê o que é seu ─────────────────────
do $$
declare t text;
begin
  foreach t in array array['clientes','servicos','agendamentos','bloqueios','horarios',
                           'produtos','despesas','avaliacoes','notificacoes','portfolio_fotos']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "dono" on public.%I', t);
    execute format(
      'create policy "dono" on public.%I for all to authenticated
         using (owner_id = (select auth.uid()))
         with check (owner_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ── Acesso pela API (projetos novos não liberam sozinhos) ──
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Avisa a API que há tabelas novas
notify pgrst, 'reload schema';

-- Conferência: deve listar 11 linhas
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('clientes','servicos','agendamentos','bloqueios','horarios','produtos',
                     'despesas','avaliacoes','notificacoes','portfolio_fotos','clientes_resumo')
order by table_name;

-- Storage (fotos do portfólio) fica em 002_storage.sql
