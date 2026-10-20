-- Ordem das fotos do portfólio (a 1ª é o destaque grande no link das clientes)
alter table public.portfolio_fotos add column if not exists ordem int;
create index if not exists portfolio_fotos_ordem_idx on public.portfolio_fotos (owner_id, ordem);

-- fotos no link seguem a ordem escolhida
create or replace function public.agenda_publica(p_slug text)
 returns json language plpgsql stable security definer set search_path to 'public' as $function$
declare p perfil; r json;
begin
  select * into p from perfil where slug = lower(p_slug) and agendamento_online;
  if not found then return null; end if;
  select json_build_object(
    'nome', coalesce(p.nome, 'Agenda'), 'bio', p.bio, 'whatsapp', p.whatsapp, 'foto_capa', p.foto_capa,
    'antecedencia_min', p.antecedencia_min, 'dias_frente', p.dias_frente,
    'servicos', coalesce((select json_agg(json_build_object('id', s.id, 'nome', s.nome, 'tipo', s.tipo,
        'duracao_min', s.duracao_min, 'intervalo_min', s.intervalo_min, 'preco', coalesce(s.preco_promo, s.preco),
        'foto', s.foto, 'descricao', s.descricao)
        order by s.tipo, s.nome) from servicos s where s.owner_id = p.owner_id and s.ativo), '[]'::json),
    'horarios', (select json_agg(json_build_object('dia', d, 'abre', h.abre, 'fecha', h.fecha,
        'almoco_inicio', h.almoco_inicio, 'almoco_fim', h.almoco_fim) order by d)
        from generate_series(0,6) d, lateral horario_do_dia(p.owner_id, d) h),
    'fotos', coalesce((select json_agg(json_build_object('caminho', f.caminho, 'categoria', f.categoria, 'legenda', f.legenda) order by f.ordem nulls last, f.criado_em desc)
        from (select * from portfolio_fotos where owner_id = p.owner_id order by ordem nulls last, criado_em desc limit 60) f), '[]'::json),
    'avaliacoes', coalesce((select json_agg(json_build_object('nome', split_part(a.nome,' ',1), 'nota', a.nota, 'comentario', a.comentario))
        from (select * from avaliacoes where owner_id = p.owner_id and publicada and nota >= 4 order by criado_em desc limit 6) a), '[]'::json)
  ) into r;
  return r;
end $function$;
