-- RAIO MAP · 06_funcoes_sem_acesso_publico
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.eh_membro(uuid), public.papel_em(uuid), public.pode_editar(uuid), public.eh_admin_org(uuid), public.eh_admin_plataforma(),
  public.criar_organizacao(text, text), public.aceitar_convites(), public.convidar_membro(uuid, text, public.papel_membro),
  public.listar_membros(uuid), public.alterar_papel(uuid, uuid, public.papel_membro), public.remover_membro(uuid, uuid),
  public.registrar_exportacao(uuid), public.resumo_org(uuid)
  to authenticated;
alter default privileges in schema public revoke execute on functions from public;
