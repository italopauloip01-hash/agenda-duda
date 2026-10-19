-- Tempo dos lembretes automáticos do robô (horas antes do horário; 0 = desligado)
alter table public.perfil add column if not exists lembrete1_h int not null default 24 check (lembrete1_h between 0 and 72);
alter table public.perfil add column if not exists lembrete2_h int not null default 5 check (lembrete2_h between 0 and 72);
