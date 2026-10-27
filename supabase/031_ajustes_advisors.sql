-- Ajustes do verificador do Supabase: índice repetido, search_path fixo nas funções de backup
-- e índice para o robô achar rápido as mensagens pendentes da fila.
drop index if exists public.agendamentos_owner_inicio_idx;
alter function backup_teste.importar_app_antigo() set search_path = public, backup_teste;
alter function backup_teste.desfazer_app_antigo() set search_path = public, backup_teste;
create index if not exists fila_whatsapp_pendente_idx on public.fila_whatsapp (owner_id, criado_em) where status in ('pendente','enviando');
