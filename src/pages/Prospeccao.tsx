import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSessao } from '../context/Sessao'
import { msgErro, supabase } from '../lib/supabase'
import { fmt, dataBR } from '../lib/format'
import { UF_NOMES } from '../lib/geo'
import { CATEGORIA_ROTULO, CONFIANCA_ROTULO, SITUACOES, SITUACAO_ROTULO, type LinhaBusca, type Situacao } from '../lib/prospeccao'
import FichaEstabelecimento from '../components/FichaEstabelecimento'
import FichaProspect from '../components/FichaProspect'

const POR_PAGINA = 50

function BaseNacional({ abrir }: { abrir: (id: number) => void }) {
  const { org, municipios, podeEditar, toast } = useSessao()
  const [uf, setUf] = useState('')
  const [mun, setMun] = useState('')
  const [q, setQ] = useState('')
  const [conf, setConf] = useState('')
  const [cat, setCat] = useState('')
  const [carteira, setCarteira] = useState(false)
  const [pag, setPag] = useState(0)
  const [linhas, setLinhas] = useState<LinhaBusca[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [totalBase, setTotalBase] = useState<number | null>(null)
  const [versao, setVersao] = useState(0)

  useEffect(() => { supabase.from('estabelecimentos').select('id', { count: 'exact', head: true }).then(({ count }) => setTotalBase(count || 0)) }, [])
  const munsUf = useMemo(() => municipios.filter((m) => m.uf === uf).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [municipios, uf])
  useEffect(() => setPag(0), [uf, mun, q, conf, cat, carteira])

  useEffect(() => {
    if (!org) return
    let vivo = true
    const t = setTimeout(async () => {
      setErro(null)
      const { data, error } = await supabase.rpc('buscar_estabelecimentos', {
        p_org: org.id, p_uf: uf || null, p_municipio: mun ? +mun : null, p_q: q.trim() || null,
        p_confiabilidade: conf || null, p_categoria: cat || null, p_ocultar_carteira: !carteira,
        p_limite: POR_PAGINA, p_offset: pag * POR_PAGINA,
      })
      if (!vivo) return
      if (error) setErro(msgErro(error)); else setLinhas(data as LinhaBusca[])
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [org, uf, mun, q, conf, cat, carteira, pag, versao])

  async function adicionar(id: number) {
    const { error } = await supabase.rpc('adicionar_prospect', { p_org: org!.id, p_estab: id })
    if (error) toast(msgErro(error)); else { toast('Adicionado aos seus prospects'); setVersao((v) => v + 1) }
  }

  const total = linhas?.[0]?.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  if (totalBase === 0) return (
    <section className="panel empty">
      <h2>A base nacional ainda está sendo carregada</h2>
      <p style={{ maxWidth: '60ch' }}>Todo mês um robô lê a base aberta de CNPJ da Receita Federal e separa as lojas de artigos religiosos, livrarias religiosas e distribuidoras do país. Assim que a primeira carga terminar, os estabelecimentos aparecem aqui e em laranja no mapa.</p>
    </section>
  )

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="filters">
        <label className="field grow"><span>Buscar</span><input id="p-q" className="input" type="search" placeholder="Nome, razão social ou CNPJ" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label className="field"><span>Estado</span>
          <select id="p-uf" className="input" value={uf} onChange={(e) => { setUf(e.target.value); setMun('') }}>
            <option value="">Todos</option>{Object.entries(UF_NOMES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </label>
        <label className="field"><span>Município</span>
          <select id="p-mun" className="input" value={mun} disabled={!uf} onChange={(e) => setMun(e.target.value)}>
            <option value="">{uf ? 'Todos' : 'Escolha o estado'}</option>{munsUf.map((m) => <option key={m.ibge} value={m.ibge}>{m.nome}</option>)}
          </select>
        </label>
        <label className="field"><span>Categoria</span>
          <select id="p-cat" className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Todas</option>{Object.entries(CATEGORIA_ROTULO).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
          </select>
        </label>
        <label className="field"><span>Confiabilidade</span>
          <select id="p-conf" className="input" value={conf} onChange={(e) => setConf(e.target.value)}>
            <option value="">Todas</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option>
          </select>
        </label>
        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 10 }}>
          <input id="p-cart" type="checkbox" checked={carteira} onChange={(e) => setCarteira(e.target.checked)} />Mostrar quem já está na carteira
        </label>
      </div>
      {erro && <div className="alert alert-err">{erro}</div>}
      <section className="panel">
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Estabelecimento</th><th>Cidade</th><th>Categoria</th><th>Confiabilidade</th><th>Telefone</th><th /></tr></thead>
            <tbody>
              {linhas === null ? <tr><td colSpan={6}><div className="empty"><div className="spinner" /></div></td></tr>
                : !linhas.length ? <tr><td colSpan={6}><div className="empty"><h2>Nenhum estabelecimento com esses filtros</h2><p>Tente outro estado ou limpe a busca.</p></div></td></tr>
                : linhas.map((l) => (
                  <tr key={l.id} className="click" tabIndex={0} onClick={() => abrir(l.id)} onKeyDown={(e) => e.key === 'Enter' && abrir(l.id)}>
                    <td><div style={{ fontWeight: 600 }}>{l.nome_fantasia || l.razao_social}</div>{l.nome_fantasia && l.razao_social && <div className="sub">{l.razao_social}</div>}</td>
                    <td>{l.cidade} <span className="sub">{l.uf}</span></td>
                    <td className="small">{CATEGORIA_ROTULO[l.categoria || ''] || '—'}</td>
                    <td>{l.confiabilidade && <span className={'pill conf-' + l.confiabilidade}>{CONFIANCA_ROTULO[l.confiabilidade]}</span>}</td>
                    <td className="mono" style={{ whiteSpace: 'nowrap' }}>{l.telefone}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      {l.ja_cliente ? <span className="pill pill-ativo">Cliente</span>
                        : l.prospect_id ? <span className="pill pill-potencial">Prospect</span>
                        : podeEditar && <button className="btn btn-sm" type="button" onClick={() => adicionar(l.id)}>Adicionar</button>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <span>{fmt(total)} estabelecimentos{totalBase ? ` · base nacional com ${fmt(totalBase)}` : ''}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-sm" type="button" disabled={pag === 0} onClick={() => setPag(pag - 1)}>Anterior</button>
            <span className="num">Página {pag + 1} de {paginas}</span>
            <button className="btn btn-sm" type="button" disabled={pag + 1 >= paginas} onClick={() => setPag(pag + 1)}>Próxima</button>
          </div>
        </div>
      </section>
    </div>
  )
}

interface LinhaProspect { id: string; nome: string; cidade: string | null; uf: string | null; situacao: Situacao; telefone: string | null; categoria: string | null; nota: number | null; atualizado_em: string; fonte: string }

function MeusProspects({ abrir, versao }: { abrir: (id: string) => void; versao: number }) {
  const { org } = useSessao()
  const [sit, setSit] = useState('')
  const [q, setQ] = useState('')
  const [linhas, setLinhas] = useState<LinhaProspect[] | null>(null)
  const [contagem, setContagem] = useState<Record<string, number>>({})
  const [total, setTotal] = useState(0)
  const [pag, setPag] = useState(0)

  useEffect(() => setPag(0), [sit, q])
  useEffect(() => {
    if (!org) return
    supabase.rpc('resumo_org', { p_org: org.id }).then(({ data }) => setContagem((data as { prospects_por_situacao: Record<string, number> })?.prospects_por_situacao || {}))
  }, [org, versao])
  useEffect(() => {
    if (!org) return
    let qb = supabase.from('prospects').select('id,nome,cidade,uf,situacao,telefone,categoria,nota,atualizado_em,fonte', { count: 'exact' }).eq('org_id', org.id)
    if (sit) qb = qb.eq('situacao', sit)
    const t = q.trim().replace(/[,()%]/g, ' ').trim()
    if (t) qb = qb.or(`nome.ilike.%${t}%,cidade.ilike.%${t}%`)
    qb.order('atualizado_em', { ascending: false }).range(pag * POR_PAGINA, pag * POR_PAGINA + POR_PAGINA - 1).then(({ data, count }) => { setLinhas((data as LinhaProspect[]) || []); setTotal(count || 0) })
  }, [org, sit, q, pag, versao])

  const soma = Object.values(contagem).reduce((a, b) => a + b, 0)
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="chips" role="group" aria-label="Situação">
        <button type="button" className="chip" aria-pressed={!sit} onClick={() => setSit('')}>Todos <small>{fmt(soma)}</small></button>
        {SITUACOES.map(([k, r]) => <button key={k} type="button" className="chip" aria-pressed={sit === k} onClick={() => setSit(k)}>{r} <small>{fmt(contagem[k] || 0)}</small></button>)}
      </div>
      <label className="field" style={{ maxWidth: 420 }}><span>Buscar</span><input id="mp-q" className="input" type="search" placeholder="Nome ou cidade" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <section className="panel">
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Prospect</th><th>Cidade</th><th>Situação</th><th>Telefone</th><th>Atualizado</th></tr></thead>
            <tbody>
              {linhas === null ? <tr><td colSpan={5}><div className="empty"><div className="spinner" /></div></td></tr>
                : !linhas.length ? <tr><td colSpan={5}><div className="empty"><h2>{soma ? 'Nenhum prospect com esse filtro' : 'Sua lista de prospects está vazia'}</h2><p>{soma ? 'Escolha outra situação.' : 'Na aba Base nacional, clique em Adicionar nos estabelecimentos que quer trabalhar.'}</p></div></td></tr>
                : linhas.map((l) => (
                  <tr key={l.id} className="click" tabIndex={0} onClick={() => abrir(l.id)} onKeyDown={(e) => e.key === 'Enter' && abrir(l.id)}>
                    <td><div style={{ fontWeight: 600 }}>{l.nome}</div><div className="sub">{CATEGORIA_ROTULO[l.categoria || ''] || ''}</div></td>
                    <td>{l.cidade} <span className="sub">{l.uf}</span></td>
                    <td><span className="pill pill-sit">{SITUACAO_ROTULO[l.situacao]}</span></td>
                    <td className="mono">{l.telefone}</td>
                    <td className="num">{dataBR(l.atualizado_em)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <span>{fmt(total)} prospects</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" type="button" disabled={pag === 0} onClick={() => setPag(pag - 1)}>Anterior</button>
            <button className="btn btn-sm" type="button" disabled={(pag + 1) * POR_PAGINA >= total} onClick={() => setPag(pag + 1)}>Próxima</button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default function Prospeccao() {
  const [sp, setSp] = useSearchParams()
  const aba = sp.get('aba') === 'meus' ? 'meus' : 'base'
  const [estab, setEstab] = useState<number | null>(null)
  const [prospect, setProspect] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Prospecção</h1><p>Lojas, livrarias e distribuidoras de artigos religiosos de todo o Brasil, a partir de dados públicos.</p></div>
      </div>
      <div className="auth-tabs" role="tablist" style={{ maxWidth: 420 }}>
        <button type="button" role="tab" aria-selected={aba === 'base'} aria-pressed={aba === 'base'} onClick={() => setSp({})}>Base nacional</button>
        <button type="button" role="tab" aria-selected={aba === 'meus'} aria-pressed={aba === 'meus'} onClick={() => setSp({ aba: 'meus' })}>Meus prospects</button>
      </div>
      {aba === 'base' ? <BaseNacional abrir={setEstab} /> : <MeusProspects abrir={setProspect} versao={versao} />}
      {estab !== null && <FichaEstabelecimento id={estab} onClose={() => setEstab(null)} onProspect={() => setVersao((v) => v + 1)} />}
      {prospect && <FichaProspect id={prospect} onClose={() => setProspect(null)} onChange={() => setVersao((v) => v + 1)} />}
    </div>
  )
}
