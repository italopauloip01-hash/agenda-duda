-- Categorias de serviço livres: além das 4 padrão (esmalteria, podologia, sobrancelha,
-- maquiagem), a profissional pode criar outras (ex.: "Cílios"). O próprio nome vira o tipo.
alter table public.servicos drop constraint if exists servicos_tipo_check;
alter table public.servicos add constraint servicos_tipo_check check (length(trim(tipo)) between 2 and 30);

alter table public.agendamentos drop constraint if exists agendamentos_tipo_check;
alter table public.agendamentos add constraint agendamentos_tipo_check check (length(trim(tipo)) between 2 and 30);

alter table public.clientes drop constraint if exists clientes_tipo_check;
alter table public.clientes add constraint clientes_tipo_check check (length(trim(tipo)) between 2 and 30);
