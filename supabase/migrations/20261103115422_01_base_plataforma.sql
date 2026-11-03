-- Clyvo Map · 01_base_plataforma
create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists http with schema extensions;

-- Referência: municípios (IBGE)
create table public.municipios (
  ibge integer primary key,
  nome text not null,
  uf char(2) not null,
  lat double precision not null,
  lng double precision not null,
  capital boolean not null default false
);
create index municipios_uf_idx on public.municipios (uf);

-- Plataforma: planos e administradores do dono da plataforma
create table public.planos (
  id text primary key,
  nome text not null,
  max_usuarios integer,          -- null = sem limite
  max_consultas_mes integer,
  max_exportacoes_mes integer,
  max_prospects integer,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
insert into public.planos (id, nome, max_usuarios, max_consultas_mes, max_exportacoes_mes, max_prospects) values
  ('interno', 'Interno', null, null, null, null),
  ('teste', 'Teste', 3, 500, 5, 1000);

create table public.admins_plataforma (
  user_id uuid primary key references auth.users on delete cascade,
  criado_em timestamptz not null default now()
);

-- Empresas (tenants)
create table public.organizacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) between 2 and 120),
  cnpj text,
  plano_id text not null default 'teste' references public.planos,
  assinatura_status text not null default 'sem_cobranca'
    check (assinatura_status in ('sem_cobranca','teste','ativa','inadimplente','cancelada')),
  gateway_cliente_id text,
  gateway_assinatura_id text,
  config jsonb not null default '{}'::jsonb,
  criado_por uuid references auth.users on delete set null,
  criado_em timestamptz not null default now()
);

create type public.papel_membro as enum ('dono','admin','vendedor','leitor');

create table public.membros (
  org_id uuid not null references public.organizacoes on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  papel public.papel_membro not null default 'vendedor',
  criado_em timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index membros_user_idx on public.membros (user_id);

create table public.convites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  papel public.papel_membro not null default 'vendedor' check (papel <> 'dono'),
  criado_por uuid references auth.users on delete set null,
  criado_em timestamptz not null default now(),
  aceito_em timestamptz,
  unique (org_id, email)
);

-- Funções auxiliares de acesso (usadas pelas políticas RLS)
create or replace function public.eh_membro(o uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membros m where m.org_id = o and m.user_id = auth.uid());
$$;

create or replace function public.papel_em(o uuid) returns public.papel_membro
language sql stable security definer set search_path = '' as $$
  select m.papel from public.membros m where m.org_id = o and m.user_id = auth.uid();
$$;

create or replace function public.pode_editar(o uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membros m where m.org_id = o and m.user_id = auth.uid()
                 and m.papel in ('dono','admin','vendedor'));
$$;

create or replace function public.eh_admin_org(o uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membros m where m.org_id = o and m.user_id = auth.uid()
                 and m.papel in ('dono','admin'));
$$;

create or replace function public.eh_admin_plataforma() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins_plataforma a where a.user_id = auth.uid());
$$;
