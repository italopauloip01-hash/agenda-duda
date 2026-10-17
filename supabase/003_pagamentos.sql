-- ============================================================
-- Agenda da Duda — pagamentos dos atendimentos
-- Um agendamento pode ter vários pagamentos (entrada + restante).
-- Situação: pago (soma >= valor), parcial (0 < soma < valor), pendente (0).
-- ============================================================

create table if not exists public.pagamentos (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users on delete cascade,
  agendamento_id uuid not null references public.agendamentos on delete cascade,
  valor          numeric(10,2) not null check (valor > 0),
  forma          text not null default 'pix'
                 check (forma in ('pix','dinheiro','credito','debito','outro')),
  pago_em        timestamptz not null default now(),
  observacao     text,
  criado_em      timestamptz not null default now()
);
create index if not exists pagamentos_owner_pago_em on public.pagamentos (owner_id, pago_em);
create index if not exists pagamentos_agendamento on public.pagamentos (agendamento_id);

-- data combinada para pagar o que falta (opcional)
alter table public.agendamentos add column if not exists pagar_ate date;

alter table public.pagamentos enable row level security;
drop policy if exists "dono" on public.pagamentos;
create policy "dono" on public.pagamentos for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

grant select, insert, update, delete on public.pagamentos to authenticated;
notify pgrst, 'reload schema';

select 'pagamentos' as tabela, count(*) from public.pagamentos;
