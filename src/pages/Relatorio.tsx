import { useCallback, useEffect, useState } from 'react'
import { useSessao } from '../context/Sessao'
import { msgErro, supabase } from '../lib/supabase'
import { dataBR, fmt } from '../lib/format'
import { ehPago } from '../lib/plano'
import Bloqueado from '../components/Bloqueado'

interface Par { atual: number; anterior: number }
interface Dados { semana_inicio: string; semana_fim: string; novos_clientes: Par; novos_prospects: Par; contatos: Par; convertidos: Par; compras_registradas: Par; oportunidades_abertas: number; cidades: { cidade: string; uf: string; total: number }[]; vendedores: { email: string; contatos: number; convertidos: number }[] }
interface Cfg { ativo: boolean; dia_semana: number; hora: number; destinatarios: string[] }
const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

/** Segunda-feira (AAAA-MM-DD) da semana anterior à data dada. */
function segundaAnterior(ref = new Date()) { const d = new Date(ref); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7); return d.toISOString().slice(0, 10) }
const variacao = (p: Par) => (p.anterior === 0 ? (p.atual === 0 ? '—' : 'novo') : (p.atual >= p.anterior ? '+' : '') + Math.round(((p.atual - p.anterior) / p.anterior) * 100) + '%')

export default function Relatorio() {
  const { org } = useSessao()
  if (!ehPago(org)) return <Bloqueado titulo="Relatório executivo semanal" descricao="Um resumo da semana comercial com comparação à semana anterior, pronto para a diretoria, em PDF e por e-mail." />
  return <Tela />
}

function Tela() {
  const { org, ehAdmin } = useSessao()
  const [semana, setSemana] = useState(segundaAnterior())
  const [semanas, setSemanas] = useState<string[]>([])
  const [d, setD] = useState<Dados | null>(null)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const gerar = useCallback(async (ini: string) => {
    if (!org) return
    setBusy(true); setErro(null)
    const { data, error } = await supabase.rpc('gerar_relatorio_semanal', { p_org: org.id, p_ini: ini })
    setBusy(false)
    if (error) return setErro(msgErro(error))
    setD(data as Dados)
    supabase.from('relatorios_semanais').select('semana_inicio').eq('org_id', org.id).order('semana_inicio', { ascending: false }).limit(26).then((r) => setSemanas((r.data || []).map((x: { semana_inicio: string }) => x.semana_inicio)))
  }, [org])
  useEffect(() => { gerar(semana) }, [gerar, semana])

  const opcoes = [...new Set([segundaAnterior(), ...semanas])]
  const sem = d && Object.values([d.novos_clientes, d.novos_prospects, d.contatos, d.convertidos, d.compras_registradas]).every((p) => p.atual === 0 && p.anterior === 0) && !d.oportunidades_abertas

  return (
    <div className="page rel">
      <div className="page-head no-print">
        <div><h1>Relatório semanal</h1><p>Resumo da atividade comercial com comparação à semana anterior.</p></div>
        <div className="filtros">
          <label className="field"><span>Semana</span><select className="input" value={semana} onChange={(e) => setSemana(e.target.value)}>{opcoes.map((s) => <option key={s} value={s}>{dataBR(s)}{s === segundaAnterior() ? ' (última completa)' : ''}</option>)}</select></label>
          <button className="btn btn-primary" type="button" onClick={() => window.print()} disabled={!d}>Salvar em PDF</button>
        </div>
      </div>
      {erro && <div className="alert alert-err" role="alert">{erro}</div>}
      {busy && !d && <div className="center-fill"><div className="spinner" aria-label="Carregando" /></div>}
      {d && (
        <article className="panel rel-doc">
          <header><h2>{org?.nome}</h2><p className="muted">Semana de {dataBR(d.semana_inicio)} a {dataBR(d.semana_fim)} · comparada com a semana anterior</p></header>
          {sem && <div className="alert alert-info">Não há atividade registrada nesta semana e na anterior. O relatório se preenche conforme a equipe usa o sistema.</div>}
          <table className="t">
            <thead><tr><th>Indicador</th><th className="num">Semana</th><th className="num">Anterior</th><th className="num">Variação</th></tr></thead>
            <tbody>
              {([['Novos clientes cadastrados', d.novos_clientes], ['Novos prospects identificados', d.novos_prospects], ['Contatos feitos', d.contatos], ['Oportunidades convertidas', d.convertidos], ['Clientes com compra registrada', d.compras_registradas]] as [string, Par][]).map(([r, p]) => (
                <tr key={r}><td>{r}</td><td className="num"><b>{fmt(p.atual)}</b></td><td className="num">{fmt(p.anterior)}</td><td className="num">{variacao(p)}</td></tr>))}
            </tbody>
          </table>
          <p><b>Oportunidades abertas hoje</b> (em contato, interessado ou negociação): {fmt(d.oportunidades_abertas)}</p>
          <div className="dois-col">
            <div><h3>Cidades com mais movimentação</h3>{d.cidades.length ? <ol>{d.cidades.map((c) => <li key={c.cidade + c.uf}>{c.cidade}/{c.uf}: {fmt(c.total)}</li>)}</ol> : <p className="muted">Sem movimentação registrada.</p>}</div>
            <div><h3>Desempenho dos vendedores</h3>{d.vendedores.length ? <table className="t"><thead><tr><th>Vendedor</th><th className="num">Contatos</th><th className="num">Convertidos</th></tr></thead><tbody>{d.vendedores.map((v) => <tr key={v.email}><td>{v.email}</td><td className="num">{fmt(v.contatos)}</td><td className="num">{fmt(v.convertidos)}</td></tr>)}</tbody></table> : <p className="muted">Nenhum contato registrado na semana.</p>}</div>
          </div>
          <footer className="small muted">Dados registrados no Clyvo Map. "Clientes recuperados" não aparece porque o sistema guarda só a data da última compra, sem o histórico anterior.</footer>
        </article>
      )}
      {ehAdmin && <Envio />}
    </div>
  )
}

function Envio() {
  const { org, toast } = useSessao()
  const [c, setC] = useState<Cfg>({ ativo: false, dia_semana: 1, hora: 8, destinatarios: [] })
  const [txt, setTxt] = useState('')
  useEffect(() => {
    if (!org) return
    supabase.from('relatorio_config').select('ativo,dia_semana,hora,destinatarios').eq('org_id', org.id).maybeSingle().then(({ data }) => { if (data) { setC(data as Cfg); setTxt((data.destinatarios || []).join(', ')) } })
  }, [org])
  async function salvar() {
    if (!org) return
    const lista = [...new Set(txt.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))]
    const ruim = lista.find((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
    if (ruim) return toast(`E-mail inválido: ${ruim}`)
    if (c.ativo && !lista.length) return toast('Informe ao menos um e-mail para ativar o envio.')
    const { error } = await supabase.from('relatorio_config').upsert({ org_id: org.id, ativo: c.ativo, dia_semana: c.dia_semana, hora: c.hora, destinatarios: lista, atualizado_em: new Date().toISOString() }, { onConflict: 'org_id' })
    if (error) return toast(msgErro(error))
    setC({ ...c, destinatarios: lista }); toast('Envio automático salvo.')
  }
  return (
    <section className="panel no-print" style={{ padding: 16, display: 'grid', gap: 12 }}>
      <b>Envio automático por e-mail</b>
      <label className="small"><input type="checkbox" checked={c.ativo} onChange={(e) => setC({ ...c, ativo: e.target.checked })} /> Enviar o relatório da semana anterior toda semana</label>
      <div className="filtros">
        <label className="field"><span>Dia</span><select className="input" value={c.dia_semana} onChange={(e) => setC({ ...c, dia_semana: Number(e.target.value) })}>{DIAS.map((x, i) => <option key={x} value={i}>{x}</option>)}</select></label>
        <label className="field"><span>Horário (Brasília)</span><select className="input" value={c.hora} onChange={(e) => setC({ ...c, hora: Number(e.target.value) })}>{[...Array(24).keys()].map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select></label>
        <label className="field" style={{ flex: 1, minWidth: 240 }}><span>Destinatários (separe por vírgula)</span><input className="input" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="diretoria@empresa.com.br, gerente@empresa.com.br" /></label>
        <button className="btn btn-primary" type="button" onClick={salvar}>Salvar</button>
      </div>
      <div className="small muted">O envio acontece na hora cheia escolhida e cada semana é enviada uma única vez. Requer o serviço de e-mail ativado no servidor pelo suporte do Clyvo Map.</div>
    </section>
  )
}
