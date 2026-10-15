-- ============================================================
-- Agenda da Duda — bucket das fotos do portfólio
-- Rodar DEPOIS do 001_schema.sql, numa query separada.
-- Público para leitura (fotos aparecem no painel e no bot);
-- só a dona envia/apaga, dentro da pasta com o próprio id.
--
-- Se as policies derem "must be owner of table objects", crie pelo
-- painel: Storage → portfolio → Policies → New policy, com as
-- mesmas condições abaixo.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('portfolio', 'portfolio', true)
on conflict (id) do nothing;

create policy "portfolio: dona envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'portfolio' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "portfolio: dona apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'portfolio' and (storage.foldername(name))[1] = (select auth.uid())::text);
