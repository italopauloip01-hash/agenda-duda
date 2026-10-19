-- Lembretes automáticos do robô (24h e 5h antes) e aviso de "pedido recebido" do link.
alter table public.agendamentos add column if not exists lembrete24_em timestamptz;
alter table public.agendamentos add column if not exists lembrete5_em timestamptz;

-- pedido feito pelo link: se o robô estiver ligado, a cliente recebe na hora "recebemos seu pedido"
create or replace function public.fila_pedido_online() returns trigger
language plpgsql security definer set search_path = public as $$
declare p perfil; tel text; nome text; txt text; quando text;
begin
  if new.origem <> 'online' then return new; end if;
  select * into p from perfil where owner_id = new.owner_id;
  if not coalesce(p.whatsapp_auto, false) then return new; end if;
  select telefone, split_part(nome, ' ', 1) into tel, nome from clientes where id = new.cliente_id;
  if tel is null then return new; end if;
  quando := to_char(new.inicio at time zone 'America/Sao_Paulo', 'DD/MM') || ' às ' ||
            to_char(new.inicio at time zone 'America/Sao_Paulo', 'HH24:MI');
  txt := coalesce(p.modelos->'textos'->>'pedido_recebido',
    'Oi {nome}! Recebemos seu pedido de {servico} para {dia} às {hora} 💖 Assim que for confirmado eu te aviso por aqui.');
  txt := replace(replace(replace(replace(replace(txt, '{nome}', coalesce(nome,'')), '{servico}', new.servico_nome),
           '{dia}', 'dia ' || to_char(new.inicio at time zone 'America/Sao_Paulo', 'DD/MM')),
           '{hora}', to_char(new.inicio at time zone 'America/Sao_Paulo', 'HH24:MI')), '{studio}', coalesce(p.nome, ''));
  insert into fila_whatsapp (owner_id, telefone, texto, tipo, agendamento_id)
  values (new.owner_id, tel, txt, 'pedido_recebido', new.id);
  return new;
end $$;
drop trigger if exists trg_fila_pedido_online on public.agendamentos;
create trigger trg_fila_pedido_online after insert on public.agendamentos
  for each row execute function public.fila_pedido_online();
