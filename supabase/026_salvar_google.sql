-- O app grava a conexão com o Google por aqui (o navegador não lê mais o refresh_token: ver 025)
create or replace function public.salvar_conexao_google(p_refresh text, p_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login'; end if;
  if p_refresh is null or length(p_refresh) > 2000 then raise exception 'token_invalido'; end if;
  insert into google_conexao (owner_id, refresh_token, email_google, atualizado_em)
  values (auth.uid(), p_refresh, left(p_email, 200), now())
  on conflict (owner_id) do update set refresh_token = excluded.refresh_token, email_google = excluded.email_google, atualizado_em = now();
end $$;
revoke execute on function public.salvar_conexao_google(text, text) from public, anon;
grant execute on function public.salvar_conexao_google(text, text) to authenticated;
