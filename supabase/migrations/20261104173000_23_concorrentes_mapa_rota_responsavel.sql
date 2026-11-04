alter table public.rotas add column if not exists responsavel_id uuid;

create or replace function public.concorrentes_mapa(p_org uuid)
returns table(id bigint, nome text, lat double precision, lng double precision, categoria text, uf text, observacao text)
language sql stable security definer set search_path = '' as $$
  select e.id, coalesce(e.nome_fantasia, e.razao_social)::text, e.lat, e.lng, c.categoria, e.uf::text, c.observacao
  from public.conc_classificacoes c join public.estabelecimentos e on e.id = c.estabelecimento_id
  where c.org_id = p_org and public.recurso_pago(p_org) and e.lat is not null and e.lng is not null
  limit 5000
$$;
revoke all on function public.concorrentes_mapa(uuid) from public, anon;
grant execute on function public.concorrentes_mapa(uuid) to authenticated;
