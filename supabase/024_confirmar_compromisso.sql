-- "Confirme seu compromisso": quando a profissional marca um horário, a cliente recebe um link
-- (confirmar.html?t=<código do atendimento>) para confirmar ou cancelar. Usa o mesmo código da avaliação.
alter table public.perfil add column if not exists endereco text check (endereco is null or length(endereco) <= 200);

create or replace function public.dados_compromisso(p_token uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'studio', coalesce(p.nome, 'Studio'), 'foto_capa', p.foto_capa, 'whatsapp', p.whatsapp, 'endereco', p.endereco,
    'slug', case when p.agendamento_online then p.slug end,
    'servico', a.servico_nome, 'valor', a.valor, 'inicio', a.inicio, 'fim', a.fim, 'status', a.status,
    'nome', split_part(c.nome, ' ', 1), 'passou', a.inicio < now())
  from agendamentos a join clientes c on c.id = a.cliente_id left join perfil p on p.owner_id = a.owner_id
  where a.avaliacao_token = p_token;
$$;

create or replace function public.responder_compromisso(p_token uuid, p_acao text) returns json
language plpgsql security definer set search_path = public as $$
declare a record; v_nome text; v_quando text;
begin
  if p_acao not in ('confirmar', 'cancelar') then raise exception 'acao_invalida'; end if;
  select ag.*, c.nome as cli_nome into a from agendamentos ag join clientes c on c.id = ag.cliente_id where ag.avaliacao_token = p_token;
  if not found then raise exception 'link_invalido'; end if;
  if a.inicio < now() then raise exception 'ja_passou'; end if;
  if a.status not in ('agendado', 'confirmado') then raise exception 'nao_ativo'; end if;
  v_nome := split_part(a.cli_nome, ' ', 1);
  v_quando := to_char(a.inicio at time zone 'America/Sao_Paulo', 'DD/MM') || ' às ' || to_char(a.inicio at time zone 'America/Sao_Paulo', 'HH24:MI');
  if p_acao = 'confirmar' then
    if a.status = 'confirmado' then return json_build_object('ok', true, 'status', 'confirmado'); end if;
    update agendamentos set status = 'confirmado' where id = a.id;
    insert into notificacoes (owner_id, icone, texto, agendamento_id)
    values (a.owner_id, '✅', v_nome || ' confirmou o horário: ' || a.servico_nome || ' em ' || v_quando, a.id);
    return json_build_object('ok', true, 'status', 'confirmado');
  else
    update agendamentos set status = 'cancelado' where id = a.id;
    insert into notificacoes (owner_id, icone, texto, agendamento_id)
    values (a.owner_id, '❌', v_nome || ' cancelou o horário pelo link: ' || a.servico_nome || ' em ' || v_quando || ' (horário liberado)', a.id);
    return json_build_object('ok', true, 'status', 'cancelado');
  end if;
end $$;
grant execute on function public.dados_compromisso(uuid) to anon, authenticated;
grant execute on function public.responder_compromisso(uuid, text) to anon, authenticated;
