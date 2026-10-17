-- ============================================================
-- Agenda da Duda — integração com Google (contatos e agenda)
-- ============================================================

-- Refresh token do Google de cada usuária. O painel só grava;
-- quem lê é a função google-token (service role). Ninguém lê pela API.
create table if not exists public.google_conexao (
  owner_id      uuid primary key default auth.uid() references auth.users on delete cascade,
  refresh_token text not null,
  email_google  text,
  calendario_id text,                 -- id do calendário "Agenda da Duda" criado no Google
  contatos_sync_em timestamptz,
  atualizado_em timestamptz not null default now()
);
alter table public.google_conexao enable row level security;
drop policy if exists "dono grava" on public.google_conexao;
create policy "dono grava" on public.google_conexao for insert to authenticated
  with check (owner_id = (select auth.uid()));
drop policy if exists "dono atualiza" on public.google_conexao;
create policy "dono atualiza" on public.google_conexao for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "dono apaga" on public.google_conexao;
create policy "dono apaga" on public.google_conexao for delete to authenticated
  using (owner_id = (select auth.uid()));
revoke all on public.google_conexao from anon, authenticated;
grant insert, update, delete on public.google_conexao to authenticated;
-- o painel precisa saber se está conectado (sem ver o token)
grant select (owner_id, email_google, calendario_id, contatos_sync_em, atualizado_em) on public.google_conexao to authenticated;
drop policy if exists "dono vê status" on public.google_conexao;
create policy "dono vê status" on public.google_conexao for select to authenticated
  using (owner_id = (select auth.uid()));

-- Credenciais do app no Google (client id/secret). Só a service role lê.
create table if not exists public.config_privada (
  chave text primary key,
  valor text not null
);
alter table public.config_privada enable row level security;
revoke all on public.config_privada from anon, authenticated;

-- Vínculos com o Google
alter table public.agendamentos add column if not exists google_event_id text;
alter table public.clientes     add column if not exists google_resource text;
create unique index if not exists clientes_google_resource on public.clientes (owner_id, google_resource) where google_resource is not null;

notify pgrst, 'reload schema';
