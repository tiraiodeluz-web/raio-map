-- Teste de isolamento entre empresas. Roda tudo numa transação que é desfeita no final
-- (o resultado aparece na mensagem de erro "RESULTADO {...}"). Nada fica gravado.
-- Esperado: B_ve_clientes_de_A = 0, B_alterou/B_apagou = 0, inserções e convites cruzados bloqueados,
-- leitor não altera, visitante sem login bloqueado.
do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  oa uuid; ob uuid; ca uuid; r jsonb := '{}'; n int;
begin
  insert into auth.users (id, email, aud, role, instance_id) values
    (ua, 'teste.a@exemplo.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (ub, 'teste.b@exemplo.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
    (uc, 'teste.c@exemplo.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated', 'email', 'teste.a@exemplo.invalid')::text, true);
  oa := public.criar_organizacao('Empresa A (teste fictício)');
  insert into public.clientes (org_id, nome, cidade, uf) values (oa, 'Cliente fictício A', 'Campinas', 'SP') returning id into ca;
  perform public.convidar_membro(oa, 'teste.c@exemplo.invalid', 'leitor');
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated', 'email', 'teste.b@exemplo.invalid')::text, true);
  ob := public.criar_organizacao('Empresa B (teste fictício)');
  select count(*) into n from public.clientes; r := r || jsonb_build_object('B_ve_clientes_de_A', n);
  r := r || jsonb_build_object('B_resumo_de_A_nulo', public.resumo_org(oa) is null);
  begin insert into public.clientes (org_id, nome) values (oa, 'Intruso'); r := r || '{"B_inserir_em_A":"PERMITIDO (falha)"}';
  exception when others then r := r || jsonb_build_object('B_inserir_em_A', 'bloqueado'); end;
  update public.clientes set nome = 'alterado' where id = ca; get diagnostics n = row_count; r := r || jsonb_build_object('B_alterou_cliente_de_A', n);
  delete from public.clientes where id = ca; get diagnostics n = row_count; r := r || jsonb_build_object('B_apagou_cliente_de_A', n);
  begin update public.organizacoes set plano_id = 'interno' where id = ob; r := r || '{"B_mudar_plano":"PERMITIDO (falha)"}';
  exception when others then r := r || jsonb_build_object('B_mudar_plano', 'bloqueado'); end;
  begin perform public.convidar_membro(oa, 'x@exemplo.invalid', 'vendedor'); r := r || '{"B_convidar_em_A":"PERMITIDO (falha)"}';
  exception when others then r := r || jsonb_build_object('B_convidar_em_A', 'bloqueado'); end;
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated', 'email', 'teste.c@exemplo.invalid')::text, true);
  r := r || jsonb_build_object('C_convites_aceitos', public.aceitar_convites());
  update public.clientes set nome = 'leitor mexeu' where id = ca; get diagnostics n = row_count; r := r || jsonb_build_object('C_leitor_alterou', n);
  perform set_config('role', 'anon', true);
  begin select count(*) into n from public.clientes; r := r || jsonb_build_object('anon_ve_clientes', n);
  exception when others then r := r || jsonb_build_object('anon_ve_clientes', 'bloqueado'); end;
  raise exception 'RESULTADO %', r;
end $$;
