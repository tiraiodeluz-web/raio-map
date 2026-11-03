// Clyvo Map · Consulta sob demanda ao Google Places (API New) para completar a ficha de um estabelecimento.
// A chave GOOGLE_MAPS_API_KEY fica só nos segredos do Supabase. Cada consulta conta no limite do plano.
// Pelos termos do Google, guardamos apenas o place_id; o resto é mostrado na hora e não fica salvo.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ erro: 'Use POST.' }, 405)

  const gkey = Deno.env.get('GOOGLE_MAPS_API_KEY')
  if (!gkey) return json({ erro: 'A consulta ao Google ainda não foi configurada: falta a chave do Google nos segredos do Supabase.' }, 503)

  let corpo: { org_id?: string; estabelecimento_id?: number }
  try { corpo = await req.json() } catch { return json({ erro: 'Pedido inválido.' }, 400) }
  const { org_id, estabelecimento_id } = corpo
  if (!org_id || !estabelecimento_id) return json({ erro: 'Informe a empresa e o estabelecimento.' }, 400)

  const url = Deno.env.get('SUPABASE_URL')!
  const usuario = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: e, error: eErr } = await admin.from('estabelecimentos')
    .select('id, nome_fantasia, razao_social, logradouro, numero, bairro, uf, municipio_ibge').eq('id', estabelecimento_id).single()
  if (eErr || !e) return json({ erro: 'Estabelecimento não encontrado.' }, 404)

  // conta a consulta no plano da empresa (e confere se o usuário é membro dela)
  const { data: uso, error: usoErr } = await usuario.rpc('registrar_consulta', { p_org: org_id })
  if (usoErr) return json({ erro: usoErr.message }, 403)

  const { data: m } = e.municipio_ibge
    ? await admin.from('municipios').select('nome').eq('ibge', e.municipio_ibge).single()
    : { data: null }
  const nome = e.nome_fantasia || e.razao_social || ''
  const textQuery = [nome, [e.logradouro, e.numero].filter(Boolean).join(' '), m?.nome, e.uf].filter(Boolean).join(', ')

  const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': gkey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.businessStatus,places.regularOpeningHours.weekdayDescriptions',
    },
    body: JSON.stringify({ textQuery, languageCode: 'pt-BR', regionCode: 'BR', pageSize: 1 }),
  })
  if (!resp.ok) {
    const txt = await resp.text()
    console.error('Google Places', resp.status, txt.slice(0, 500))
    return json({ erro: resp.status === 403 ? 'O Google recusou a chave. Confira se a Places API (New) está ativada no Google Cloud.' : 'O Google não respondeu agora. Tente de novo em instantes.' }, 502)
  }
  const dados = await resp.json()
  const p = dados.places?.[0]
  if (p?.id) {
    await admin.from('estabelecimento_fontes').upsert(
      { estabelecimento_id: e.id, fonte: 'google_places', referencia: p.id, confiabilidade: 'alta', coletado_em: new Date().toISOString() },
      { onConflict: 'estabelecimento_id,fonte' },
    )
  }
  return json({
    uso,
    lugar: p ? {
      nome: p.displayName?.text, endereco: p.formattedAddress, telefone: p.nationalPhoneNumber, site: p.websiteUri,
      status: p.businessStatus, mapa: p.googleMapsUri, horarios: p.regularOpeningHours?.weekdayDescriptions,
    } : null,
  })
})
