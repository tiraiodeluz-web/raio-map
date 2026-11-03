import { useEffect, useMemo, useState } from 'react'
import { useSessao } from '../context/Sessao'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/format'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const FREQ: [string, number][] = [['Uma vez por mês', 12], ['A cada 2 meses', 6], ['A cada 3 meses', 4], ['A cada 6 meses', 2], ['Uma vez por ano', 1]]
const CEN = [
  { chave: 'cons', nome: 'Conservador', f: 0.5, cor: '#8a94a6' },
  { chave: 'inter', nome: 'Intermediário', f: 1, cor: '#2563c9' },
  { chave: 'otim', nome: 'Otimista', f: 1.4, cor: '#2f9e5b' },
]

export default function Simulador() {
  const { org, municipios } = useSessao()
  const [uf, setUf] = useState(''); const [mun, setMun] = useState('')
  const [novos, setNovos] = useState('20'); const [ticket, setTicket] = useState('1500'); const [freq, setFreq] = useState(4); const [margem, setMargem] = useState('')
  const [ref, setRef] = useState<{ clientes: number; prospects: number; base: number | null } | null>(null)
  const ufs = useMemo(() => [...new Set(municipios.map((m) => m.uf))].sort(), [municipios])
  const munsUf = useMemo(() => municipios.filter((m) => m.uf === uf).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [municipios, uf])

  // referência real da região escolhida (o que a empresa já tem lá e quantas empresas a base conhece)
  useEffect(() => {
    if (!org || !uf) { setRef(null); return }
    let vivo = true
    const nome = munsUf.find((m) => String(m.ibge) === mun)?.nome
    ;(async () => {
      let c = supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('org_id', org.id).eq('uf', uf); if (nome) c = c.ilike('cidade', nome)
      let p = supabase.from('prospects').select('id', { count: 'exact', head: true }).eq('org_id', org.id).eq('uf', uf); if (nome) p = p.ilike('cidade', nome)
      const [rc, rp, rb] = await Promise.all([c, p, supabase.rpc('buscar_estabelecimentos', { p_org: org.id, p_uf: uf, p_municipio: mun ? Number(mun) : null, p_ocultar_carteira: true, p_limite: 1, p_offset: 0 })])
      if (vivo) setRef({ clientes: rc.count || 0, prospects: rp.count || 0, base: rb.error ? null : ((rb.data as { total: number }[])?.[0]?.total ?? 0) })
    })()
    return () => { vivo = false }
  }, [org, uf, mun, munsUf])

  const n = Math.max(0, Number(novos) || 0), t = Math.max(0, Number(ticket.replace(',', '.')) || 0), m = margem.trim() === '' ? null : Math.min(100, Math.max(0, Number(margem.replace(',', '.')) || 0))
  const cenarios = CEN.map((c) => {
    const clientes = Math.round(n * c.f), mensal = (clientes * t * freq) / 12, anual = clientes * t * freq
    return { ...c, clientes, mensal, anual, lucro: m == null ? null : anual * (m / 100) }
  })
  const maxAnual = Math.max(1, ...cenarios.map((c) => c.anual))
  const regiao = uf ? (munsUf.find((x) => String(x.ibge) === mun)?.nome ? munsUf.find((x) => String(x.ibge) === mun)!.nome + '/' + uf : uf) : 'a região escolhida'

  return (
    <div className="page">
      <div className="page-head"><div><h1>Simulador de expansão</h1><p>Estime o que a entrada em uma cidade ou região pode render. É uma simulação com os números que você informa.</p></div></div>
      <div className="dois-col">
        <section className="panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
          <div className="filtros">
            <label className="field"><span>Estado</span><select className="input" value={uf} onChange={(e) => { setUf(e.target.value); setMun('') }}><option value="">Escolha</option>{ufs.map((u) => <option key={u}>{u}</option>)}</select></label>
            <label className="field"><span>Cidade (opcional)</span><select className="input" value={mun} disabled={!uf} onChange={(e) => setMun(e.target.value)}><option value="">Estado inteiro</option>{munsUf.map((x) => <option key={x.ibge} value={x.ibge}>{x.nome}</option>)}</select></label>
          </div>
          {ref && (
            <div className="alert alert-info">Em {regiao} você já tem {fmt(ref.clientes)} {ref.clientes === 1 ? 'cliente' : 'clientes'} e {fmt(ref.prospects)} {ref.prospects === 1 ? 'prospect' : 'prospects'}.{ref.base != null && <> A base nacional conhece {fmt(ref.base)} empresas ainda fora da sua carteira, mas nem todas são do seu segmento.</>}</div>
          )}
          <label className="field"><span>Novos clientes que você espera conquistar</span><input className="input" type="number" min={0} value={novos} onChange={(e) => setNovos(e.target.value)} /></label>
          <label className="field"><span>Ticket médio por compra (R$)</span><input className="input" inputMode="decimal" value={ticket} onChange={(e) => setTicket(e.target.value)} /></label>
          <label className="field"><span>Frequência de compra de cada cliente</span><select className="input" value={freq} onChange={(e) => setFreq(Number(e.target.value))}>{FREQ.map(([r, v]) => <option key={v} value={v}>{r}</option>)}</select></label>
          <label className="field"><span>Margem de lucro % (opcional)</span><input className="input" inputMode="decimal" value={margem} onChange={(e) => setMargem(e.target.value)} placeholder="Ex.: 25" /></label>
        </section>
        <section style={{ display: 'grid', gap: 14 }}>
          <div className="sim-cards">
            {cenarios.map((c) => (
              <div key={c.chave} className="sim-card" style={{ borderTopColor: c.cor }}>
                <span className="small muted">{c.nome}</span>
                <b>{brl(c.mensal)}<small> /mês</small></b>
                <span>{brl(c.anual)} <span className="small muted">/ano</span></span>
                <span className="small muted">{fmt(c.clientes)} clientes ({Math.round(c.f * 100)}% da meta)</span>
                {c.lucro != null && <span className="small">Margem estimada: <b>{brl(c.lucro)}</b>/ano</span>}
              </div>))}
          </div>
          <div className="panel" style={{ padding: 16, display: 'grid', gap: 10 }}>
            <b>Comparação do faturamento anual</b>
            {cenarios.map((c) => (
              <div key={c.chave} className="sim-barra"><span>{c.nome}</span><div><i style={{ width: (c.anual / maxAnual) * 100 + '%', background: c.cor }} /></div><b>{brl(c.anual)}</b></div>))}
          </div>
          <p className="small muted">Simulação baseada nos valores informados. Não é previsão nem garantia de faturamento. O cenário conservador considera metade dos novos clientes esperados e o otimista, 40% a mais. Faturamento = clientes × ticket × compras por ano.</p>
        </section>
      </div>
    </div>
  )
}
