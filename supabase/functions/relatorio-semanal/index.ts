// Relatório semanal: chamado de hora em hora pelo agendador do banco (pg_cron). Para cada empresa de plano pago
// com o envio ativo no dia/hora configurados, gera o relatório da semana anterior e envia por e-mail (Resend).
// Nunca envia duas vezes: a semana é "reservada" no banco antes do envio.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
const n = (x: unknown) => Number(x) || 0
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const var_ = (a: number, b: number) => (b === 0 ? (a === 0 ? '—' : 'novo') : (a >= b ? '+' : '') + Math.round(((a - b) / b) * 100) + '%')

function html(org: string, d: Record<string, any>) { // deno-lint-ignore-line no-explicit-any
  const linha = (rot: string, k: string) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e8ee">${rot}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e8ee;text-align:right"><b>${n(d[k]?.atual)}</b></td><td style="padding:8px 12px;border-bottom:1px solid #e5e8ee;text-align:right;color:#667">${n(d[k]?.anterior)} (${var_(n(d[k]?.atual), n(d[k]?.anterior))})</td></tr>`
  const cidades = (d.cidades || []).map((c: any) => `<li>${esc(c.cidade)}/${esc(c.uf)}: ${c.total}</li>`).join('') || '<li>Sem movimentação registrada.</li>'
  const vend = (d.vendedores || []).map((v: any) => `<tr><td style="padding:6px 12px">${esc(v.email)}</td><td style="text-align:right;padding:6px 12px">${v.contatos}</td><td style="text-align:right;padding:6px 12px">${v.convertidos}</td></tr>`).join('') || '<tr><td colspan="3" style="padding:6px 12px">Nenhum contato registrado na semana.</td></tr>'
  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#14213d"><h2 style="margin:0">Relatório semanal · ${esc(org)}</h2>
<p style="color:#667">Semana de ${esc(d.semana_inicio)} a ${esc(d.semana_fim)}, comparada com a semana anterior.</p>
<table style="width:100%;border-collapse:collapse"><tr style="background:#f3f5f9"><th align="left" style="padding:8px 12px">Indicador</th><th align="right" style="padding:8px 12px">Semana</th><th align="right" style="padding:8px 12px">Anterior</th></tr>
${linha('Novos clientes cadastrados', 'novos_clientes')}${linha('Novos prospects', 'novos_prospects')}${linha('Contatos feitos', 'contatos')}${linha('Prospects convertidos', 'convertidos')}${linha('Clientes com compra registrada', 'compras_registradas')}</table>
<p><b>Oportunidades abertas hoje:</b> ${n(d.oportunidades_abertas)}</p><h3>Cidades com mais movimentação</h3><ul>${cidades}</ul>
<h3>Vendedores</h3><table style="width:100%;border-collapse:collapse"><tr style="background:#f3f5f9"><th align="left" style="padding:6px 12px">Vendedor</th><th align="right" style="padding:6px 12px">Contatos</th><th align="right" style="padding:6px 12px">Convertidos</th></tr>${vend}</table>
<p style="color:#889;font-size:12px">Gerado pelo Clyvo Map com os dados registrados na plataforma.</p></div>`
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  // o agendador do banco envia um segredo guardado numa tabela privada (sem acesso pelo app)
  const { data: seg0 } = await admin.from('segredos_sistema').select('valor').eq('chave', 'cron_relatorio').maybeSingle()
  const recebido = req.headers.get('x-cron-secret')
  if (!seg0?.valor || !recebido || recebido !== seg0.valor) return json({ erro: 'Não autorizado.' }, 401)
  const resend = Deno.env.get('RESEND_API_KEY'), de = Deno.env.get('RELATORIO_FROM') || 'Clyvo Map <onboarding@resend.dev>'

  const sp = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(new Date())
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(sp.find((p) => p.type === 'weekday')!.value)
  const hora = Number(sp.find((p) => p.type === 'hour')!.value) % 24
  const { data: cfgs } = await admin.from('relatorio_config').select('org_id,destinatarios').eq('ativo', true).eq('dia_semana', dow).eq('hora', hora)

  const hojeSP = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const seg = new Date(hojeSP); seg.setDate(seg.getDate() - ((seg.getDay() + 6) % 7) - 7)
  const ini = `${seg.getFullYear()}-${String(seg.getMonth() + 1).padStart(2, '0')}-${String(seg.getDate()).padStart(2, '0')}`

  const out: Record<string, string> = {}
  for (const c of cfgs || []) {
    const { data: org } = await admin.from('organizacoes').select('nome,plano_id').eq('id', c.org_id).single()
    if (!org || org.plano_id === 'teste') { out[c.org_id] = 'plano sem relatório'; continue }
    if (!c.destinatarios?.length) { out[c.org_id] = 'sem destinatários'; continue }
    if (!resend) { out[c.org_id] = 'e-mail não configurado (RESEND_API_KEY)'; continue }
    const { data: dados } = await admin.rpc('relatorio_calcular', { p_org: c.org_id, p_ini: ini })
    await admin.from('relatorios_semanais').upsert({ org_id: c.org_id, semana_inicio: ini, dados }, { onConflict: 'org_id,semana_inicio', ignoreDuplicates: true })
    // reserva a semana: só quem conseguir marcar envia (evita disparo duplicado)
    const { data: reserva } = await admin.from('relatorios_semanais').update({ enviado_em: new Date().toISOString() })
      .eq('org_id', c.org_id).eq('semana_inicio', ini).is('enviado_em', null).select('id')
    if (!reserva?.length) { out[c.org_id] = 'já enviado'; continue }
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${resend}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: de, to: c.destinatarios, subject: `Relatório semanal · ${org.nome} · ${ini}`, html: html(org.nome, dados) }),
    })
    if (!r.ok) { await admin.from('relatorios_semanais').update({ enviado_em: null }).eq('org_id', c.org_id).eq('semana_inicio', ini); out[c.org_id] = 'falha no envio ' + r.status; continue }
    out[c.org_id] = 'enviado'
  }
  return json({ semana: ini, dow, hora, resultado: out })
})
