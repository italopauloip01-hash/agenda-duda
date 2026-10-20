-- Reforço de segurança antes da divulgação
-- 1) Freio contra robôs/spam no link público: no máximo 8 pedidos online a cada 10 min
--    e 25 por hora por studio (o agendar_online já limita 3 pendentes por telefone).
create or replace function public.freio_agendamento_online() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.origem = 'online' then
    if (select count(*) from agendamentos where owner_id = new.owner_id and origem = 'online' and criado_em > now() - interval '10 minutes') >= 8
       or (select count(*) from agendamentos where owner_id = new.owner_id and origem = 'online' and criado_em > now() - interval '1 hour') >= 25 then
      raise exception 'limite';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.freio_agendamento_online() from public, anon, authenticated;
drop trigger if exists freio_agendamento_online on public.agendamentos;
create trigger freio_agendamento_online before insert on public.agendamentos
  for each row execute function public.freio_agendamento_online();

-- 2) O token do Google (refresh_token) nunca é lido pelo navegador: só as funções do servidor leem.
revoke select on public.google_conexao from anon, authenticated;
grant select (owner_id, email_google, calendario_id, contatos_sync_em, atualizado_em) on public.google_conexao to authenticated;

-- 3) Nome de categoria sem caracteres de código (< > " ' ` \) — ela aparece no link público.
alter table public.servicos drop constraint if exists servicos_tipo_seguro;
alter table public.servicos add constraint servicos_tipo_seguro check (tipo !~ '[<>"''`\\]' and length(tipo) <= 40);

-- 4) Fotos: só imagens e até 10 MB (impede subir páginas/arquivos perigosos no espaço público)
update storage.buckets set file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif']
where id = 'portfolio';
