-- CPF da cliente (para emissão de nota fiscal / NFS-e). Opcional; guardado só com os 11 dígitos.

create or replace function public.cpf_valido(p text) returns boolean
language plpgsql immutable set search_path = public as $$
declare d int[]; s int; r1 int; r2 int;
begin
  if p is null or p !~ '^\d{11}$' or p ~ '^(\d)\1{10}$' then return false; end if;
  d := (select array_agg(substr(p, i, 1)::int order by i) from generate_series(1, 11) i);
  s := 0; for i in 1..9 loop s := s + d[i] * (11 - i); end loop;
  r1 := (s * 10) % 11; if r1 = 10 then r1 := 0; end if;
  s := 0; for i in 1..10 loop s := s + d[i] * (12 - i); end loop;
  r2 := (s * 10) % 11; if r2 = 10 then r2 := 0; end if;
  return r1 = d[10] and r2 = d[11];
end $$;

alter table public.clientes add column if not exists cpf text;
alter table public.clientes drop constraint if exists clientes_cpf_valido;
alter table public.clientes add constraint clientes_cpf_valido check (cpf is null or public.cpf_valido(cpf));

-- agendamento pelo link: aceita CPF opcional (grava na cliente se ela ainda não tiver)
drop function if exists public.agendar_online(text, uuid, timestamptz, text, text, text);
create or replace function public.agendar_online(p_slug text, p_servico uuid, p_inicio timestamptz, p_nome text,
  p_telefone text, p_obs text default null, p_cpf text default null)
returns json language plpgsql security definer set search_path = public as $function$
declare
  p perfil; s servicos; v_cli uuid; v_fim timestamptz; v_tel text; v_local timestamp; h record; v_id uuid; v_cpf text;
begin
  select * into p from perfil where slug = lower(p_slug) and agendamento_online;
  if not found then raise exception 'agenda_indisponivel'; end if;
  select * into s from servicos where id = p_servico and owner_id = p.owner_id and ativo;
  if not found then raise exception 'servico_invalido'; end if;

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

  v_fim := p_inicio + make_interval(mins => s.duracao_min + s.intervalo_min);
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
    insert into agendamentos (owner_id, cliente_id, servico_id, servico_nome, tipo, inicio, fim, valor, origem, observacoes)
    values (p.owner_id, v_cli, s.id, s.nome, s.tipo, p_inicio, v_fim, coalesce(s.preco_promo, s.preco), 'online', nullif(trim(p_obs), ''))
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'ocupado';
  end;

  insert into notificacoes (owner_id, icone, texto)
  values (p.owner_id, '📅', p_nome || ' agendou pelo link: ' || s.nome || ' em ' ||
          to_char(v_local, 'DD/MM') || ' às ' || to_char(v_local, 'HH24:MI'));

  return json_build_object('ok', true, 'id', v_id);
end $function$;

grant execute on function public.agendar_online(text, uuid, timestamptz, text, text, text, text) to anon, authenticated;
