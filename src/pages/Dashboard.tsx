import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSessao } from '../context/Sessao'
import { supabase } from '../lib/supabase'
import { useClientesMapa } from '../lib/dados'
import { fmt, pct } from '../lib/format'
import { UF_NOMES } from '../lib/geo'
import { BarrasH, ColunasMes } from '../components/Graficos'

interface Resumo {
  clientes: number; clientes_ativos: number; clientes_sem_local: number; municipios_atendidos: number
  ufs_atendidas: number; municipios_total: number; prospects: number
  clientes_por_uf: Record<string, number>; cadastros_por_mes: { mes: string; n: number }[]
}

/** Preenche meses sem cadastro com zero, para a série não pular meses. */
function serieCompleta(s: { mes: string; n: number }[]) {
  const m = new Map(s.map((x) => [x.mes, x.n])); const out: { mes: string; n: number }[] = []
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 23)
  for (let i = 0; i < 24; i++) { const k = d.toISOString().slice(0, 7); out.push({ mes: k, n: m.get(k) || 0 }); d.setMonth(d.getMonth() + 1) }
  return out
}

export default function Dashboard() {
  const { org, municipios } = useSessao()
  const [r, setR] = useState<Resumo | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const { dados } = useClientesMapa(org?.id)

  useEffect(() => {
    if (!org) return
    setR(null)
    supabase.rpc('resumo_org', { p_org: org.id }).then(({ data, error }) => {
      if (error) setErro(error.message); else setR(data as Resumo)
    })
  }, [org])

  const porUf = useMemo(() => Object.entries(r?.clientes_por_uf || {}).map(([uf, n]) => ({ rotulo: UF_NOMES[uf] || uf, valor: n })).sort((a, b) => b.valor - a.valor), [r])
  const munPorUf = useMemo(() => { const m: Record<string, number> = {}; municipios.forEach((x) => (m[x.uf] = (m[x.uf] || 0) + 1)); return m }, [municipios])
  const cobertura = useMemo(() => {
    if (!dados) return []
    const atend: Record<string, Set<number>> = {}
    dados.forEach((c) => { if (c.uf && c.municipio_ibge) (atend[c.uf] ||= new Set()).add(c.municipio_ibge) })
    return Object.keys(munPorUf).map((uf) => ({ uf, atend: atend[uf]?.size || 0, total: munPorUf[uf] }))
      .sort((a, b) => a.atend / a.total - b.atend / b.total)
  }, [dados, munPorUf])
  const topCidades = useMemo(() => {
    if (!dados) return []
    const m = new Map<string, number>()
    dados.forEach((c) => { if (c.cidade) { const k = c.cidade + ' – ' + c.uf; m.set(k, (m.get(k) || 0) + 1) } })
    return [...m.entries()].map(([rotulo, valor]) => ({ rotulo, valor })).sort((a, b) => b.valor - a.valor)
  }, [dados])

  if (erro) return <div className="page"><div className="alert alert-err">{erro}</div></div>
  if (!r) return <div className="center-fill"><div className="spinner" /></div>

  if (!r.clientes) return (
    <div className="page">
      <div className="page-head"><div><h1>{org?.nome}</h1><p>Comece importando sua carteira de clientes.</p></div></div>
      <div className="panel empty">
        <h2>Nenhum cliente cadastrado ainda</h2>
        <p>Importe a planilha exportada do seu ERP. O RAIO MAP localiza cada cliente pela cidade e pelo CEP.</p>
        <Link className="btn btn-primary" to="/clientes/importar">Importar clientes</Link>
      </div>
    </div>
  )

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>{org?.nome}</h1><p>Carteira atual e cobertura no território.</p></div>
        <Link className="btn" to="/mapa">Abrir mapa comercial</Link>
      </div>

      <div className="kpis">
        <div className="kpi"><span>Clientes</span><b>{fmt(r.clientes)}</b><small>{fmt(r.clientes_ativos)} ativos</small></div>
        <div className="kpi"><span>Municípios atendidos</span><b>{fmt(r.municipios_atendidos)}</b><small>{pct(r.municipios_atendidos, r.municipios_total)} dos {fmt(r.municipios_total)} do país</small></div>
        <div className="kpi"><span>Estados com clientes</span><b>{r.ufs_atendidas}</b><small>de 27</small></div>
        <div className="kpi"><span>Municípios sem cliente</span><b>{fmt(r.municipios_total - r.municipios_atendidos)}</b><small>espaço para expansão</small></div>
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-h"><h2>Clientes por estado</h2><span className="small muted">{porUf.length} estados</span></div>
          <div className="panel-b"><BarrasH itens={porUf} max={14} /></div>
        </section>
        <section className="panel">
          <div className="panel-h"><h2>Cidades com mais clientes</h2></div>
          <div className="panel-b"><BarrasH itens={topCidades} max={10} cor="var(--cat-ativo)" /></div>
        </section>
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-h"><h2>Novos clientes por mês</h2><span className="small muted">últimos 24 meses, pela data de cadastro</span></div>
          <div className="panel-b"><ColunasMes serie={serieCompleta(r.cadastros_por_mes)} /></div>
        </section>
        <section className="panel">
          <div className="panel-h"><h2>Menor cobertura por estado</h2><span className="small muted">municípios com cliente</span></div>
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Estado</th><th className="num">Atendidos</th><th className="num">Cobertura</th></tr></thead>
              <tbody>
                {cobertura.slice(0, 8).map((c) => (
                  <tr key={c.uf}><td>{UF_NOMES[c.uf]}</td><td className="num">{fmt(c.atend)} de {fmt(c.total)}</td><td className="num">{pct(c.atend, c.total)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {r.clientes_sem_local > 0 && <p className="small muted">{fmt(r.clientes_sem_local)} clientes estão sem cidade reconhecida e não aparecem no mapa. Corrija a cidade na ficha do cliente.</p>}
    </div>
  )
}
