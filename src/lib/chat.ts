import { supabase, SUPABASE_URL } from './supabase'

export interface ResultadoChat { enviados: number; fora?: Record<string, number> }

export const RETORNO_URL = `${SUPABASE_URL}/functions/v1/bate-papo-retorno`

/** Envia prospects (ou um teste) ao fluxo do bate-papo da empresa, pela função segura do Supabase. */
export async function chamarBatePapo(orgId: string, acao: 'enviar' | 'testar', prospectIds: string[] = [], incluirFixos = false): Promise<ResultadoChat> {
  const { data, error } = await supabase.functions.invoke('bate-papo', { body: { org_id: orgId, acao, prospect_ids: prospectIds, incluir_fixos: incluirFixos } })
  if (error) {
    let m = 'Não foi possível conectar ao bate-papo agora.'
    try { const ctx = (error as { context?: Response }).context; if (ctx) m = (await ctx.json()).erro || m } catch { /* sem JSON */ }
    throw new Error(m)
  }
  return data as ResultadoChat
}

const MOTIVO: Record<string, [string, string]> = {
  fixo: ['telefone fixo', 'telefones fixos'],
  sem_telefone: ['sem telefone válido', 'sem telefone válido'],
  sem_whatsapp: ['sem WhatsApp', 'sem WhatsApp'],
  bloqueado: ['pediu para não receber', 'pediram para não receber'],
}
export function textoResultado(r: ResultadoChat) {
  const base = r.enviados ? `${r.enviados} ${r.enviados === 1 ? 'prospect enviado' : 'prospects enviados'} ao bate-papo.` : 'Nenhum prospect enviado.'
  const fora = Object.entries(r.fora || {}).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${MOTIVO[k]?.[n === 1 ? 0 : 1] || k}`)
  return fora.length ? `${base} Ficaram de fora: ${fora.join(', ')}.` : base
}

/** Rótulo curto do telefone para a lista e o funil. */
export function seloTelefone(p: { tipo_telefone?: string | null; whatsapp_status?: string | null; chat_bloqueado?: boolean | null }) {
  if (p.chat_bloqueado) return { texto: 'não quer contato', classe: 'selo-ruim' }
  if (p.whatsapp_status === 'invalido') return { texto: 'sem WhatsApp', classe: 'selo-ruim' }
  if (p.whatsapp_status === 'valido') return { texto: 'WhatsApp ok', classe: 'selo-bom' }
  if (p.tipo_telefone === 'fixo') return { texto: 'fixo · ligar', classe: 'selo-neutro' }
  if (p.tipo_telefone === 'celular') return { texto: 'celular', classe: 'selo-neutro' }
  if (p.tipo_telefone === 'invalido') return { texto: 'número inválido', classe: 'selo-ruim' }
  return null
}
