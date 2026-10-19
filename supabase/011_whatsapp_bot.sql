-- Robô do WhatsApp: o app põe mensagens na fila e o robô (no computador ou num servidor) envia.
-- O robô não usa a chave service_role: conversa com a função bot-whatsapp usando uma chave própria
-- guardada em config_privada ('bot_key:<owner_id>').

create table if not exists public.fila_whatsapp (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  telefone text not null check (telefone ~ '^\d{12,13}$'),
  texto text not null check (length(texto) between 1 and 2000),
  tipo text,
  agendamento_id uuid references public.agendamentos(id) on delete set null,
  status text not null default 'pendente' check (status in ('pendente','enviando','enviado','erro')),
  erro text,
  tentativas int not null default 0,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);
create index if not exists fila_whatsapp_pendentes on public.fila_whatsapp (owner_id, status, criado_em);
alter table public.fila_whatsapp enable row level security;
drop policy if exists fila_dono_ver on public.fila_whatsapp;
create policy fila_dono_ver on public.fila_whatsapp for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists fila_dono_inserir on public.fila_whatsapp;
create policy fila_dono_inserir on public.fila_whatsapp for insert to authenticated with check (owner_id = (select auth.uid()));

-- situação do robô (o app mostra "conectado / desligado")
create table if not exists public.whatsapp_bot (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  conectado boolean not null default false,
  numero text,
  visto_em timestamptz
);
alter table public.whatsapp_bot enable row level security;
drop policy if exists bot_dono_ver on public.whatsapp_bot;
create policy bot_dono_ver on public.whatsapp_bot for select to authenticated using (owner_id = (select auth.uid()));

-- liga/desliga o envio automático
alter table public.perfil add column if not exists whatsapp_auto boolean not null default false;
