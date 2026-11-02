-- A cliente é identificada pelo número, não pelo nome que ela digita no link.
-- Brasil: sempre 55 + DDD + 9 + 8 dígitos. O número antigo, sem o 9, é tratado como o mesmo.
-- Outro país: o link manda "+código número"; aceita de 8 a 15 dígitos, sem colocar 55.

-- 1) padroniza os celulares antigos já cadastrados (55 DDD 8 dígitos começando em 6-9 ganham o 9),
--    menos quando o número com 9 já existe em outra cliente: esses aparecem em Clientes → Revisar para juntar
update public.clientes c
   set telefone = substr(c.telefone, 1, 4) || '9' || substr(c.telefone, 5)
 where c.telefone ~ '^55[1-9][1-9][6-9][0-9]{7}$'
   and not exists (select 1 from public.clientes o
                    where o.owner_id = c.owner_id
                      and o.telefone = substr(c.telefone, 1, 4) || '9' || substr(c.telefone, 5));

create or replace function public.agendar_online(p_slug text, p_servico uuid, p_inicio timestamp with time zone, p_nome text, p_telefone text, p_obs text default null, p_cpf text default null, p_extras uuid[] default null)
 returns json language plpgsql security definer set search_path to 'public' as $function$
declare
  p perfil; s servicos; v_cli uuid; v_fim timestamptz; v_tel text; v_tel_velho text; v_local timestamp; h record; v_id uuid; v_cpf text;
  v_ids uuid[]; v_dur int := 0; v_int int := 0; v_valor numeric := 0; v_nomes text[] := '{}'; v_lista jsonb := '[]'; x servicos;
  v_nome_cli text; v_tel_cli text;
begin
  select * into p from perfil where slug = lower(p_slug) and agendamento_online;
  if not found then raise exception 'agenda_indisponivel'; end if;
  select * into s from servicos where id = p_servico and owner_id = p.owner_id and ativo;
  if not found then raise exception 'servico_invalido'; end if;
  v_ids := array(select u from unnest(array[p_servico] || coalesce(p_extras, '{}')) with ordinality as t(u, o)
                 group by u order by min(o));
  if array_length(v_ids, 1) > 6 then raise exception 'servico_invalido'; end if;
  foreach v_id in array v_ids loop
    select * into x from servicos where id = v_id and owner_id = p.owner_id and ativo;
    if not found then raise exception 'servico_invalido'; end if;
    v_dur := v_dur + x.duracao_min; v_int := greatest(v_int, x.intervalo_min);
    v_valor := v_valor + coalesce(x.preco_promo, x.preco); v_nomes := v_nomes || x.nome;
    v_lista := v_lista || jsonb_build_object('id', x.id, 'nome', x.nome, 'dur', x.duracao_min, 'preco', coalesce(x.preco_promo, x.preco));
  end loop;
  v_id := null;
  p_nome := trim(coalesce(p_nome, ''));
  v_tel := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  if trim(coalesce(p_telefone, '')) like '+%' and v_tel not like '55%' then
    -- outro país: código + número, como veio
    if length(v_tel) not between 8 and 15 then raise exception 'telefone_invalido'; end if;
  else
    if length(v_tel) between 10 and 11 then v_tel := '55' || v_tel; end if;
    -- celular antigo sem o 9: completa
    if v_tel ~ '^55[1-9][1-9][6-9][0-9]{7}$' then v_tel := substr(v_tel, 1, 4) || '9' || substr(v_tel, 5); end if;
    if v_tel !~ '^55[1-9][1-9]9[0-9]{8}$' then raise exception 'telefone_invalido'; end if;
    v_tel_velho := substr(v_tel, 1, 4) || substr(v_tel, 6);
  end if;
  if length(p_nome) < 2 or length(p_nome) > 80 then raise exception 'nome_invalido'; end if;
  if length(coalesce(p_obs, '')) > 300 then raise exception 'obs_grande'; end if;
  v_cpf := nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '');
  if v_cpf is not null and not cpf_valido(v_cpf) then raise exception 'cpf_invalido'; end if;
  if p_inicio < now() + make_interval(mins => p.antecedencia_min) then raise exception 'cedo_demais'; end if;
  if p_inicio > now() + make_interval(days => p.dias_frente) then raise exception 'longe_demais'; end if;
  v_fim := p_inicio + make_interval(mins => v_dur + v_int);
  v_local := p_inicio at time zone 'America/Sao_Paulo';
  select * into h from horario_do_dia(p.owner_id, extract(dow from v_local)::int);
  if h.abre is null or v_local::time < h.abre
     or (v_fim at time zone 'America/Sao_Paulo')::time > h.fecha
     or (v_fim at time zone 'America/Sao_Paulo')::date <> v_local::date then
    raise exception 'fora_do_horario';
  end if;
  if h.almoco_inicio is not null and v_local::time < h.almoco_fim
     and (v_fim at time zone 'America/Sao_Paulo')::time > h.almoco_inicio then
    raise exception 'fora_do_horario';
  end if;
  -- uma reserva por vez nesta agenda (evita duas clientes no mesmo horário ao mesmo tempo)
  perform pg_advisory_xact_lock(hashtext('agenda:' || p.owner_id::text));
  if exists (select 1 from bloqueios b where b.owner_id = p.owner_id and b.inicio < v_fim and b.fim > p_inicio)
     or exists (select 1 from agendamentos a where a.owner_id = p.owner_id and a.status <> all (array['cancelado', 'faltou'])
                and a.inicio < v_fim and a.fim > p_inicio) then
    raise exception 'ocupado';
  end if;
  -- acha a cliente pelo número (o com 9 primeiro, depois o antigo sem 9); o nome digitado não importa
  select id, nome, telefone into v_cli, v_nome_cli, v_tel_cli from clientes
   where owner_id = p.owner_id and telefone in (v_tel, coalesce(v_tel_velho, v_tel))
   order by (telefone = v_tel) desc limit 1;
  if v_cli is not null and (select count(*) from agendamentos a where a.cliente_id = v_cli and a.origem = 'online'
         and a.inicio > now() and a.status = 'agendado') >= 3 then
    raise exception 'limite';
  end if;
  if v_cli is null then
    insert into clientes (owner_id, nome, telefone, tipo, origem, cpf)
    values (p.owner_id, p_nome, v_tel, s.tipo, 'Outro', v_cpf) returning id, nome into v_cli, v_nome_cli;
  else
    update clientes set cpf = coalesce(cpf, v_cpf),
                        telefone = case when v_tel_cli <> v_tel then v_tel else telefone end
     where id = v_cli;
  end if;
  insert into agendamentos (owner_id, cliente_id, servico_id, servico_nome, tipo, inicio, fim, valor, origem, observacoes, servicos)
  values (p.owner_id, v_cli, s.id, left(array_to_string(v_nomes, ' + '), 200), s.tipo, p_inicio, v_fim, v_valor, 'online',
          nullif(trim(p_obs), ''), case when array_length(v_ids, 1) > 1 then v_lista end)
  returning id into v_id;
  insert into notificacoes (owner_id, icone, texto, agendamento_id)
  values (p.owner_id, '📅', v_nome_cli || ' agendou pelo link: ' || array_to_string(v_nomes, ' + ') || ' em ' ||
          to_char(v_local, 'DD/MM') || ' às ' || to_char(v_local, 'HH24:MI'), v_id);
  return json_build_object('ok', true, 'id', v_id);
end $function$;
