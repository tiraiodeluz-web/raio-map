-- Tipo do telefone pelo formato brasileiro: celular tem 9 dígitos começando com 9 depois do DDD.
create or replace function public.tipo_telefone(t text) returns text
language sql immutable set search_path = '' as $$
  with d as (select regexp_replace(regexp_replace(coalesce(t, ''), '\D', '', 'g'), '^0+', '') as n),
  l as (select case when length(n) in (12, 13) and n like '55%' then substr(n, 3) else n end as n from d)
  select case
    when n = '' then null
    when length(n) = 11 and substr(n, 3, 1) = '9' then 'celular'
    when length(n) = 10 and substr(n, 3, 1) between '2' and '5' then 'fixo'
    when length(n) = 10 and substr(n, 3, 1) between '6' and '9' then 'celular'
    else 'invalido' end
  from l;
$$;

alter table public.prospects
  add column tipo_telefone text generated always as (public.tipo_telefone(telefone)) stored,
  add column whatsapp_status text check (whatsapp_status in ('valido', 'invalido')),
  add column chat_bloqueado boolean not null default false,
  add column chat_ultimo_evento text,
  add column chat_ultimo_em timestamptz;
create index prospects_tel_idx on public.prospects (org_id, tipo_telefone);

create or replace function public.prospect_telefone_mudou() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.telefone is distinct from old.telefone then new.whatsapp_status := null; end if;
  return new;
end $$;
create trigger prospects_telefone_mudou before update of telefone on public.prospects
  for each row execute function public.prospect_telefone_mudou();

alter table public.integracoes
  add column coluna_interessado uuid references public.colunas_funil on delete set null,
  add column coluna_perdido uuid references public.colunas_funil on delete set null;
