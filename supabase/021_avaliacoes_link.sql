-- Avaliação pelo link: cada atendimento tem um código; a cliente abre avaliar.html?t=<código>,
-- dá de 1 a 5 estrelas e comenta. 4 e 5 estrelas já aparecem no site (a profissional pode tirar).
alter table public.agendamentos add column if not exists avaliacao_token uuid not null default gen_random_uuid();
alter table public.agendamentos add column if not exists avaliacao_pedida_em timestamptz;
create unique index if not exists agendamentos_avaliacao_token on public.agendamentos (avaliacao_token);
create unique index if not exists avaliacoes_um_por_atendimento on public.avaliacoes (agendamento_id) where agendamento_id is not null;

-- dados para a página de avaliação (só do atendimento daquele código)
create or replace function public.dados_avaliacao(p_token uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'studio', coalesce(p.nome, 'Studio'), 'foto_capa', p.foto_capa, 'slug', case when p.agendamento_online then p.slug end,
    'servico', a.servico_nome, 'nome', split_part(c.nome, ' ', 1),
    'dia', to_char(a.inicio at time zone 'America/Sao_Paulo', 'DD/MM'),
    'ja_avaliou', exists (select 1 from avaliacoes v where v.agendamento_id = a.id))
  from agendamentos a join clientes c on c.id = a.cliente_id left join perfil p on p.owner_id = a.owner_id
  where a.avaliacao_token = p_token and a.status = 'concluido';
$$;

create or replace function public.avaliar(p_token uuid, p_nota int, p_comentario text default null) returns json
language plpgsql security definer set search_path = public as $$
declare a record; v_nome text;
begin
  if p_nota is null or p_nota not between 1 and 5 then raise exception 'nota_invalida'; end if;
  if length(coalesce(p_comentario, '')) > 500 then raise exception 'comentario_grande'; end if;
  select ag.*, c.nome as cli_nome into a from agendamentos ag join clientes c on c.id = ag.cliente_id
   where ag.avaliacao_token = p_token and ag.status = 'concluido';
  if not found then raise exception 'link_invalido'; end if;
  if exists (select 1 from avaliacoes where agendamento_id = a.id) then raise exception 'ja_avaliou'; end if;
  v_nome := split_part(a.cli_nome, ' ', 1);
  insert into avaliacoes (owner_id, cliente_id, agendamento_id, nome, nota, comentario, publicada)
  values (a.owner_id, a.cliente_id, a.id, a.cli_nome, p_nota, nullif(trim(p_comentario), ''), p_nota >= 4);
  insert into notificacoes (owner_id, icone, texto, agendamento_id)
  values (a.owner_id, '⭐', v_nome || ' avaliou o atendimento: ' || repeat('★', p_nota) ||
          case when p_nota >= 4 then ' (já está no site)' else ' (só você vê)' end, a.id);
  return json_build_object('ok', true);
end $$;
grant execute on function public.dados_avaliacao(uuid) to anon, authenticated;
grant execute on function public.avaliar(uuid, int, text) to anon, authenticated;
