// Clyvo Map · Conectar bate-papo: envia prospects escolhidos para o fluxo (n8n) da empresa,
// que cuida do WhatsApp (Umbler Talk). A URL do fluxo fica na tabela integracoes (só admin lê).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const so = (s: string | null) => (s || '').replace(/\D/g, '')
function whatsapp(tel: string | null) {
  const d = so(tel).replace(/^0+/, '')
  if (d.length < 10) return null
  return d.startsWith('55') && d.length >= 12 ? d : '55' + d
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ erro: 'Use POST.' }, 405)

  let c: { org_id?: string; acao?: 'enviar' | 'testar'; prospect_ids?: string[] }
  try { c = await req.json() } catch { return json({ erro: 'Pedido inválido.' }, 400) }
  const { org_id, acao = 'enviar' } = c
  if (!org_id) return json({ erro: 'Informe a empresa.' }, 400)

  const url = Deno.env.get('SUPABASE_URL')!
  const usuario = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: u } = await usuario.auth.getUser()
  if (!u.user) return json({ erro: 'Entre de novo para continuar.' }, 401)
  const { data: pode } = await usuario.rpc(acao === 'testar' ? 'eh_admin_org' : 'pode_editar', { o: org_id })
  if (!pode) return json({ erro: acao === 'testar' ? 'Só dono ou admin testa a conexão.' : 'Seu acesso é somente leitura.' }, 403)

  const { data: integ } = await admin.from('integracoes').select('webhook_url, segredo').eq('org_id', org_id).eq('tipo', 'bate_papo').maybeSingle()
  if (!integ) return json({ erro: 'O bate-papo ainda não foi conectado. Peça a um admin para configurar em Configurações > Bate-papo.' }, 409)
  const { data: org } = await admin.from('organizacoes').select('id, nome').eq('id', org_id).single()

  let contatos: Record<string, unknown>[] = []
  let ids: string[] = []
  if (acao === 'testar') {
    contatos = [{ id: 'teste', nome: 'Empresa de teste', telefone: '(11) 90000-0000', whatsapp: '5511900000000', cidade: 'São Paulo', uf: 'SP', teste: true }]
  } else {
    ids = [...new Set(c.prospect_ids || [])].slice(0, 200)
    if (!ids.length) return json({ erro: 'Escolha pelo menos um prospect.' }, 400)
    const { data: ps, error } = await admin.from('prospects')
      .select('id,nome,documento,telefone,email,site,instagram,logradouro,bairro,cep,cidade,uf,categoria,situacao,coluna_id').eq('org_id', org_id).in('id', ids)
    if (error) return json({ erro: error.message }, 500)
    const colIds = [...new Set((ps || []).map((p) => p.coluna_id).filter(Boolean))]
    const { data: cols } = colIds.length ? await admin.from('colunas_funil').select('id,nome').in('id', colIds) : { data: [] }
    const nomeCol = Object.fromEntries((cols || []).map((x) => [x.id, x.nome]))
    contatos = (ps || []).map((p) => ({
      id: p.id, nome: p.nome, cnpj: p.documento, telefone: p.telefone, whatsapp: whatsapp(p.telefone), email: p.email, site: p.site,
      instagram: p.instagram, endereco: [p.logradouro, p.bairro].filter(Boolean).join(', ') || null, cep: p.cep, cidade: p.cidade, uf: p.uf,
      categoria: p.categoria, situacao: p.situacao, coluna_funil: p.coluna_id ? nomeCol[p.coluna_id] || null : null,
    }))
    if (!contatos.length) return json({ erro: 'Nenhum dos prospects escolhidos foi encontrado.' }, 404)
  }

  let resp: Response
  try {
    resp = await fetch(integ.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Clyvo-Token': integ.segredo },
      body: JSON.stringify({
        evento: acao === 'testar' ? 'teste' : 'lista_campanha',
        enviado_em: new Date().toISOString(),
        enviado_por: u.user.email,
        empresa: { id: org!.id, nome: org!.nome },
        total: contatos.length,
        contatos,
      }),
      signal: AbortSignal.timeout(20000),
    })
  } catch {
    return json({ erro: 'Não consegui falar com o fluxo do bate-papo (n8n). Confira se o fluxo está ativo e se a URL está correta.' }, 502)
  }
  if (!resp.ok) {
    const txt = (await resp.text()).slice(0, 200)
    console.error('n8n', resp.status, txt)
    return json({ erro: resp.status === 404 ? 'O n8n respondeu que essa URL não existe. Use a "Production URL" do nó Webhook e deixe o fluxo ativo (não só em teste).' : `O fluxo respondeu com erro ${resp.status}.` }, 502)
  }
  if (acao === 'enviar') {
    await admin.from('prospects').update({ chat_enviado_em: new Date().toISOString() }).eq('org_id', org_id).in('id', ids)
    const rows = contatos.map((p) => ({ org_id, prospect_id: p.id, canal: 'whatsapp', texto: 'Enviado ao bate-papo para abordagem', user_id: u.user!.id }))
    await admin.from('interacoes').insert(rows)
  }
  return json({ enviados: contatos.length, sem_whatsapp: contatos.filter((p) => !p.whatsapp).length })
})
