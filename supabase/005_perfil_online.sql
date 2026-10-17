-- ============================================================
-- Agenda da Duda — perfil, horários e agendamento online público
-- ============================================================

-- Perfil do studio (um por usuária)
create table if not exists public.perfil (
  owner_id          uuid primary key default auth.uid() references auth.users on delete cascade,
  nome              text,
  whatsapp          text,
  bio               text,
  slug              text unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  agendamento_online boolean not null default false,
  antecedencia_min  int not null default 120 check (antecedencia_min >= 0),
  dias_frente       int not null default 30 check (dias_frente between 1 and 120),
  modelos           jsonb not null default '{}'::jsonb,
  atualizado_em     timestamptz not null default now()
);
alter table public.perfil enable row level security;
drop policy if exists "dono" on public.perfil;
create policy "dono" on public.perfil for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.perfil to authenticated;

-- agendamentos feitos pelo link público
alter table public.agendamentos drop constraint if exists agendamentos_origem_check;
alter table public.agendamentos add constraint agendamentos_origem_check
  check (origem in ('painel','whatsapp','online'));

-- Horário de um dia da semana (padrão: seg–sex 8–18, sáb 8–13, dom fechado, almoço 12–13)
create or replace function public.horario_do_dia(p_owner uuid, p_dow int)
returns table (abre time, fecha time, almoco_inicio time, almoco_fim time)
language sql stable security definer set search_path = public as $$
  select h.abre, h.fecha, h.almoco_inicio, h.almoco_fim
    from horarios h where h.owner_id = p_owner and h.dia_semana = p_dow
  union all
  select case when p_dow = 0 then null else time '08:00' end,
         case when p_dow = 0 then null when p_dow = 6 then time '13:00' else time '18:00' end,
         case when p_dow = 6 then null else time '12:00' end,
         case when p_dow = 6 then null else time '13:00' end
   where not exists (select 1 from horarios h where h.owner_id = p_owner and h.dia_semana = p_dow)
  limit 1;
$$;
revoke all on function public.horario_do_dia(uuid,int) from public, anon, authenticated;

-- Dados públicos da página de agendamento
create or replace function public.agenda_publica(p_slug text)
returns json language plpgsql stable security definer set search_path = public as $$
declare p perfil; r json;
begin
  select * into p from perfil where slug = lower(p_slug) and agendamento_online;
  if not found then return null; end if;
  select json_build_object(
    'nome', coalesce(p.nome, 'Agenda'), 'bio', p.bio, 'whatsapp', p.whatsapp,
    'antecedencia_min', p.antecedencia_min, 'dias_frente', p.dias_frente,
    'servicos', coalesce((select json_agg(json_build_object('id', s.id, 'nome', s.nome, 'tipo', s.tipo,
        'duracao_min', s.duracao_min, 'intervalo_min', s.intervalo_min, 'preco', coalesce(s.preco_promo, s.preco))
        order by s.tipo, s.nome) from servicos s where s.owner_id = p.owner_id and s.ativo), '[]'::json),
    'horarios', (select json_agg(json_build_object('dia', d, 'abre', h.abre, 'fecha', h.fecha,
        'almoco_inicio', h.almoco_inicio, 'almoco_fim', h.almoco_fim) order by d)
        from generate_series(0,6) d, lateral horario_do_dia(p.owner_id, d) h)
  ) into r;
  return r;
end $$;

-- Intervalos ocupados de um dia (sem nomes nem detalhes)
create or replace function public.horarios_ocupados(p_slug text, p_dia date)
returns json language plpgsql stable security definer set search_path = public as $$
declare v_owner uuid; v_ini timestamptz; v_fim timestamptz;
begin
  select owner_id into v_owner from perfil where slug = lower(p_slug) and agendamento_online;
  if v_owner is null then return '[]'::json; end if;
  v_ini := (p_dia::timestamp) at time zone 'America/Sao_Paulo';
  v_fim := v_ini + interval '1 day';
  return coalesce((select json_agg(json_build_array(x.i, x.f)) from (
      select a.inicio i, a.fim f from agendamentos a
       where a.owner_id = v_owner and a.status not in ('cancelado','faltou') and a.inicio < v_fim and a.fim > v_ini
      union all
      select b.inicio, b.fim from bloqueios b where b.owner_id = v_owner and b.inicio < v_fim and b.fim > v_ini
    ) x), '[]'::json);
end $$;

-- Cria o agendamento vindo do link público (valida tudo no servidor)
create or replace function public.agendar_online(p_slug text, p_servico uuid, p_inicio timestamptz,
                                                 p_nome text, p_telefone text, p_obs text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  p perfil; s servicos; v_cli uuid; v_fim timestamptz; v_tel text; v_local timestamp; h record; v_id uuid;
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

  -- no máximo 3 horários futuros pelo link por telefone
  if (select count(*) from agendamentos a join clientes c on c.id = a.cliente_id
       where a.owner_id = p.owner_id and c.telefone = v_tel and a.origem = 'online'
         and a.inicio > now() and a.status not in ('cancelado','faltou')) >= 3 then
    raise exception 'limite';
  end if;

  select id into v_cli from clientes where owner_id = p.owner_id and telefone = v_tel;
  if v_cli is null then
    insert into clientes (owner_id, nome, telefone, tipo, origem)
    values (p.owner_id, p_nome, v_tel, s.tipo, 'Outro') returning id into v_cli;
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
end $$;

grant execute on function public.agenda_publica(text) to anon, authenticated;
grant execute on function public.horarios_ocupados(text, date) to anon, authenticated;
grant execute on function public.agendar_online(text, uuid, timestamptz, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
