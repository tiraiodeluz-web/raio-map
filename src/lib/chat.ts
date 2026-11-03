import { supabase } from './supabase'

export interface ResultadoChat { enviados: number; sem_whatsapp: number }

/** Envia prospects (ou um teste) ao fluxo do bate-papo da empresa, pela função segura do Supabase. */
export async function chamarBatePapo(orgId: string, acao: 'enviar' | 'testar', prospectIds: string[] = []): Promise<ResultadoChat> {
  const { data, error } = await supabase.functions.invoke('bate-papo', { body: { org_id: orgId, acao, prospect_ids: prospectIds } })
  if (error) {
    let m = 'Não foi possível conectar ao bate-papo agora.'
    try { const ctx = (error as { context?: Response }).context; if (ctx) m = (await ctx.json()).erro || m } catch { /* sem JSON */ }
    throw new Error(m)
  }
  return data as ResultadoChat
}

export function textoResultado(r: ResultadoChat) {
  const base = `${r.enviados} ${r.enviados === 1 ? 'prospect enviado' : 'prospects enviados'} ao bate-papo`
  return r.sem_whatsapp ? `${base}. ${r.sem_whatsapp} sem telefone válido para WhatsApp.` : base + '.'
}
