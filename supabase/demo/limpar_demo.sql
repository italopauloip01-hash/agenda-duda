-- ============================================================
-- Apaga os dados de demonstração de UMA conta (mantém os serviços).
-- Troque o e-mail abaixo se precisar. Rodar no SQL Editor do Supabase.
-- Atenção: apaga TUDO dessa conta nessas tabelas, inclusive o que
-- tiver sido cadastrado de verdade depois da demonstração.
-- ============================================================
do $$
declare dono uuid := (select id from auth.users where email = 'italo.pauloip01@gmail.com');
begin
  delete from public.avaliacoes      where owner_id = dono;
  delete from public.agendamentos    where owner_id = dono;
  delete from public.notificacoes    where owner_id = dono;
  delete from public.bloqueios       where owner_id = dono;
  delete from public.produtos        where owner_id = dono;
  delete from public.despesas        where owner_id = dono;
  delete from public.portfolio_fotos where owner_id = dono;
  delete from public.clientes        where owner_id = dono;
end $$;
