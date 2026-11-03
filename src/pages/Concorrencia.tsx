import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSessao } from '../context/Sessao'
import { msgErro, supabase } from '../lib/supabase'
import { fmt } from '../lib/format'
import { ehPago } from '../lib/plano'
import Bloqueado from '../components/Bloqueado'
import MiniMapa, { type PontoMini } from '../components/MiniMapa'
import type { LinhaBusca } from '../lib/prospeccao'

interface Cat { chave: string; rotulo: string; cor: string; ativa: boolean }
interface Cls { estabelecimento_id: number; categoria: string; observacao: string | null; evidencia: string | null }
const PADRAO: Cat[] = [
  { chave: 'concorrente', rotulo: 'Concorrente direto', cor: '#c8433a', ativa: true },
  { chave: 'potencial', rotulo: 'Potencial cliente', cor: '#e07b22', ativa: true },
  { chave: 'distribuidor', rotulo: 'Distribuidor', cor: '#7a4fd0', ativa: true },
  { chave: 'revendedor', rotulo: 'Revendedor', cor: '#0f9d8a', ativa: true },
  { chave: 'fornecedor', rotulo: 'Fornecedor', cor: '#2563c9', ativa: true },
  { chave: 'irrelevante', rotulo: 'Não relevante', cor: '#8a94a6', ativa: true },
]
const SEM = '__sem'
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30)

export default function Concorrencia() {
  const { org } = useSessao()
  if (!ehPago(org)) {
    return <Bloqueado titulo="Inteligência de concorrência" descricao="Encontre estabelecimentos por região, classifique como concorrente, distribuidor, revendedor ou potencial cliente e anote o que descobrir. As categorias são suas." />
  }
  return <Tela />
}

function Tela() {
  const { org, municipios, ehAdmin, podeEditar, toast } = useSessao()
  const [cats, setCats] = useState<Cat[]>(PADRAO)
  const [cls, setCls] = useState<Map<number, Cls>>(new Map())
  const [uf, setUf] = useState(''); const [mun, setMun] = useState(''); const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState('')
  const [res, setRes] = useState<LinhaBusca[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sel, setSel] = useState<LinhaBusca | null>(null)
  const [gerir, setGerir] = useState(false)
  const munsUf = useMemo(() => municipios.filter((m) => m.uf === uf).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [municipios, uf])
  const ufs = useMemo(() => [...new Set(municipios.map((m) => m.uf))].sort(), [municipios])

  const carregarBase = useCallback(async () => {
    if (!org) return
    const [c, k] = await Promise.all([
      supabase.from('conc_categorias').select('chave,rotulo,cor,ativa').eq('org_id', org.id),
      supabase.from('conc_classificacoes').select('estabelecimento_id,categoria,observacao,evidencia').eq('org_id', org.id).limit(10000),
    ])
    if (c.data) {
      const m = new Map((c.data as Cat[]).map((x) => [x.chave, x]))
      const junto = PADRAO.map((p) => m.get(p.chave) || p)
      for (const x of c.data as Cat[]) if (!PADRAO.some((p) => p.chave === x.chave)) junto.push(x)
      setCats(junto)
    }
    setCls(new Map(((k.data as Cls[]) || []).map((x) => [x.estabelecimento_id, x])))
  }, [org])
  useEffect(() => { carregarBase() }, [carregarBase])

  async function buscar(e?: FormEvent) {
    e?.preventDefault()
    if (!org) return
    if (!uf) return setErro('Escolha o estado da região que quer analisar.')
    setBusy(true); setErro(null)
    const { data, error } = await supabase.rpc('buscar_estabelecimentos', { p_org: org.id, p_uf: uf, p_municipio: mun ? Number(mun) : null, p_q: q.trim() || null, p_ocultar_carteira: false, p_limite: 300, p_offset: 0 })
    setBusy(false)
    if (error) return setErro(msgErro(error))
    setRes((data as LinhaBusca[]) || []); setSel(null)
  }

  const ativas = cats.filter((c) => c.ativa)
  const catDe = (id: number) => { const k = cls.get(id); return k ? cats.find((c) => c.chave === k.categoria) : undefined }
  const lista = useMemo(() => (res || []).filter((l) => {
    const k = cls.get(l.id)
    if (filtro === SEM) return !k
    if (filtro) return k?.categoria === filtro
    return !k || cats.find((c) => c.chave === k.categoria)?.ativa !== false
  }), [res, cls, filtro, cats])
  const pontos: PontoMini[] = useMemo(() => lista.filter((l) => l.lat != null && l.lng != null).map((l) => {
    const c = catDe(l.id); return { id: String(l.id), lat: l.lat!, lng: l.lng!, cor: c?.cor || '#b4bccb', titulo: `${l.nome_fantasia || l.razao_social} · ${c?.rotulo || 'Sem classificação'}` }
  }), [lista, cls, cats]) // eslint-disable-line react-hooks/exhaustive-deps
  const contagem = useMemo(() => { const m: Record<string, number> = {}; (res || []).forEach((l) => { const k = cls.get(l.id)?.categoria || SEM; m[k] = (m[k] || 0) + 1 }); return m }, [res, cls])

  async function salvar(l: LinhaBusca, categoria: string, observacao: string, evidencia: string) {
    if (!org) return
    const { data: u } = await supabase.auth.getUser()
    if (!categoria) {
      const { error } = await supabase.from('conc_classificacoes').delete().eq('org_id', org.id).eq('estabelecimento_id', l.id)
      if (error) return toast(msgErro(error))
      setCls((m) => { const n = new Map(m); n.delete(l.id); return n }); return toast('Classificação removida.')
    }
    const row = { org_id: org.id, estabelecimento_id: l.id, categoria, observacao: observacao.trim() || null, evidencia: evidencia.trim() || null, por: u.user?.id, atualizado_em: new Date().toISOString() }
    const { error } = await supabase.from('conc_classificacoes').upsert(row, { onConflict: 'org_id,estabelecimento_id' })
    if (error) return toast(msgErro(error))
    setCls((m) => new Map(m).set(l.id, { estabelecimento_id: l.id, categoria, observacao: row.observacao, evidencia: row.evidencia })); toast('Classificação salva.')
  }
  async function virarProspect(l: LinhaBusca) {
    if (!org) return
    const { error } = await supabase.rpc('adicionar_prospect', { p_org: org.id, p_estab: l.id })
    if (error) return toast(msgErro(error))
    setRes((r) => (r || []).map((x) => (x.id === l.id ? { ...x, prospect_id: 'novo' } : x))); toast('Adicionado à lista de prospects.')
  }
  async function salvarCat(c: Cat) {
    if (!org) return
    const { error } = await supabase.from('conc_categorias').upsert({ org_id: org.id, ...c }, { onConflict: 'org_id,chave' })
    if (error) return toast(msgErro(error))
    setCats((l) => { const i = l.findIndex((x) => x.chave === c.chave); if (i < 0) return [...l, c]; const n = [...l]; n[i] = c; return n })
  }

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Concorrência e oportunidades</h1><p>Classifique os estabelecimentos de uma região e anote o que você sabe. A base nacional só sugere; quem decide é você.</p></div>
        {ehAdmin && <button className="btn" type="button" onClick={() => setGerir((g) => !g)}>{gerir ? 'Fechar categorias' : 'Editar categorias'}</button>}
      </div>
      {gerir && <GerirCats cats={cats} onSalvar={salvarCat} />}
      <form className="filtros" onSubmit={buscar}>
        <label className="field"><span>Estado</span><select className="input" value={uf} onChange={(e) => { setUf(e.target.value); setMun('') }}><option value="">Escolha</option>{ufs.map((u) => <option key={u}>{u}</option>)}</select></label>
        <label className="field"><span>Cidade</span><select className="input" value={mun} disabled={!uf} onChange={(e) => setMun(e.target.value)}><option value="">Todas</option>{munsUf.map((m) => <option key={m.ibge} value={m.ibge}>{m.nome}</option>)}</select></label>
        <label className="field" style={{ flex: 1, minWidth: 200 }}><span>Nome ou CNPJ</span><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Opcional" /></label>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Buscando…' : 'Buscar na região'}</button>
      </form>
      {erro && <div className="alert alert-err" role="alert">{erro}</div>}
      {res && (
        <>
          <div className="filtros" role="group" aria-label="Filtrar por categoria">
            <button type="button" className={'btn' + (filtro === '' ? ' btn-primary' : '')} onClick={() => setFiltro('')}>Todos ({fmt(res.length)})</button>
            <button type="button" className={'btn' + (filtro === SEM ? ' btn-primary' : '')} onClick={() => setFiltro(SEM)}>Sem classificação ({fmt(contagem[SEM] || 0)})</button>
            {ativas.map((c) => <button key={c.chave} type="button" className={'btn' + (filtro === c.chave ? ' btn-primary' : '')} onClick={() => setFiltro(c.chave)}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: c.cor, marginRight: 6 }} />{c.rotulo} ({fmt(contagem[c.chave] || 0)})</button>)}
          </div>
          <div className="dois-col">
            <section className="panel">
              <div className="panel-h"><h2>{fmt(lista.length)} estabelecimentos</h2><span className="small muted">{res.length >= 300 ? 'primeiros 300; refine a busca' : 'na região'}</span></div>
              <div className="table-wrap" style={{ maxHeight: 520, overflow: 'auto' }}><table className="t">
                <thead><tr><th>Estabelecimento</th><th>Classificação</th></tr></thead>
                <tbody>
                  {!lista.length && <tr><td colSpan={2}><div className="empty"><p>Nada nesta categoria.</p></div></td></tr>}
                  {lista.map((l) => { const c = catDe(l.id); return (
                    <tr key={l.id} onClick={() => setSel(l)} style={{ cursor: 'pointer', background: sel?.id === l.id ? '#eef4fd' : undefined }}>
                      <td><b>{l.nome_fantasia || l.razao_social}</b><div className="small muted">{l.cidade} / {l.uf}{l.ja_cliente ? ' · já é cliente' : ''}</div></td>
                      <td>{c ? <span className="pill" style={{ background: c.cor + '22', color: c.cor }}>{c.rotulo}</span> : <span className="sem-dado">sem classificação</span>}</td>
                    </tr>) })}
                </tbody>
              </table></div>
            </section>
            <section style={{ display: 'grid', gap: 14 }}>
              <MiniMapa pontos={pontos} onClick={(id) => setSel(res.find((x) => String(x.id) === id) || null)} altura={320} />
              {sel && <Editor key={sel.id} l={sel} cats={ativas} atual={cls.get(sel.id)} podeEditar={podeEditar} onSalvar={salvar} onProspect={() => virarProspect(sel)} />}
            </section>
          </div>
        </>
      )}
      {!res && <div className="empty"><h2>Escolha uma região</h2><p>Selecione estado e cidade para listar os estabelecimentos e classificá-los.</p></div>}
    </div>
  )
}

function Editor({ l, cats, atual, podeEditar, onSalvar, onProspect }: { l: LinhaBusca; cats: Cat[]; atual?: Cls; podeEditar: boolean; onSalvar: (l: LinhaBusca, c: string, o: string, e: string) => void; onProspect: () => void }) {
  const [c, setC] = useState(atual?.categoria || ''); const [o, setO] = useState(atual?.observacao || ''); const [e, setE] = useState(atual?.evidencia || '')
  const oportunidade = c === 'potencial' && !l.ja_cliente
  return (
    <div className="panel" style={{ padding: 16, display: 'grid', gap: 10 }}>
      <div><b>{l.nome_fantasia || l.razao_social}</b><div className="small muted">{l.razao_social}{l.cnpj ? ' · CNPJ ' + l.cnpj : ''}</div>
        <div className="small muted">{[l.telefone, l.email].filter(Boolean).join(' · ') || 'sem contato na base'}</div>
        <div className="small muted">Atividade na base: {l.categoria || 'não informada'} (sugestão da base, não confirmada)</div></div>
      <label className="field"><span>Classificação</span>
        <select className="input" value={c} disabled={!podeEditar} onChange={(ev) => setC(ev.target.value)}><option value="">Sem classificação</option>{cats.map((x) => <option key={x.chave} value={x.chave}>{x.rotulo}</option>)}</select></label>
      <label className="field"><span>Como você sabe? (evidência)</span><input className="input" value={e} disabled={!podeEditar} onChange={(ev) => setE(ev.target.value)} placeholder="Ex.: visitei a loja, site vende o mesmo produto" /></label>
      <label className="field"><span>Observações</span><textarea className="input" rows={3} value={o} disabled={!podeEditar} onChange={(ev) => setO(ev.target.value)} /></label>
      {podeEditar && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" type="button" onClick={() => onSalvar(l, c, o, e)}>Salvar</button>
        {oportunidade && !l.prospect_id && <button className="btn" type="button" onClick={onProspect}>Adicionar como prospect</button>}
        {oportunidade && l.prospect_id && <span className="small muted">Oportunidade já está nos prospects.</span>}
      </div>}
    </div>
  )
}

function GerirCats({ cats, onSalvar }: { cats: Cat[]; onSalvar: (c: Cat) => void }) {
  const [novo, setNovo] = useState('')
  return (
    <section className="panel" style={{ padding: 16, display: 'grid', gap: 10 }}>
      <b>Categorias da sua empresa</b>
      {cats.map((c) => (
        <div key={c.chave} className="filtros" style={{ alignItems: 'center' }}>
          <input type="color" value={c.cor} aria-label={'Cor de ' + c.rotulo} onChange={(e) => onSalvar({ ...c, cor: e.target.value })} />
          <input className="input" defaultValue={c.rotulo} aria-label="Nome da categoria" onBlur={(e) => e.target.value.trim() && e.target.value !== c.rotulo && onSalvar({ ...c, rotulo: e.target.value.trim() })} />
          <label className="small"><input type="checkbox" checked={c.ativa} onChange={(e) => onSalvar({ ...c, ativa: e.target.checked })} /> Ativa</label>
        </div>
      ))}
      <form className="filtros" onSubmit={(e) => { e.preventDefault(); const r = novo.trim(); const k = slug(r); if (!k || cats.some((c) => c.chave === k)) return; onSalvar({ chave: k, rotulo: r, cor: '#475569', ativa: true }); setNovo('') }}>
        <input className="input" value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Nova categoria (ex.: Parceiro)" />
        <button className="btn" type="submit">Adicionar categoria</button>
      </form>
    </section>
  )
}
