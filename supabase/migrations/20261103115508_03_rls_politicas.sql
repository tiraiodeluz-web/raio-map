-- RAIO MAP · 03_rls_politicas
-- Liga RLS em todas as tabelas
alter table public.municipios enable row level security;
alter table public.planos enable row level security;
alter table public.admins_plataforma enable row level security;
alter table public.organizacoes enable row level security;
alter table public.membros enable row level security;
alter table public.convites enable row level security;
alter table public.estabelecimentos enable row level security;
alter table public.estabelecimento_fontes enable row level security;
alter table public.importacoes enable row level security;
alter table public.clientes enable row level security;
alter table public.prospects enable row level security;
alter table public.interacoes enable row level security;
alter table public.uso_mensal enable row level security;
alter table public.auditoria enable row level security;

-- Visitantes sem login não acessam nada
revoke all on all tables in schema public from anon;

-- Referência e camada pública: leitura para quem está logado; ninguém grava pela API
create policy municipios_ler on public.municipios for select to authenticated using (true);
create policy planos_ler on public.planos for select to authenticated using (true);
create policy estab_ler on public.estabelecimentos for select to authenticated using (true);
create policy estab_fontes_ler on public.estabelecimento_fontes for select to authenticated using (true);
create policy admins_ler_proprio on public.admins_plataforma for select to authenticated using (user_id = auth.uid());

-- Empresas
create policy org_ler on public.organizacoes for select to authenticated
  using (public.eh_membro(id) or public.eh_admin_plataforma());
create policy org_editar on public.organizacoes for update to authenticated
  using (public.eh_admin_org(id)) with check (public.eh_admin_org(id));
revoke update on public.organizacoes from authenticated;
grant update (nome, cnpj, config) on public.organizacoes to authenticated;

-- Membros: leitura para membros; alterações só pelas funções
create policy membros_ler on public.membros for select to authenticated using (public.eh_membro(org_id));

-- Convites
create policy convites_ler on public.convites for select to authenticated using (public.eh_admin_org(org_id));
create policy convites_apagar on public.convites for delete to authenticated using (public.eh_admin_org(org_id));

-- Clientes
create policy clientes_ler on public.clientes for select to authenticated using (public.eh_membro(org_id));
create policy clientes_inserir on public.clientes for insert to authenticated with check (public.pode_editar(org_id));
create policy clientes_editar on public.clientes for update to authenticated
  using (public.pode_editar(org_id)) with check (public.pode_editar(org_id));
create policy clientes_apagar on public.clientes for delete to authenticated using (public.eh_admin_org(org_id));

-- Prospects
create policy prospects_ler on public.prospects for select to authenticated using (public.eh_membro(org_id));
create policy prospects_inserir on public.prospects for insert to authenticated with check (public.pode_editar(org_id));
create policy prospects_editar on public.prospects for update to authenticated
  using (public.pode_editar(org_id)) with check (public.pode_editar(org_id));
create policy prospects_apagar on public.prospects for delete to authenticated using (public.eh_admin_org(org_id));

-- Interações (histórico de abordagem)
create policy interacoes_ler on public.interacoes for select to authenticated using (public.eh_membro(org_id));
create policy interacoes_inserir on public.interacoes for insert to authenticated
  with check (public.pode_editar(org_id) and user_id = auth.uid());
create policy interacoes_editar on public.interacoes for update to authenticated
  using (user_id = auth.uid() or public.eh_admin_org(org_id))
  with check (public.pode_editar(org_id));
create policy interacoes_apagar on public.interacoes for delete to authenticated
  using (user_id = auth.uid() or public.eh_admin_org(org_id));

-- Importações, uso e auditoria
create policy importacoes_ler on public.importacoes for select to authenticated using (public.eh_membro(org_id));
create policy importacoes_inserir on public.importacoes for insert to authenticated
  with check (public.pode_editar(org_id) and user_id = auth.uid());
create policy importacoes_editar on public.importacoes for update to authenticated
  using (user_id = auth.uid() and public.pode_editar(org_id)) with check (public.pode_editar(org_id));
create policy uso_ler on public.uso_mensal for select to authenticated using (public.eh_membro(org_id));
create policy auditoria_ler on public.auditoria for select to authenticated using (public.eh_admin_org(org_id));
