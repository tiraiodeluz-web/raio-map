-- As duas funções da base nacional rodavam as regras de acesso (RLS) linha a linha: ~7 s por página no mapa.
-- Agora conferem o acesso uma vez só (security definer + checagem no início) e leem direto.
alter policy estab_ler on public.estabelecimentos using ((select public.tem_acesso_ativo()));

create or replace function public.estabelecimentos_mapa(p_org uuid)
returns table(id bigint, nome text, lat double precision, lng double precision, confiabilidade text, categoria text, uf character, municipio_ibge integer, prospect_id uuid)
language plpgsql stable security definer set search_path to ''
as $$
begin
  if not public.eh_membro_ativo(p_org) then return; end if;
  return query
  select e.id, coalesce(nullif(e.nome_fantasia, ''), e.razao_social), e.lat, e.lng, e.confiabilidade, e.categoria, e.uf, e.municipio_ibge, p.id
  from public.estabelecimentos e
  left join public.prospects p on p.org_id = p_org and p.estabelecimento_id = e.id
  where e.lat is not null
    and not exists (select 1 from public.clientes c where c.org_id = p_org and c.documento = e.cnpj)
  order by e.id;
end $$;

create or replace function public.buscar_estabelecimentos(p_org uuid, p_uf text default null, p_municipio integer default null, p_q text default null, p_confiabilidade text default null, p_categoria text default null, p_ocultar_carteira boolean default true, p_limite integer default 50, p_offset integer default 0)
returns table(id bigint, cnpj text, razao_social text, nome_fantasia text, categoria text, confiabilidade text, cidade text, uf character, municipio_ibge integer, telefone text, email text, situacao_cadastral text, data_abertura date, lat double precision, lng double precision, ja_cliente boolean, prospect_id uuid, total bigint)
language plpgsql stable security definer set search_path to ''
as $$
declare d text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
begin
  if not public.eh_membro_ativo(p_org) then return; end if;
  return query
  with base as (
    select e.*, m.nome as cidade_nome,
      exists (select 1 from public.clientes c where c.org_id = p_org and c.documento = e.cnpj) as eh_cliente,
      p.id as pid
    from public.estabelecimentos e
    left join public.municipios m on m.ibge = e.municipio_ibge
    left join public.prospects p on p.org_id = p_org and p.estabelecimento_id = e.id
    where (p_uf is null or e.uf = p_uf)
      and (p_municipio is null or e.municipio_ibge = p_municipio)
      and (p_confiabilidade is null or e.confiabilidade = p_confiabilidade)
      and (p_categoria is null or e.categoria = p_categoria)
      and (p_q is null
           or (coalesce(e.nome_fantasia, '') || ' ' || coalesce(e.razao_social, '')) ilike '%' || p_q || '%'
           or (length(d) >= 4 and e.cnpj like d || '%'))
  )
  select b.id, b.cnpj, b.razao_social, b.nome_fantasia, b.categoria, b.confiabilidade, b.cidade_nome, b.uf, b.municipio_ibge,
         b.telefone, b.email, b.situacao_cadastral, b.data_abertura, b.lat, b.lng, b.eh_cliente, b.pid,
         count(*) over ()
  from base b
  where not (p_ocultar_carteira and (b.eh_cliente or b.pid is not null))
  order by case b.confiabilidade when 'alta' then 0 when 'media' then 1 else 2 end, b.uf, b.cidade_nome, b.nome_fantasia
  limit least(p_limite, 200) offset p_offset;
end $$;

revoke all on function public.estabelecimentos_mapa(uuid) from public, anon;
revoke all on function public.buscar_estabelecimentos(uuid, text, integer, text, text, text, boolean, integer, integer) from public, anon;
grant execute on function public.estabelecimentos_mapa(uuid) to authenticated;
grant execute on function public.buscar_estabelecimentos(uuid, text, integer, text, text, text, boolean, integer, integer) to authenticated;
