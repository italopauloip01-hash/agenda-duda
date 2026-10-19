-- Foto ilustrativa e descrição curta em cada serviço (aparecem no link das clientes);
-- categorias do portfólio livres (iguais às categorias de serviço).
alter table public.servicos add column if not exists foto text;
alter table public.servicos add column if not exists descricao text check (descricao is null or length(descricao) <= 300);
alter table public.portfolio_fotos drop constraint if exists portfolio_fotos_categoria_check;
alter table public.portfolio_fotos add constraint portfolio_fotos_categoria_check check (length(trim(categoria)) between 2 and 30);

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
    'fotos', coalesce((select json_agg(json_build_object('caminho', f.caminho, 'categoria', f.categoria, 'legenda', f.legenda))
        from (select * from portfolio_fotos where owner_id = p.owner_id order by criado_em desc limit 60) f), '[]'::json),
    'avaliacoes', coalesce((select json_agg(json_build_object('nome', split_part(a.nome,' ',1), 'nota', a.nota, 'comentario', a.comentario))
        from (select * from avaliacoes where owner_id = p.owner_id and publicada and nota >= 4 order by criado_em desc limit 6) a), '[]'::json)
  ) into r;
  return r;
end $function$;
