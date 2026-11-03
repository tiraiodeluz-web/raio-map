create table if not exists public.segredos_sistema (chave text primary key, valor text not null);
alter table public.segredos_sistema enable row level security; -- sem políticas: só a chave de serviço acessa
revoke all on public.segredos_sistema from anon, authenticated;
create extension if not exists pg_net;
create extension if not exists pg_cron;
insert into public.segredos_sistema values ('cron_relatorio', '<gerado-na-aplicacao>') on conflict (chave) do nothing;
select cron.schedule('relatorio-semanal-hora', '0 * * * *', $$
  select net.http_post(url := 'https://pizwcdcxpdulyntwbdex.supabase.co/functions/v1/relatorio-semanal',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', (select valor from public.segredos_sistema where chave='cron_relatorio')),
    body := '{}'::jsonb) $$);