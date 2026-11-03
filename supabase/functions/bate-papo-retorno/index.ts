// Clyvo Map · Retorno do bate-papo: o fluxo (n8n) avisa o que aconteceu com cada contato no WhatsApp.
// Chamado pelo n8n, sem login: a autenticação é a chave X-Clyvo-Token da empresa (Configurações > Bate-papo).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-clyvo-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const EVENTOS = ['entregue', 'lida', 'sem_whatsapp', 'respondeu', 'interessado', 'nao_interessado'] as const
type Evento = typeof EVENTOS[number]
interface Aviso { prospect_id?: string; evento?: Evento; texto?: string; resumo?: string }

const iguais = (a: string, b: string) => {
  if (a.length !== b.length) return false
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}
const curto = (t: unknown, n = 2000) => (typeof t === 'string' ? t.trim().slice(0, n) : '')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ erro: 'Use POST.' }, 405)
  const token = req.headers.get('x-clyvo-token') || ''
  if (!token) return json({ erro: 'Falta o cabeçalho X-Clyvo-Token.' }, 401)

  let corpo: Aviso & { eventos?: Aviso[] }
  try { corpo = await req.json() } catch { return json({ erro: 'Corpo inválido: envie JSON.' }, 400) }
  const avisos = (Array.isArray(corpo.eventos) ? corpo.eventos : [corpo]).slice(0, 200)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const integCache = new Map<string, { segredo: string; coluna_interessado: string | null; coluna_perdido: string | null } | null>()
  const resultados: { prospect_id?: string; ok: boolean; erro?: string; parar_envio?: boolean }[] = []

  for (const a of avisos) {
    const pid = a.prospect_id
    if (!pid || !/^[0-9a-f-]{36}$/i.test(pid)) { resultados.push({ prospect_id: pid, ok: false, erro: 'prospect_id ausente ou inválido' }); continue }
    if (!a.evento || !EVENTOS.includes(a.evento)) { resultados.push({ prospect_id: pid, ok: false, erro: 'evento deve ser um de: ' + EVENTOS.join(', ') }); continue }

    const { data: p } = await admin.from('prospects').select('id, org_id, whatsapp_status, chat_bloqueado').eq('id', pid).maybeSingle()
    if (!p) { resultados.push({ prospect_id: pid, ok: false, erro: 'prospect não encontrado' }); continue }
    if (!integCache.has(p.org_id)) {
      const { data } = await admin.from('integracoes').select('segredo, coluna_interessado, coluna_perdido').eq('org_id', p.org_id).eq('tipo', 'bate_papo').maybeSingle()
      integCache.set(p.org_id, data)
    }
    const integ = integCache.get(p.org_id)
    if (!integ || !iguais(integ.segredo, token)) { resultados.push({ prospect_id: pid, ok: false, erro: 'chave inválida para este prospect' }); continue }

    const agora = new Date().toISOString()
    const upd: Record<string, unknown> = { chat_ultimo_evento: a.evento, chat_ultimo_em: agora }
    let texto = ''
    let situacao: string | null = null
    const t = curto(a.texto), r = curto(a.resumo)
    switch (a.evento) {
      case 'entregue': upd.whatsapp_status = 'valido'; if (p.whatsapp_status !== 'valido') texto = 'Mensagem entregue no WhatsApp'; break
      case 'lida': upd.whatsapp_status = 'valido'; break
      case 'sem_whatsapp': upd.whatsapp_status = 'invalido'; texto = 'O WhatsApp recusou o número: parece não ter WhatsApp. ' + t; break
      case 'respondeu': upd.whatsapp_status = 'valido'; texto = 'Respondeu no WhatsApp: ' + (t || '(mensagem sem texto)'); break
      case 'interessado':
        upd.whatsapp_status = 'valido'; situacao = 'interessado'
        if (integ.coluna_interessado) upd.coluna_id = integ.coluna_interessado
        texto = 'Qualificado como interessado no bate-papo. ' + (r || t); break
      case 'nao_interessado':
        upd.chat_bloqueado = true; situacao = 'nao_interessado'
        if (integ.coluna_perdido) upd.coluna_id = integ.coluna_perdido
        texto = 'Sem interesse no bate-papo; não enviar mais mensagens. ' + (r || t); break
    }
    const { error } = await admin.from('prospects').update(upd).eq('id', pid)
    if (error) { resultados.push({ prospect_id: pid, ok: false, erro: error.message }); continue }
    if (texto.trim()) {
      await admin.from('interacoes').insert({ org_id: p.org_id, prospect_id: pid, canal: 'whatsapp', texto: texto.trim(), situacao_nova: situacao, user_id: null })
    }
    resultados.push({ prospect_id: pid, ok: true, parar_envio: a.evento === 'nao_interessado' || p.chat_bloqueado || a.evento === 'sem_whatsapp' })
  }

  const falhas = resultados.filter((x) => !x.ok)
  if (avisos.length === 1) return json(resultados[0], resultados[0].ok ? 200 : (resultados[0].erro?.startsWith('chave') ? 403 : 400))
  return json({ processados: resultados.length - falhas.length, falhas: falhas.length, resultados })
})
