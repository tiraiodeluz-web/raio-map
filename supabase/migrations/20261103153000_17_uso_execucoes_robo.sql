-- Registro de cada execução do robô da base nacional (consumo de IA)
create table if not exists public.execucoes_robo (
  id bigint generated always as identity primary key,
  executado_em timestamptz not null default now(),
  modo text,
  mes_referencia date,
  selecionados int default 0,
  ia_avaliados int default 0,
  ia_chamadas int default 0,
  tokens_entrada bigint default 0,
  tokens_saida bigint default 0,
  modelo text,
  ia_parou_por_erro boolean default false,
  duracao_s int
);
alter table public.execucoes_robo enable row level security;
create policy execucoes_robo_select on public.execucoes_robo
  for select to authenticated using ((select public.tem_acesso_ativo()));
