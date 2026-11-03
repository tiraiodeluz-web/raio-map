create table public.integracoes (
  org_id uuid not null references public.organizacoes on delete cascade,
  tipo text not null check (tipo in ('bate_papo')),
  webhook_url text not null check (webhook_url ~ '^https://'),
  segredo text not null default encode(gen_random_bytes(18), 'hex'),
  atualizado_em timestamptz not null default now(),
  primary key (org_id, tipo)
);
alter table public.integracoes enable row level security;
create policy integracoes_ler on public.integracoes for select to authenticated using (public.eh_admin_org(org_id));
create policy integracoes_inserir on public.integracoes for insert to authenticated with check (public.eh_admin_org(org_id));
create policy integracoes_editar on public.integracoes for update to authenticated using (public.eh_admin_org(org_id)) with check (public.eh_admin_org(org_id));
create policy integracoes_apagar on public.integracoes for delete to authenticated using (public.eh_admin_org(org_id));

alter table public.prospects add column chat_enviado_em timestamptz;

create or replace function public.bate_papo_conectado(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.eh_membro(p_org) and exists (select 1 from public.integracoes where org_id = p_org and tipo = 'bate_papo');
$$;
revoke all on function public.bate_papo_conectado(uuid) from public, anon;
grant execute on function public.bate_papo_conectado(uuid) to authenticated;
