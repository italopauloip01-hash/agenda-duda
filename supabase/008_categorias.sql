-- Novas categorias de serviço: sobrancelha e maquiagem (além de esmalteria e podologia)
alter table public.servicos drop constraint if exists servicos_tipo_check;
alter table public.servicos add constraint servicos_tipo_check
  check (tipo in ('esmalteria','podologia','sobrancelha','maquiagem'));

alter table public.agendamentos drop constraint if exists agendamentos_tipo_check;
alter table public.agendamentos add constraint agendamentos_tipo_check
  check (tipo in ('esmalteria','podologia','sobrancelha','maquiagem'));

-- a cliente herda o tipo do primeiro serviço (agendamento pelo link ou pelo painel)
alter table public.clientes drop constraint if exists clientes_tipo_check;
alter table public.clientes add constraint clientes_tipo_check
  check (tipo in ('esmalteria','podologia','ambos','sobrancelha','maquiagem'));
