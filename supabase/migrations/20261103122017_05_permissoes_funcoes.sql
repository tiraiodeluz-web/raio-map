-- RAIO MAP · 05_permissoes_funcoes
revoke execute on all functions in schema public from anon;
revoke execute on function public.auditar(uuid, text, text, text, jsonb) from public, authenticated;
revoke execute on function public.gatilho_auditoria() from public, authenticated;
revoke execute on function public.interacao_antes() from public, authenticated;
revoke execute on function public.interacao_depois() from public, authenticated;
revoke execute on function public.tocar_atualizado_em() from public, authenticated;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke all on tables from anon;
