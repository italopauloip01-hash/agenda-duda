-- Vários serviços no mesmo horário (ex.: Pé e mão + Desencravar unha).
-- O agendamento guarda o 1º serviço em servico_id, o nome de todos em servico_nome ("A + B"),
-- a soma de tempo e valor, e a lista completa em servicos (jsonb).
alter table public.agendamentos add column if not exists servicos jsonb;

drop function if exists public.agendar_online(text, uuid, timestamptz, text, text, text, text);
create or replace function public.agendar_online(p_slug text, p_servico uuid, p_inicio timestamptz, p_nome text,
  p_telefone text, p_obs text default null, p_cpf text default null, p_extras uuid[] default null)
returns json language plpgsql security definer set search_path = public as $function$
declare
  p perfil; s servicos; v_cli uuid; v_fim timestamptz; v_tel text; v_local timestamp; h record; v_id uuid; v_cpf text;
  v_ids uuid[]; v_dur int := 0; v_int int := 0; v_valor numeric := 0; v_nomes text[] := '{}'; v_lista jsonb := '[]'; x servicos;
begin
  select * into p from perfil where slug = lower(p_slug) and agendamento_online;
  if not found then raise exception 'agenda_indisponivel'; end if;
  select * into s from servicos where id = p_servico and owner_id = p.owner_id and ativo;
  if not found then raise exception 'servico_invalido'; end if;

  -- serviço principal + extras (sem repetir, no máximo 6 no total)
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
  if length(v_tel) between 10 and 11 then v_tel := '55' || v_tel; end if;
  if length(p_nome) < 2 or length(p_nome) > 80 then raise exception 'nome_invalido'; end if;
  if length(v_tel) not between 12 and 13 then raise exception 'telefone_invalido'; end if;
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
  if exists (select 1 from bloqueios b where b.owner_id = p.owner_id and b.inicio < v_fim and b.fim > p_inicio) then
    raise exception 'ocupado';
  end if;

  if (select count(*) from agendamentos a join clientes c on c.id = a.cliente_id
       where a.owner_id = p.owner_id and c.telefone = v_tel and a.origem = 'online'
         and a.inicio > now() and a.status not in ('cancelado','faltou')) >= 3 then
    raise exception 'limite';
  end if;

  select id into v_cli from clientes where owner_id = p.owner_id and telefone = v_tel;
  if v_cli is null then
    insert into clientes (owner_id, nome, telefone, tipo, origem, cpf)
    values (p.owner_id, p_nome, v_tel, s.tipo, 'Outro', v_cpf) returning id into v_cli;
  elsif v_cpf is not null then
    update clientes set cpf = v_cpf where id = v_cli and cpf is null;
  end if;

  begin
    insert into agendamentos (owner_id, cliente_id, servico_id, servico_nome, tipo, inicio, fim, valor, origem, observacoes, servicos)
    values (p.owner_id, v_cli, s.id, left(array_to_string(v_nomes, ' + '), 200), s.tipo, p_inicio, v_fim, v_valor, 'online',
            nullif(trim(p_obs), ''), case when array_length(v_ids, 1) > 1 then v_lista end)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'ocupado';
  end;

  insert into notificacoes (owner_id, icone, texto)
  values (p.owner_id, '📅', p_nome || ' agendou pelo link: ' || array_to_string(v_nomes, ' + ') || ' em ' ||
          to_char(v_local, 'DD/MM') || ' às ' || to_char(v_local, 'HH24:MI'));

  return json_build_object('ok', true, 'id', v_id);
end $function$;

grant execute on function public.agendar_online(text, uuid, timestamptz, text, text, text, text, uuid[]) to anon, authenticated;
