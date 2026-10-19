-- Corrige o aviso "pedido recebido": a variável "nome" conflitava com a coluna clientes.nome
-- e o agendamento pelo link falhava. Agora o aviso nunca impede o agendamento.
create or replace function public.fila_pedido_online() returns trigger
language plpgsql security definer set search_path = public as $$
declare p perfil; v_tel text; v_nome text; v_txt text;
begin
  if new.origem <> 'online' then return new; end if;
  select * into p from perfil where owner_id = new.owner_id;
  if not coalesce(p.whatsapp_auto, false) then return new; end if;
  select c.telefone, split_part(c.nome, ' ', 1) into v_tel, v_nome from clientes c where c.id = new.cliente_id;
  if v_tel is null then return new; end if;
  v_txt := coalesce(p.modelos->'textos'->>'pedido_recebido',
    'Oi {nome}! Recebemos seu pedido de {servico} para {dia} às {hora} 💖 Assim que for confirmado eu te aviso por aqui.');
  v_txt := replace(replace(replace(replace(replace(v_txt, '{nome}', coalesce(v_nome,'')), '{servico}', new.servico_nome),
           '{dia}', 'dia ' || to_char(new.inicio at time zone 'America/Sao_Paulo', 'DD/MM')),
           '{hora}', to_char(new.inicio at time zone 'America/Sao_Paulo', 'HH24:MI')), '{studio}', coalesce(p.nome, ''));
  begin
    insert into fila_whatsapp (owner_id, telefone, texto, tipo, agendamento_id)
    values (new.owner_id, v_tel, v_txt, 'pedido_recebido', new.id);
  exception when others then
    raise warning 'fila_pedido_online: %', sqlerrm; -- o aviso nunca pode impedir o agendamento
  end;
  return new;
end $$;
