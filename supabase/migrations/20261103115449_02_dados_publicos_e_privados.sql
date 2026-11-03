-- Clyvo Map · 02_dados_publicos_e_privados
-- ===== Camada pública: estabelecimentos (gravada só pela ingestão, com service role) =====
create table public.estabelecimentos (
  id bigint generated always as identity primary key,
  cnpj text unique,
  razao_social text,
  nome_fantasia text,
  cnae_principal text,
  cnaes_secundarios text[],
  logradouro text, numero text, complemento text, bairro text, cep text,
  municipio_ibge integer references public.municipios,
  uf char(2),
  lat double precision, lng double precision,
  precisao_geo text check (precisao_geo in ('endereco','cep','municipio')),
  geom extensions.geography(point, 4326) generated always as (
    case when lat is not null and lng is not null
      then extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography end) stored,
  telefone text, email text, site text, instagram text,
  situacao_cadastral text,
  data_abertura date,
  categoria text,
  confiabilidade text check (confiabilidade in ('alta','media','baixa')),
  criterio_inclusao text,
  fonte_principal text not null,
  atualizado_em timestamptz not null default now()
);
create index estabelecimentos_uf_idx on public.estabelecimentos (uf);
create index estabelecimentos_mun_idx on public.estabelecimentos (municipio_ibge);
create index estabelecimentos_geom_idx on public.estabelecimentos using gist (geom);

create table public.estabelecimento_fontes (
  id bigint generated always as identity primary key,
  estabelecimento_id bigint not null references public.estabelecimentos on delete cascade,
  fonte text not null,            -- receita | google_places | site | manual
  referencia text,                -- ex.: place_id, URL, nome do arquivo da Receita
  dados jsonb,
  confiabilidade text check (confiabilidade in ('alta','media','baixa')),
  coletado_em timestamptz not null default now()
);
create index estab_fontes_estab_idx on public.estabelecimento_fontes (estabelecimento_id);

-- ===== Camada privada (por empresa) =====
create table public.importacoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes on delete cascade,
  tipo text not null check (tipo in ('clientes','prospects')),
  arquivo text,
  linhas_total integer not null default 0,
  linhas_ok integer not null default 0,
  linhas_erro integer not null default 0,
  erros jsonb,
  user_id uuid default auth.uid() references auth.users on delete set null,
  criado_em timestamptz not null default now()
);
create index importacoes_org_idx on public.importacoes (org_id, criado_em desc);

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes on delete cascade,
  codigo_erp text,
  nome text not null,
  nome_fantasia text,
  documento text,
  ie text,
  telefones text[] not null default '{}',
  contato text,
  email text,
  logradouro text, bairro text, cep text,
  cidade text, uf char(2),
  municipio_ibge integer references public.municipios,
  lat double precision, lng double precision,
  precisao_geo text check (precisao_geo in ('endereco','cep','municipio')),
  geom extensions.geography(point, 4326) generated always as (
    case when lat is not null and lng is not null
      then extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography end) stored,
  data_cadastro date,
  ultima_compra date,
  situacao text not null default 'ativo' check (situacao in ('ativo','inativo')),
  observacoes text,
  estabelecimento_id bigint references public.estabelecimentos on delete set null,
  importacao_id uuid references public.importacoes on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (org_id, codigo_erp)
);
create index clientes_org_idx on public.clientes (org_id);
create index clientes_org_uf_idx on public.clientes (org_id, uf);
create index clientes_org_mun_idx on public.clientes (org_id, municipio_ibge);
create index clientes_geom_idx on public.clientes using gist (geom);
create index clientes_doc_idx on public.clientes (org_id, documento);

create type public.situacao_comercial as enum
  ('novo_prospect','nao_abordado','em_contato','interessado','negociacao','convertido','nao_interessado');

create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes on delete cascade,
  estabelecimento_id bigint references public.estabelecimentos on delete set null,
  nome text not null,
  documento text,
  telefone text, email text, site text, instagram text,
  logradouro text, bairro text, cep text,
  cidade text, uf char(2),
  municipio_ibge integer references public.municipios,
  lat double precision, lng double precision,
  precisao_geo text check (precisao_geo in ('endereco','cep','municipio')),
  geom extensions.geography(point, 4326) generated always as (
    case when lat is not null and lng is not null
      then extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography end) stored,
  categoria text,
  situacao public.situacao_comercial not null default 'novo_prospect',
  nota integer check (nota between 0 and 100),
  nota_detalhes jsonb,
  nota_calculada_em timestamptz,
  responsavel_id uuid references auth.users on delete set null,
  fonte text not null default 'manual',
  fonte_ref text,
  observacoes text,
  importacao_id uuid references public.importacoes on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (org_id, estabelecimento_id)
);
create index prospects_org_idx on public.prospects (org_id, situacao);
create index prospects_org_uf_idx on public.prospects (org_id, uf);
create index prospects_geom_idx on public.prospects using gist (geom);

create table public.interacoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes on delete cascade,
  prospect_id uuid references public.prospects on delete cascade,
  cliente_id uuid references public.clientes on delete cascade,
  user_id uuid default auth.uid() references auth.users on delete set null,
  data timestamptz not null default now(),
  canal text check (canal in ('telefone','whatsapp','email','visita','instagram','outro')),
  situacao_nova public.situacao_comercial,
  texto text not null check (length(trim(texto)) > 0),
  criado_em timestamptz not null default now(),
  check (prospect_id is not null or cliente_id is not null)
);
create index interacoes_prospect_idx on public.interacoes (prospect_id, data desc);
create index interacoes_cliente_idx on public.interacoes (cliente_id, data desc);

create table public.uso_mensal (
  org_id uuid not null references public.organizacoes on delete cascade,
  mes date not null,
  consultas integer not null default 0,
  exportacoes integer not null default 0,
  primary key (org_id, mes)
);

create table public.auditoria (
  id bigint generated always as identity primary key,
  org_id uuid references public.organizacoes on delete cascade,
  user_id uuid default auth.uid(),
  acao text not null,
  entidade text,
  entidade_id text,
  detalhes jsonb,
  criado_em timestamptz not null default now()
);
create index auditoria_org_idx on public.auditoria (org_id, criado_em desc);
