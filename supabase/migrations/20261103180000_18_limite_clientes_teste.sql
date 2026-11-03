-- Teste grátis: no máximo 30 clientes por empresa, validado no banco.
create or replace function public.limitar_clientes_teste() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plano text; v_n int;
begin
  select plano_id into v_plano from public.organizacoes where id = new.org_id;
  if v_plano = 'teste' then
    select count(*) into v_n from public.clientes where org_id = new.org_id;
    if v_n >= 30 then
      raise exception 'LIMITE_TESTE: o teste grátis permite até 30 clientes. Conheça a licença para importar mais.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.limitar_clientes_teste() from public, anon, authenticated;
drop trigger if exists clientes_limite_teste on public.clientes;
create trigger clientes_limite_teste before insert on public.clientes
  for each row execute function public.limitar_clientes_teste();
