-- A busca por texto também comparava o CNPJ com os dígitos do texto; sem dígitos virava "like '%'" e trazia tudo.
create or replace function public.buscar_estabelecimentos(p_org uuid, p_uf text default null, p_municipio integer default null, p_q text default null, p_confiabilidade text default null, p_categoria text default null, p_ocultar_carteira boolean default true, p_limite integer default 50, p_offset integer default 0)
returns table(id bigint, cnpj text, razao_social text, nome_fantasia text, categoria text, confiabilidade text, cidade text, uf character, municipio_ibge integer, telefone text, email text, situacao_cadastral text, data_abertura date, lat double precision, lng double precision, ja_cliente boolean, prospect_id uuid, total bigint)
language sql stable set search_path to ''
as $function$
  with dig as (select regexp_replace(coalesce(p_q, ''), '\D', '', 'g') as d),
  base as (
    select e.*, m.nome as cidade_nome,
      exists (select 1 from public.clientes c where c.org_id = p_org and c.documento = e.cnpj) as eh_cliente,
      (select p.id from public.prospects p where p.org_id = p_org and p.estabelecimento_id = e.id) as pid
    from public.estabelecimentos e
    cross join dig
    left join public.municipios m on m.ibge = e.municipio_ibge
    where public.eh_membro_ativo(p_org)
      and (p_uf is null or e.uf = p_uf)
      and (p_municipio is null or e.municipio_ibge = p_municipio)
      and (p_confiabilidade is null or e.confiabilidade = p_confiabilidade)
      and (p_categoria is null or e.categoria = p_categoria)
      and (p_q is null
           or (coalesce(e.nome_fantasia, '') || ' ' || coalesce(e.razao_social, '')) ilike '%' || p_q || '%'
           or (length(dig.d) >= 4 and e.cnpj like dig.d || '%'))
  )
  select b.id, b.cnpj, b.razao_social, b.nome_fantasia, b.categoria, b.confiabilidade, b.cidade_nome, b.uf, b.municipio_ibge,
         b.telefone, b.email, b.situacao_cadastral, b.data_abertura, b.lat, b.lng, b.eh_cliente, b.pid,
         count(*) over () as total
  from base b
  where not (p_ocultar_carteira and (b.eh_cliente or b.pid is not null))
  order by case b.confiabilidade when 'alta' then 0 when 'media' then 1 else 2 end, b.uf, b.cidade_nome, b.nome_fantasia
  limit least(p_limite, 200) offset p_offset;
$function$;
