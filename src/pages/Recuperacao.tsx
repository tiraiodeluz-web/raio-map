import { useEffect, useMemo, useState } from 'react'
import { useSessao } from '../context/Sessao'
import { msgErro, supabase } from '../lib/supabase'
import { dataBR, fmt } from '../lib/format'
import { linkWhatsapp } from '../lib/fone'
import MiniMapa, { type PontoMini } from '../components/MiniMapa'
import FichaCliente from '../components/FichaCliente'

type Classe = 'ativo' | 'inativo' | 'nid'
interface Linha { id: string; nome: string; nome_fantasia: string | null; cidade: string | null; uf: string | null; lat: number | null; lng: number | null; telefones: string[]; contato: string | null; ultima_compra: string | null }
const COR: Record<Classe, string> = { ativo: '#2563c9', inativo: '#c8433a', nid: '#8a94a6' }
const ROTULO: Record<Classe, string> = { ativo: 'Ativo', inativo: 'Inativo', nid: 'Não identificado' }
const DIAS_PADRAO = 180

const diasSem = (d: string) => Math.floor((Date.now() - new Date(d + 'T12:00:00').getTime()) / 86400000)
function tempo(d: number) { return d < 31 ? `${d} dias` : d < 365 ? `${Math.round(d / 30)} meses` : `${(d / 365).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} anos` }

export default function Recuperacao() {
  const { org, ehAdmin, toast, recarregarOrgs } = useSessao()
  const [linhas, setLinhas] = useState<Linha[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const dias0 = Number((org?.config as { dias_inativo?: number } | undefined)?.dias_inativo) || DIAS_PADRAO
  const [dias, setDias] = useState(dias0)
  const [diasTxt, setDiasTxt] = useState(String(dias0))
  const [sit, setSit] = useState<'' | Classe>('inativo')
  const [uf, setUf] = useState('')
  const [cidade, setCidade] = useState('')
  const [q, setQ] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)

  useEffect(() => {
    if (!org) return
    let vivo = true
    ;(async () => {
      const out: Linha[] = []
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase.from('clientes').select('id,nome,nome_fantasia,cidade,uf,lat,lng,telefones,contato,ultima_compra').eq('org_id', org.id).order('id').range(de, de + 999)
        if (error) { vivo && setErro(msgErro(error)); return }
        out.push(...(data as Linha[])); if (!data || data.length < 1000) break
      }
      vivo && setLinhas(out)
    })()
    return () => { vivo = false }
  }, [org])

  const classe = (l: Linha): Classe => (!l.ultima_compra ? 'nid' : diasSem(l.ultima_compra) >= dias ? 'inativo' : 'ativo')
  const todos = useMemo(() => (linhas || []).map((l) => ({ l, c: classe(l), d: l.ultima_compra ? diasSem(l.ultima_compra) : null })), [linhas, dias]) // eslint-disable-line react-hooks/exhaustive-deps
  const total = { ativo: 0, inativo: 0, nid: 0 }; todos.forEach((x) => total[x.c]++)
  const ufs = useMemo(() => [...new Set(todos.map((x) => x.l.uf).filter(Boolean) as string[])].sort(), [todos])
  const cidades = useMemo(() => [...new Set(todos.filter((x) => !uf || x.l.uf === uf).map((x) => x.l.cidade).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR')), [todos, uf])
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    return todos.filter((x) => (!sit || x.c === sit) && (!uf || x.l.uf === uf) && (!cidade || x.l.cidade === cidade) && (!t || x.l.nome.toLowerCase().includes(t) || (x.l.nome_fantasia || '').toLowerCase().includes(t)))
      .sort((a, b) => (b.d ?? -1) - (a.d ?? -1))
  }, [todos, sit, uf, cidade, q])
  const pontos: PontoMini[] = useMemo(() => lista.filter((x) => x.l.lat != null && x.l.lng != null).slice(0, 5000)
    .map((x) => ({ id: x.l.id, lat: x.l.lat!, lng: x.l.lng!, cor: COR[x.c], titulo: `${x.l.nome} · ${ROTULO[x.c]}${x.d != null ? ' · ' + tempo(x.d) + ' sem comprar' : ''}` })), [lista])

  async function salvarDias() {
    if (!org) return
    const n = Math.round(Number(diasTxt))
    if (!(n >= 30 && n <= 1825)) return toast('Informe entre 30 e 1825 dias.')
    const { error } = await supabase.from('organizacoes').update({ config: { ...(org.config || {}), dias_inativo: n } }).eq('id', org.id)
    if (error) return toast(msgErro(error))
    setDias(n); await recarregarOrgs(); toast(`Cliente sem comprar há ${n} dias ou mais passa a ser inativo.`)
  }

  if (erro) return <div className="page"><div className="alert alert-warn">{erro}</div></div>
  if (!linhas) return <div className="center-fill"><div className="spinner" aria-label="Carregando" /></div>
  const semData = total.nid
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Clientes inativos</h1><p>Quem já comprou e parou de comprar, para você agir e recuperar.</p></div>
        {ehAdmin && (
          <div className="filtros">
            <label className="field"><span>Inativo após (dias sem comprar)</span><input className="input" type="number" min={30} max={1825} value={diasTxt} onChange={(e) => setDiasTxt(e.target.value)} /></label>
            <button className="btn" type="button" onClick={salvarDias} disabled={Number(diasTxt) === dias}>Salvar regra</button>
          </div>
        )}
      </div>

      <div className="kpis">
        <button type="button" className="kpi" onClick={() => setSit('')} style={{ textAlign: 'left' }}><span>Total de clientes</span><b>{fmt(linhas.length)}</b><small>todos os cadastrados</small></button>
        {(['ativo', 'inativo', 'nid'] as Classe[]).map((k) => (
          <button type="button" key={k} className="kpi" onClick={() => setSit(k)} style={{ textAlign: 'left', outline: sit === k ? '2px solid ' + COR[k] : undefined }}>
            <span>{ROTULO[k]}</span><b style={{ color: COR[k] }}>{fmt(total[k])}</b>
            <small>{k === 'ativo' ? `compraram nos últimos ${dias} dias` : k === 'inativo' ? `sem comprar há ${dias} dias ou mais` : 'sem data de última compra'}</small>
          </button>
        ))}
      </div>

      {semData > 0 && (
        <div className="alert alert-info">
          {fmt(semData)} {semData === 1 ? 'cliente não tem' : 'clientes não têm'} data de última compra e por isso ficam como "Não identificado": o sistema não presume que estejam inativos.
          {' '}Para classificar, importe a planilha com a coluna de última compra ou preencha a data na ficha do cliente.
        </div>
      )}

      <div className="filtros">
        <label className="field"><span>Situação</span>
          <select className="input" value={sit} onChange={(e) => setSit(e.target.value as '' | Classe)}>
            <option value="">Todas</option><option value="inativo">Inativos</option><option value="ativo">Ativos</option><option value="nid">Não identificados</option>
          </select></label>
        <label className="field"><span>Estado</span>
          <select className="input" value={uf} onChange={(e) => { setUf(e.target.value); setCidade('') }}><option value="">Todos</option>{ufs.map((u) => <option key={u}>{u}</option>)}</select></label>
        <label className="field"><span>Cidade</span>
          <select className="input" value={cidade} onChange={(e) => setCidade(e.target.value)}><option value="">Todas</option>{cidades.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="field" style={{ flex: 1, minWidth: 200 }}><span>Buscar por nome</span><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome ou nome fantasia" /></label>
      </div>

      {!linhas.length ? (
        <div className="empty"><h2>Nenhum cliente ainda</h2><p>Importe sua carteira para ver quem está inativo.</p></div>
      ) : (
        <div className="dois-col">
          <section className="panel">
            <div className="panel-h"><h2>{fmt(lista.length)} {lista.length === 1 ? 'cliente' : 'clientes'}</h2><span className="small muted">mais tempo sem comprar primeiro</span></div>
            <div className="table-wrap" style={{ maxHeight: 520, overflow: 'auto' }}><table className="t">
              <thead><tr><th>Cliente</th><th>Última compra</th><th>Situação</th><th /></tr></thead>
              <tbody>
                {!lista.length && <tr><td colSpan={4}><div className="empty"><p>Nenhum cliente com esses filtros.</p></div></td></tr>}
                {lista.slice(0, 300).map(({ l, c, d }) => {
                  const wa = linkWhatsapp(l.telefones || [], `Olá${l.contato ? ', ' + l.contato.split(' ')[0] : ''}! Faz um tempo que não nos falamos. Posso te ajudar com um novo pedido?`)
                  return (
                    <tr key={l.id}>
                      <td><button type="button" className="link" onClick={() => setAberto(l.id)}>{l.nome_fantasia || l.nome}</button><div className="small muted">{[l.cidade, l.uf].filter(Boolean).join(' / ') || 'sem cidade'}</div></td>
                      <td>{l.ultima_compra ? <>{dataBR(l.ultima_compra)}<div className="small muted">{tempo(d!)} sem comprar</div></> : <span className="sem-dado">não informada</span>}</td>
                      <td><span className={'pill ' + (c === 'nid' ? 'pill-nid' : 'pill-' + c)}>{ROTULO[c]}</span></td>
                      <td>{wa ? <a className="btn" href={wa} target="_blank" rel="noreferrer">WhatsApp</a> : <span className="small sem-dado" title="Sem telefone válido">sem telefone</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
            {lista.length > 300 && <div className="panel-b small muted">Mostrando 300 de {fmt(lista.length)}. Use os filtros para refinar.</div>}
          </section>
          <section>
            <MiniMapa pontos={pontos} onClick={setAberto} />
            <div className="small muted" style={{ marginTop: 8, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {(['ativo', 'inativo', 'nid'] as Classe[]).map((k) => <span key={k}><span className="dot" style={{ background: COR[k], display: 'inline-block', width: 9, height: 9, borderRadius: '50%' }} /> {ROTULO[k]}</span>)}
              <span>{fmt(pontos.length)} no mapa{lista.length - pontos.length > 0 ? ` · ${fmt(lista.length - pontos.length)} sem localização` : ''}</span>
            </div>
          </section>
        </div>
      )}
      {aberto && <FichaCliente id={aberto} onClose={() => setAberto(null)} />}
    </div>
  )
}
