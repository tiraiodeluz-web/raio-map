-- Recursos dos planos pagos validados no banco + estruturas de IA, concorrência, rotas e relatório semanal.

create or replace function public.recurso_pago(o uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.eh_membro(o) and exists (
    select 1 from public.organizacoes where id = o and plano_id <> 'teste')
$$;
revoke all on function public.recurso_pago(uuid) from public, anon;
grant execute on function public.recurso_pago(uuid) to authenticated;

-- ===== Clyvo AI =====
create table public.ia_creditos (
  org_id uuid primary key references public.organizacoes(id) on delete cascade,
  saldo integer not null default 0 check (saldo >= 0),
  atualizado_em timestamptz not null default now()
);
create table public.ia_perguntas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  user_id uuid not null,
  pergunta text not null,
  resposta text,
  tokens_entrada integer default 0,
  tokens_saida integer default 0,
  creditos integer not null default 1,
  erro text,
  criado_em timestamptz not null default now()
);
create index on public.ia_perguntas (org_id, criado_em desc);
alter table public.ia_creditos enable row level security;
alter table public.ia_perguntas enable row level security;
create policy ia_creditos_ler on public.ia_creditos for select to authenticated using ((select public.recurso_pago(org_id)));
create policy ia_perguntas_ler on public.ia_perguntas for select to authenticated
  using ((select public.recurso_pago(org_id)) and (user_id = (select auth.uid()) or (select public.eh_admin_org(org_id))));

-- ===== Concorrência =====
create table public.conc_categorias (
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  chave text not null,
  rotulo text not null,
  cor text not null default '#64748b',
  ativa boolean not null default true,
  primary key (org_id, chave)
);
create table public.conc_classificacoes (
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  estabelecimento_id bigint not null references public.estabelecimentos(id) on delete cascade,
  categoria text not null,
  observacao text,
  evidencia text,
  por uuid,
  atualizado_em timestamptz not null default now(),
  primary key (org_id, estabelecimento_id)
);
alter table public.conc_categorias enable row level security;
alter table public.conc_classificacoes enable row level security;
create policy conc_cat_ler on public.conc_categorias for select to authenticated using ((select public.recurso_pago(org_id)));
create policy conc_cat_esc on public.conc_categorias for all to authenticated
  using ((select public.recurso_pago(org_id)) and (select public.eh_admin_org(org_id)))
  with check ((select public.recurso_pago(org_id)) and (select public.eh_admin_org(org_id)));
create policy conc_cls_ler on public.conc_classificacoes for select to authenticated using ((select public.recurso_pago(org_id)));
create policy conc_cls_esc on public.conc_classificacoes for all to authenticated
  using ((select public.recurso_pago(org_id)) and (select public.pode_editar(org_id)))
  with check ((select public.recurso_pago(org_id)) and (select public.pode_editar(org_id)));

-- ===== Rotas =====
create table public.rotas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  nome text not null,
  criado_por uuid,
  criado_em timestamptz not null default now()
);
create table public.rota_paradas (
  id uuid primary key default gen_random_uuid(),
  rota_id uuid not null references public.rotas(id) on delete cascade,
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  tipo text not null check (tipo in ('cliente','prospect')),
  ref_id uuid not null,
  nome text not null,
  endereco text,
  lat double precision not null,
  lng double precision not null,
  ordem integer not null,
  visitado_em timestamptz,
  visitado_por uuid,
  observacao text
);
create index on public.rota_paradas (rota_id, ordem);
alter table public.rotas enable row level security;
alter table public.rota_paradas enable row level security;
create policy rotas_ler on public.rotas for select to authenticated using ((select public.recurso_pago(org_id)));
create policy rotas_esc on public.rotas for all to authenticated
  using ((select public.recurso_pago(org_id)) and (select public.pode_editar(org_id)))
  with check ((select public.recurso_pago(org_id)) and (select public.pode_editar(org_id)));
create policy paradas_ler on public.rota_paradas for select to authenticated using ((select public.recurso_pago(org_id)));
create policy paradas_esc on public.rota_paradas for all to authenticated
  using ((select public.recurso_pago(org_id)) and (select public.pode_editar(org_id)))
  with check ((select public.recurso_pago(org_id)) and (select public.pode_editar(org_id)));

-- ===== Relatório semanal =====
create table public.relatorio_config (
  org_id uuid primary key references public.organizacoes(id) on delete cascade,
  ativo boolean not null default false,
  dia_semana smallint not null default 1 check (dia_semana between 0 and 6),
  hora smallint not null default 8 check (hora between 0 and 23),
  destinatarios text[] not null default '{}',
  atualizado_em timestamptz not null default now()
);
create table public.relatorios_semanais (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  semana_inicio date not null,
  dados jsonb not null,
  gerado_em timestamptz not null default now(),
  enviado_em timestamptz,
  unique (org_id, semana_inicio)
);
alter table public.relatorio_config enable row level security;
alter table public.relatorios_semanais enable row level security;
create policy relcfg_ler on public.relatorio_config for select to authenticated using ((select public.eh_admin_org(org_id)));
create policy relcfg_esc on public.relatorio_config for all to authenticated
  using ((select public.eh_admin_org(org_id))) with check ((select public.eh_admin_org(org_id)));
create policy relsem_ler on public.relatorios_semanais for select to authenticated using ((select public.eh_membro(org_id)));

-- Cálculo (interno): semana = [ini, ini+7 dias). Só usa dados reais da empresa.
create or replace function public.relatorio_calcular(p_org uuid, p_ini date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a timestamptz := p_ini::timestamptz; b timestamptz := (p_ini + 7)::timestamptz; pa timestamptz := (p_ini - 7)::timestamptz;
        r jsonb;
begin
  r := jsonb_build_object(
    'semana_inicio', p_ini, 'semana_fim', p_ini + 6,
    'novos_clientes', jsonb_build_object(
      'atual', (select count(*) from public.clientes where org_id = p_org and criado_em >= a and criado_em < b),
      'anterior', (select count(*) from public.clientes where org_id = p_org and criado_em >= pa and criado_em < a)),
    'novos_prospects', jsonb_build_object(
      'atual', (select count(*) from public.prospects where org_id = p_org and criado_em >= a and criado_em < b),
      'anterior', (select count(*) from public.prospects where org_id = p_org and criado_em >= pa and criado_em < a)),
    'contatos', jsonb_build_object(
      'atual', (select count(*) from public.interacoes where org_id = p_org and data >= a and data < b),
      'anterior', (select count(*) from public.interacoes where org_id = p_org and data >= pa and data < a)),
    'convertidos', jsonb_build_object(
      'atual', (select count(distinct prospect_id) from public.interacoes where org_id = p_org and situacao_nova = 'convertido' and data >= a and data < b),
      'anterior', (select count(distinct prospect_id) from public.interacoes where org_id = p_org and situacao_nova = 'convertido' and data >= pa and data < a)),
    'compras_registradas', jsonb_build_object(
      'atual', (select count(*) from public.clientes where org_id = p_org and ultima_compra >= p_ini and ultima_compra < p_ini + 7),
      'anterior', (select count(*) from public.clientes where org_id = p_org and ultima_compra >= p_ini - 7 and ultima_compra < p_ini)),
    'oportunidades_abertas', (select count(*) from public.prospects where org_id = p_org and situacao in ('em_contato','interessado','negociacao')),
    'cidades', coalesce((select jsonb_agg(x order by (x->>'total')::int desc) from (
        select jsonb_build_object('cidade', cidade, 'uf', uf, 'total', count(*)) x from (
          select cidade, uf from public.prospects where org_id = p_org and criado_em >= a and criado_em < b and cidade is not null
          union all select cidade, uf from public.clientes where org_id = p_org and criado_em >= a and criado_em < b and cidade is not null
          union all select p.cidade, p.uf from public.interacoes i join public.prospects p on p.id = i.prospect_id where i.org_id = p_org and i.data >= a and i.data < b and p.cidade is not null
        ) t group by cidade, uf order by count(*) desc limit 5) z), '[]'::jsonb),
    'vendedores', coalesce((select jsonb_agg(x order by (x->>'contatos')::int desc) from (
        select jsonb_build_object('email', u.email, 'contatos', count(*),
               'convertidos', count(distinct i.prospect_id) filter (where i.situacao_nova = 'convertido')) x
        from public.interacoes i join auth.users u on u.id = i.user_id
        where i.org_id = p_org and i.data >= a and i.data < b group by u.email) z), '[]'::jsonb)
  );
  return r;
end $$;
revoke all on function public.relatorio_calcular(uuid, date) from public, anon, authenticated;

-- Gera (ou devolve) o relatório da semana; nunca duplica.
create or replace function public.gerar_relatorio_semanal(p_org uuid, p_ini date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d jsonb;
begin
  if not public.recurso_pago(p_org) then raise exception 'O relatório semanal faz parte dos planos pagos.'; end if;
  if p_ini is null or extract(dow from p_ini) <> 1 then p_ini := date_trunc('week', now() at time zone 'America/Sao_Paulo')::date - 7; end if;
  d := public.relatorio_calcular(p_org, p_ini);
  insert into public.relatorios_semanais (org_id, semana_inicio, dados) values (p_org, p_ini, d)
    on conflict (org_id, semana_inicio) do update set dados = excluded.dados, gerado_em = now();
  return d;
end $$;
revoke all on function public.gerar_relatorio_semanal(uuid, date) from public, anon;
grant execute on function public.gerar_relatorio_semanal(uuid, date) to authenticated;
