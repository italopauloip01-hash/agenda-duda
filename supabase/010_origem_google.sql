-- Agendamentos importados do Google Agenda pessoal (origem 'google')
alter table public.agendamentos drop constraint if exists agendamentos_origem_check;
alter table public.agendamentos add constraint agendamentos_origem_check
  check (origem in ('painel','whatsapp','online','google'));
