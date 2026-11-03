create table public.colunas_funil (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 1 and 40),
  ordem integer not null default 0,
  cor text check (cor is null or cor ~ '^#[0-9a-fA-F]{6}$'),
  criado_em timestamptz not null default now()
);
create index colunas_funil_org_idx on public.colunas_funil (org_id, ordem);
alter table public.colunas_funil enable row level security;
create policy colunas_ler on public.colunas_funil for select to authenticated using (public.eh_membro(org_id));
create policy colunas_inserir on public.colunas_funil for insert to authenticated with check (public.pode_editar(org_id));
create policy colunas_editar on public.colunas_funil for update to authenticated using (public.pode_editar(org_id)) with check (public.pode_editar(org_id));
create policy colunas_apagar on public.colunas_funil for delete to authenticated using (public.pode_editar(org_id));

alter table public.prospects add column coluna_id uuid references public.colunas_funil on delete set null;
create index prospects_coluna_idx on public.prospects (org_id, coluna_id);
