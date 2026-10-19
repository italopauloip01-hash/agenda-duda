-- Notificação no celular mesmo com o app fechado (Web Push).
-- As chaves VAPID ficam em config_privada (vapid_public / vapid_private) — NÃO versionar a privada.
-- Gere com: npx web-push generate-vapid-keys  e insira:
--   insert into config_privada (chave, valor) values ('vapid_public','...'),('vapid_private','...')
--   on conflict (chave) do update set valor = excluded.valor;
create extension if not exists pg_net;

create table if not exists public.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  aparelho text,
  criado_em timestamptz not null default now()
);
alter table public.push_inscricoes enable row level security;
drop policy if exists push_dono on public.push_inscricoes;
create policy push_dono on public.push_inscricoes for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

insert into public.config_privada (chave, valor) values ('push_hook_key', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (chave) do nothing;

-- nova notificação → pede à função push-notificar que avise os celulares da dona
create or replace function public.disparar_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_key text;
begin
  if not exists (select 1 from push_inscricoes where owner_id = new.owner_id) then return new; end if;
  select valor into v_key from config_privada where chave = 'push_hook_key';
  perform net.http_post(
    url := 'https://rsrpfwtrkpclscpccaok.supabase.co/functions/v1/push-notificar',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-key', v_key),
    body := jsonb_build_object('notificacao_id', new.id));
  return new;
exception when others then
  raise warning 'disparar_push: %', sqlerrm; -- o push nunca pode atrapalhar o agendamento
  return new;
end $$;
revoke execute on function public.disparar_push() from public, anon, authenticated;
drop trigger if exists trg_disparar_push on public.notificacoes;
create trigger trg_disparar_push after insert on public.notificacoes
  for each row execute function public.disparar_push();
