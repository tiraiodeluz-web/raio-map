-- Clyvo Map · 04_funcoes_e_gatilhos
create or replace function public.tocar_atualizado_em() returns trigger
language plpgsql set search_path = '' as $$
begin new.atualizado_em := now(); return new; end $$;
create trigger clientes_atualizado before update on public.clientes for each row execute function public.tocar_atualizado_em();
create trigger prospects_atualizado before update on public.prospects for each row execute function public.tocar_atualizado_em();

create or replace function public.auditar(p_org uuid, p_acao text, p_entidade text, p_id text, p_detalhes jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.auditoria (org_id, user_id, acao, entidade, entidade_id, detalhes)
  values (p_org, auth.uid(), p_acao, p_entidade, p_id, p_detalhes);
$$;

create or replace function public.gatilho_auditoria() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record; o uuid; idtxt text;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  o := (to_jsonb(r)->>'org_id')::uuid;
  idtxt := coalesce(to_jsonb(r)->>'id', to_jsonb(r)->>'user_id');
  perform public.auditar(o, lower(tg_op), tg_table_name, idtxt,
    case tg_table_name
      when 'clientes' then jsonb_build_object('nome', to_jsonb(r)->>'nome')
      when 'prospects' then jsonb_build_object('nome', to_jsonb(r)->>'nome')
      when 'importacoes' then jsonb_build_object('tipo', to_jsonb(r)->>'tipo', 'arquivo', to_jsonb(r)->>'arquivo', 'linhas_ok', to_jsonb(r)->>'linhas_ok')
      when 'membros' then jsonb_build_object('user_id', to_jsonb(r)->>'user_id', 'papel', to_jsonb(r)->>'papel')
      else null end);
  return null;
end $$;
create trigger aud_clientes_del after delete on public.clientes for each row execute function public.gatilho_auditoria();
create trigger aud_prospects_del after delete on public.prospects for each row execute function public.gatilho_auditoria();
create trigger aud_importacoes after insert on public.importacoes for each row execute function public.gatilho_auditoria();
create trigger aud_membros after insert or update or delete on public.membros for each row execute function public.gatilho_auditoria();

create or replace function public.interacao_antes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o uuid;
begin
  if new.prospect_id is not null then
    select org_id into o from public.prospects where id = new.prospect_id;
  else
    select org_id into o from public.clientes where id = new.cliente_id;
  end if;
  if o is null or o <> new.org_id then raise exception 'Registro não pertence a esta empresa'; end if;
  return new;
end $$;
create trigger interacoes_antes before insert or update on public.interacoes for each row execute function public.interacao_antes();

create or replace function public.interacao_depois() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.situacao_nova is not null and new.prospect_id is not null then
    update public.prospects set situacao = new.situacao_nova where id = new.prospect_id;
  end if;
  return null;
end $$;
create trigger interacoes_depois after insert on public.interacoes for each row execute function public.interacao_depois();

create or replace function public.criar_organizacao(p_nome text, p_cnpj text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare o uuid;
begin
  if auth.uid() is null then raise exception 'É preciso estar logado'; end if;
  insert into public.organizacoes (nome, cnpj, criado_por) values (trim(p_nome), nullif(trim(p_cnpj), ''), auth.uid())
    returning id into o;
  insert into public.membros (org_id, user_id, papel) values (o, auth.uid(), 'dono');
  perform public.auditar(o, 'criar', 'organizacoes', o::text, jsonb_build_object('nome', p_nome));
  return o;
end $$;

create or replace function public.aceitar_convites() returns integer
language plpgsql security definer set search_path = '' as $$
declare em text := lower(auth.jwt()->>'email'); n integer := 0; c record;
begin
  if auth.uid() is null or em is null then return 0; end if;
  for c in select * from public.convites where email = em and aceito_em is null loop
    insert into public.membros (org_id, user_id, papel) values (c.org_id, auth.uid(), c.papel)
      on conflict (org_id, user_id) do nothing;
    update public.convites set aceito_em = now() where id = c.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.convidar_membro(p_org uuid, p_email text, p_papel public.papel_membro default 'vendedor')
returns uuid language plpgsql security definer set search_path = '' as $$
declare lim integer; atual integer; cid uuid;
begin
  if not public.eh_admin_org(p_org) then raise exception 'Só dono ou admin pode convidar'; end if;
  if p_papel = 'dono' then raise exception 'Não é possível convidar como dono'; end if;
  select p.max_usuarios into lim from public.organizacoes o join public.planos p on p.id = o.plano_id where o.id = p_org;
  select (select count(*) from public.membros where org_id = p_org)
       + (select count(*) from public.convites where org_id = p_org and aceito_em is null) into atual;
  if lim is not null and atual >= lim then
    raise exception 'O plano permite % usuários. Remova alguém ou mude de plano.', lim;
  end if;
  insert into public.convites (org_id, email, papel, criado_por) values (p_org, lower(trim(p_email)), p_papel, auth.uid())
    on conflict (org_id, email) do update set papel = excluded.papel, aceito_em = null
    returning id into cid;
  perform public.auditar(p_org, 'convidar', 'convites', cid::text, jsonb_build_object('email', lower(trim(p_email)), 'papel', p_papel));
  return cid;
end $$;

create or replace function public.listar_membros(p_org uuid)
returns table (user_id uuid, email text, papel public.papel_membro, criado_em timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.user_id, u.email::text, m.papel, m.criado_em
  from public.membros m join auth.users u on u.id = m.user_id
  where m.org_id = p_org and public.eh_membro(p_org)
  order by m.criado_em;
$$;

create or replace function public.alterar_papel(p_org uuid, p_user uuid, p_papel public.papel_membro)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_admin_org(p_org) then raise exception 'Só dono ou admin pode mudar papéis'; end if;
  if p_papel = 'dono' and public.papel_em(p_org) <> 'dono' then raise exception 'Só o dono pode passar a posse'; end if;
  if (select papel from public.membros where org_id = p_org and user_id = p_user) = 'dono'
     and (select count(*) from public.membros where org_id = p_org and papel = 'dono') = 1
     and p_papel <> 'dono' then
    raise exception 'A empresa precisa ter pelo menos um dono';
  end if;
  update public.membros set papel = p_papel where org_id = p_org and user_id = p_user;
end $$;

create or replace function public.remover_membro(p_org uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (public.eh_admin_org(p_org) or p_user = auth.uid()) then raise exception 'Sem permissão'; end if;
  if (select papel from public.membros where org_id = p_org and user_id = p_user) = 'dono'
     and (select count(*) from public.membros where org_id = p_org and papel = 'dono') = 1 then
    raise exception 'A empresa precisa ter pelo menos um dono';
  end if;
  delete from public.membros where org_id = p_org and user_id = p_user;
end $$;

create or replace function public.registrar_exportacao(p_org uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare lim integer; usado integer; m date := date_trunc('month', now())::date;
begin
  if not public.eh_membro(p_org) then raise exception 'Sem permissão'; end if;
  select p.max_exportacoes_mes into lim from public.organizacoes o join public.planos p on p.id = o.plano_id where o.id = p_org;
  insert into public.uso_mensal (org_id, mes, exportacoes) values (p_org, m, 0) on conflict do nothing;
  select exportacoes into usado from public.uso_mensal where org_id = p_org and mes = m for update;
  if lim is not null and usado >= lim then
    raise exception 'Limite de % exportações por mês atingido.', lim;
  end if;
  update public.uso_mensal set exportacoes = exportacoes + 1 where org_id = p_org and mes = m;
  perform public.auditar(p_org, 'exportar', null, null, null);
  return usado + 1;
end $$;

create or replace function public.resumo_org(p_org uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public.eh_membro(p_org) then null else jsonb_build_object(
    'clientes', (select count(*) from public.clientes where org_id = p_org),
    'clientes_ativos', (select count(*) from public.clientes where org_id = p_org and situacao = 'ativo'),
    'clientes_sem_local', (select count(*) from public.clientes where org_id = p_org and lat is null),
    'municipios_atendidos', (select count(distinct municipio_ibge) from public.clientes where org_id = p_org),
    'ufs_atendidas', (select count(distinct uf) from public.clientes where org_id = p_org and uf is not null),
    'municipios_total', (select count(*) from public.municipios),
    'prospects', (select count(*) from public.prospects where org_id = p_org),
    'prospects_por_situacao', (select coalesce(jsonb_object_agg(situacao, n), '{}') from
        (select situacao, count(*) n from public.prospects where org_id = p_org group by 1) s),
    'clientes_por_uf', (select coalesce(jsonb_object_agg(uf, n), '{}') from
        (select uf, count(*) n from public.clientes where org_id = p_org and uf is not null group by 1) s),
    'cadastros_por_mes', (select coalesce(jsonb_agg(jsonb_build_object('mes', mes, 'n', n) order by mes), '[]') from
        (select to_char(date_trunc('month', data_cadastro), 'YYYY-MM') mes, count(*) n from public.clientes
          where org_id = p_org and data_cadastro >= (now() - interval '24 months') group by 1) s)
  ) end;
$$;
