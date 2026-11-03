-- Dados agregados da empresa para o Clyvo AI (só a função de servidor, com chave de serviço, executa).
create or replace function public.ia_contexto(p_org uuid, p_dias integer) returns jsonb
language sql stable security definer set search_path = '' as $$
select jsonb_build_object(
  'regra_inativo_dias', p_dias,
  'clientes_total', (select count(*) from public.clientes where org_id = p_org),
  'clientes_ativos', (select count(*) from public.clientes where org_id = p_org and ultima_compra >= current_date - p_dias),
  'clientes_inativos', (select count(*) from public.clientes where org_id = p_org and ultima_compra < current_date - p_dias),
  'clientes_sem_data_de_compra', (select count(*) from public.clientes where org_id = p_org and ultima_compra is null),
  'clientes_por_uf_top10', coalesce((select jsonb_agg(jsonb_build_object('uf', uf, 'clientes', n)) from (
     select uf, count(*) n from public.clientes where org_id = p_org and uf is not null group by uf order by n desc limit 10) t), '[]'),
  'inativos_por_cidade_top10', coalesce((select jsonb_agg(jsonb_build_object('cidade', cidade, 'uf', uf, 'inativos', n)) from (
     select cidade, uf, count(*) n from public.clientes where org_id = p_org and ultima_compra < current_date - p_dias and cidade is not null group by cidade, uf order by n desc limit 10) t), '[]'),
  'maiores_tempos_sem_comprar_top10', coalesce((select jsonb_agg(jsonb_build_object('cliente', nome, 'cidade', cidade, 'uf', uf, 'ultima_compra', ultima_compra)) from (
     select nome, cidade, uf, ultima_compra from public.clientes where org_id = p_org and ultima_compra is not null order by ultima_compra asc limit 10) t), '[]'),
  'prospects_total', (select count(*) from public.prospects where org_id = p_org),
  'prospects_por_situacao', coalesce((select jsonb_object_agg(situacao, n) from (
     select situacao::text, count(*) n from public.prospects where org_id = p_org group by situacao) t), '{}'),
  'prospects_por_cidade_top10', coalesce((select jsonb_agg(jsonb_build_object('cidade', cidade, 'uf', uf, 'prospects', n, 'convertidos', conv)) from (
     select cidade, uf, count(*) n, count(*) filter (where situacao = 'convertido') conv from public.prospects where org_id = p_org and cidade is not null group by cidade, uf order by n desc limit 10) t), '[]'),
  'melhores_prospects_ainda_sem_contato_top10', coalesce((select jsonb_agg(jsonb_build_object('nome', nome, 'cidade', cidade, 'uf', uf, 'nota', nota)) from (
     select nome, cidade, uf, nota from public.prospects where org_id = p_org and situacao in ('novo_prospect','nao_abordado') and nota is not null order by nota desc limit 10) t), '[]'),
  'contatos_ultimos_30_dias', (select count(*) from public.interacoes where org_id = p_org and data >= now() - interval '30 days'),
  'equipe_ultimos_30_dias', coalesce((select jsonb_agg(jsonb_build_object('vendedor', email, 'contatos', c, 'convertidos', v)) from (
     select u.email, count(*) c, count(distinct i.prospect_id) filter (where i.situacao_nova = 'convertido') v
     from public.interacoes i join auth.users u on u.id = i.user_id
     where i.org_id = p_org and i.data >= now() - interval '30 days' group by u.email order by c desc limit 15) t), '[]')
)
$$;
revoke all on function public.ia_contexto(uuid, integer) from public, anon, authenticated;
grant execute on function public.ia_contexto(uuid, integer) to service_role;

-- Créditos: cada pergunta custa 1 crédito; a empresa recebe créditos iniciais na primeira pergunta.
create or replace function public.ia_debitar(p_org uuid, p_inicial integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare s integer;
begin
  insert into public.ia_creditos (org_id, saldo) values (p_org, p_inicial) on conflict (org_id) do nothing;
  update public.ia_creditos set saldo = saldo - 1, atualizado_em = now() where org_id = p_org and saldo >= 1 returning saldo into s;
  return s; -- null = sem créditos
end $$;
create or replace function public.ia_devolver(p_org uuid) returns void
language sql security definer set search_path = '' as $$
  update public.ia_creditos set saldo = saldo + 1, atualizado_em = now() where org_id = p_org
$$;
revoke all on function public.ia_debitar(uuid, integer) from public, anon, authenticated;
revoke all on function public.ia_devolver(uuid) from public, anon, authenticated;
grant execute on function public.ia_debitar(uuid, integer) to service_role;
grant execute on function public.ia_devolver(uuid) to service_role;
