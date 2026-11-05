import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSessao } from '../context/Sessao'
import { msgErro, supabase } from '../lib/supabase'
import { fmt, dataBR } from '../lib/format'
import { UF_NOMES } from '../lib/geo'
import { CONFIANCA_ROTULO, esquecer, lembrado, lembrar, SITUACOES, SITUACAO_ROTULO, useSegmento, type LinhaBusca, type Situacao } from '../lib/prospeccao'
import FichaEstabelecimento from '../components/FichaEstabelecimento'
import FichaProspect from '../components/FichaProspect'
import { baixarCsv } from '../lib/csv'
import { podeExportar } from '../lib/plano'
import { chamarBatePapo, seloTelefone, textoResultado } from '../lib/chat'

const POR_PAGINA = 50

let filtrosBase = { uf: '', mun: '', q: '', conf: '', cat: '', carteira: false, pag: 0 }

function BaseNacional({ abrir }: { abrir: (id: number) => void }) {
  const { org, municipios, podeEditar, toast } = useSessao()
  const { seg, rotulo, categorias } = useSegmento()
  // filtros e página ficam guardados enquanto o app estiver aberto, para voltar de onde parou
  const salvo = filtrosBase
  const [uf, setUf] = useState(salvo.uf)
  const [mun, setMun] = useState(salvo.mun)
  const [q, setQ] = useState(salvo.q)
  const [conf, setConf] = useState(salvo.conf)
  const [cat, setCat] = useState(salvo.cat)
  const [carteira, setCarteira] = useState(salvo.carteira)
  const [pag, setPag] = useState(salvo.pag)
  const [erro, setErro] = useState<string | null>(null)
  const [totalBase, setTotalBase] = useState<number | null>(() => lembrado<number>('total-base', 30 * 60000) ?? null)
  const [versao, setVersao] = useState(0)
  const chave = org ? 'busca:' + JSON.stringify([org.id, uf, mun, q.trim(), conf, cat, carteira, pag]) : ''
  const [linhas, setLinhas] = useState<LinhaBusca[] | null>(() => (chave && lembrado<LinhaBusca[]>(chave, 5 * 60000)) || null)

  useEffect(() => { filtrosBase = { uf, mun, q, conf, cat, carteira, pag } }, [uf, mun, q, conf, cat, carteira, pag])
  useEffect(() => {
    if (totalBase !== null) return
    supabase.from('estabelecimentos').select('id', { count: 'estimated', head: true }).then(({ count }) => { setTotalBase(count || 0); lembrar('total-base', count || 0) })
  }, [totalBase])
  const munsUf = useMemo(() => municipios.filter((m) => m.uf === uf).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [municipios, uf])
  const primeiro = useRef(true)
  useEffect(() => { if (primeiro.current) { primeiro.current = false; return } setPag(0) }, [uf, mun, q, conf, cat, carteira])

  useEffect(() => {
    if (!org) return
    const guardado = lembrado<LinhaBusca[]>(chave, 5 * 60000)
    if (guardado) { setLinhas(guardado); return }
    let vivo = true
    const t = setTimeout(async () => {
      setErro(null)
      const { data, error } = await supabase.rpc('buscar_estabelecimentos', {
        p_org: org.id, p_uf: uf || null, p_municipio: mun ? +mun : null, p_q: q.trim() || null,
        p_confiabilidade: conf || null, p_categoria: cat || null, p_ocultar_carteira: !carteira,
        p_limite: POR_PAGINA, p_offset: pag * POR_PAGINA,
      })
      if (!vivo) return
      if (error) setErro(msgErro(error)); else { setLinhas(data as LinhaBusca[]); lembrar(chave, data) }
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [chave, versao]) // eslint-disable-line react-hooks/exhaustive-deps

  async function adicionar(id: number) {
    const { error } = await supabase.rpc('adicionar_prospect', { p_org: org!.id, p_estab: id })
    if (error) toast(msgErro(error)); else { toast('Adicionado aos seus prospects'); esquecer('busca:'); esquecer('potenciais:'); setVersao((v) => v + 1) }
  }

  const total = linhas?.[0]?.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  if (totalBase === 0) return (
    <section className="panel empty">
      <h2>A base nacional ainda está sendo carregada</h2>
      <p style={{ maxWidth: '60ch' }}>Todo mês um robô lê a base aberta de CNPJ da Receita Federal e separa as empresas do seu segmento ({seg?.publico || 'potenciais compradores'}) em todo o país. Assim que a primeira carga terminar, os estabelecimentos aparecem aqui e em laranja no mapa.</p>
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
            <option value="">Todas</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
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
                    <td className="small">{rotulo(l.categoria)}</td>
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

interface LinhaProspect { id: string; email?: string | null; nome: string; cidade: string | null; uf: string | null; situacao: Situacao; telefone: string | null; categoria: string | null; nota: number | null; atualizado_em: string; fonte: string; chat_enviado_em: string | null; tipo_telefone: string | null; whatsapp_status: string | null; chat_bloqueado: boolean }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filtroTel(qb: any, tel: string) {
  if (tel === 'celular') return qb.eq('tipo_telefone', 'celular').or('whatsapp_status.is.null,whatsapp_status.eq.valido')
  if (tel === 'fixo') return qb.eq('tipo_telefone', 'fixo')
  if (tel === 'whatsapp_ok') return qb.eq('whatsapp_status', 'valido')
  if (tel === 'sem_whatsapp') return qb.eq('whatsapp_status', 'invalido')
  if (tel === 'sem_telefone') return qb.or('tipo_telefone.is.null,tipo_telefone.eq.invalido')
  return qb
}

function MeusProspects({ abrir, versao }: { abrir: (id: string) => void; versao: number }) {
  const { org, toast, podeEditar, ehAdmin } = useSessao()
  const navigate = useNavigate()
  const { rotulo } = useSegmento()
  const [conectado, setConectado] = useState<boolean | null>(null)
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set())
  const [enviando, setEnviando] = useState(false)
  const [recarga, setRecarga] = useState(0)
  const [tel, setTel] = useState('')
  const [incluirFixos, setIncluirFixos] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [sit, setSit] = useState('')
  const [q, setQ] = useState('')
  const [linhas, setLinhas] = useState<LinhaProspect[] | null>(null)
  const vistos = useRef(new Map<string, { nome: string; email: string | null }>())
  const [emailAberto, setEmailAberto] = useState(false)
  const pago = podeExportar(org)
  const [contagem, setContagem] = useState<Record<string, number>>({})
  const [total, setTotal] = useState(0)
  const [pag, setPag] = useState(0)

  useEffect(() => setPag(0), [sit, q, tel])
  useEffect(() => {
    if (!org) return
    supabase.rpc('bate_papo_conectado', { p_org: org.id }).then(({ data }) => setConectado(!!data))
  }, [org])
  useEffect(() => {
    if (!org) return
    supabase.rpc('resumo_org', { p_org: org.id }).then(({ data }) => setContagem((data as { prospects_por_situacao: Record<string, number> })?.prospects_por_situacao || {}))
  }, [org, versao])
  useEffect(() => {
    if (!org) return
    let qb = supabase.from('prospects').select('id,email,nome,cidade,uf,situacao,telefone,categoria,nota,atualizado_em,fonte,chat_enviado_em,tipo_telefone,whatsapp_status,chat_bloqueado', { count: 'exact' }).eq('org_id', org.id)
    if (sit) qb = qb.eq('situacao', sit)
    qb = filtroTel(qb, tel)
    const t = q.trim().replace(/[,()%]/g, ' ').trim()
    if (t) qb = qb.or(`nome.ilike.%${t}%,cidade.ilike.%${t}%`)
    qb.order('atualizado_em', { ascending: false }).range(pag * POR_PAGINA, pag * POR_PAGINA + POR_PAGINA - 1).then(({ data, count }) => { (data as LinhaProspect[] | null)?.forEach((l) => vistos.current.set(l.id, { nome: l.nome, email: l.email || null })); setLinhas((data as LinhaProspect[]) || []); setTotal(count || 0) })
  }, [org, sit, q, pag, versao, recarga, tel])

  async function conectarBatePapo() {
    if (!org) return
    if (!conectado) {
      if (ehAdmin) { toast('Falta informar o endereço do n8n.'); return navigate('/configuracoes') }
      return toast('O bate-papo ainda não foi conectado. Peça a um admin em Configurações > Bate-papo.')
    }
    const ids = [...escolhidos]
    if (!ids.length) return toast('Marque os prospects que quer enviar.')
    if (!window.confirm(`Enviar ${ids.length} prospect${ids.length > 1 ? 's' : ''} ao bate-papo para abordagem pelo WhatsApp?`)) return
    setEnviando(true)
    try { const r = await chamarBatePapo(org.id, 'enviar', ids, incluirFixos); toast(textoResultado(r)); setEscolhidos(new Set()); setRecarga((n) => n + 1) }
    catch (e) { toast((e as Error).message) } finally { setEnviando(false) }
  }
  const alternar = (id: string) => setEscolhidos((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  async function exportar() {
    if (!org) return
    setExportando(true)
    try {
      const { error } = await supabase.rpc('registrar_exportacao', { p_org: org.id })
      if (error) throw error
      const todos: Record<string, unknown>[] = []
      for (let de = 0; ; de += 1000) {
        let qb = supabase.from('prospects').select('nome,documento,categoria,situacao,telefone,email,site,instagram,logradouro,bairro,cep,cidade,uf,observacoes,criado_em,atualizado_em').eq('org_id', org.id)
        if (sit) qb = qb.eq('situacao', sit)
        qb = filtroTel(qb, tel)
        const t = q.trim().replace(/[,()%]/g, ' ').trim()
        if (t) qb = qb.or(`nome.ilike.%${t}%,cidade.ilike.%${t}%`)
        const { data, error: e2 } = await qb.order('nome').range(de, de + 999)
        if (e2) throw e2
        todos.push(...(data || [])); if (!data || data.length < 1000) break
      }
      const cab = ['Nome', 'CNPJ', 'Categoria', 'Situação', 'Telefone', 'E-mail', 'Site', 'Instagram', 'Endereço', 'Bairro', 'CEP', 'Cidade', 'UF', 'Observações', 'Na lista desde', 'Atualizado em']
      baixarCsv(`prospects-${sit || 'todos'}-${new Date().toISOString().slice(0, 10)}.csv`, cab, todos.map((p) => [
        p.nome, p.documento, rotulo(p.categoria as string), SITUACAO_ROTULO[p.situacao as Situacao], p.telefone, p.email, p.site, p.instagram,
        p.logradouro, p.bairro, p.cep, p.cidade, p.uf, p.observacoes, dataBR(p.criado_em as string), dataBR(p.atualizado_em as string)]))
      toast(`${fmt(todos.length)} prospects exportados`)
    } catch (e) { toast(msgErro(e)) } finally { setExportando(false) }
  }

  const soma = Object.values(contagem).reduce((a, b) => a + b, 0)
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="chips" role="group" aria-label="Situação">
        <button type="button" className="chip" aria-pressed={!sit} onClick={() => setSit('')}>Todos <small>{fmt(soma)}</small></button>
        {SITUACOES.map(([k, r]) => <button key={k} type="button" className="chip" aria-pressed={sit === k} onClick={() => setSit(k)}>{r} <small>{fmt(contagem[k] || 0)}</small></button>)}
      </div>
      <div className="filters">
        <label className="field grow" style={{ maxWidth: 420 }}><span>Buscar</span><input id="mp-q" className="input" type="search" placeholder="Nome ou cidade" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label className="field"><span>Telefone</span>
          <select id="mp-tel" className="input" value={tel} onChange={(e) => setTel(e.target.value)}>
            <option value="">Todos</option><option value="celular">Celular (bom para WhatsApp)</option><option value="fixo">Fixo (para ligar)</option>
            <option value="whatsapp_ok">WhatsApp confirmado</option><option value="sem_whatsapp">Sem WhatsApp</option><option value="sem_telefone">Sem telefone</option>
          </select>
        </label>
      </div>
      <div className="acoes-lista">
        <span className="small muted">{escolhidos.size ? `${fmt(escolhidos.size)} marcado${escolhidos.size > 1 ? 's' : ''}` : 'Marque os prospects na lista para enviar'}</span>
        <button className="btn" type="button" onClick={exportar} disabled={exportando || !total || !podeExportar(org)} title={podeExportar(org) ? undefined : 'Exportar planilha está disponível nos planos pagos'}>{exportando ? 'Exportando…' : podeExportar(org) ? 'Exportar planilha' : 'Exportar planilha (plano pago)'}</button>
        {podeEditar && <button className="btn" type="button" disabled={!pago} title={pago ? undefined : 'Enviar e-mail está disponível nos planos pagos'} onClick={() => setEmailAberto(true)}>{pago ? `Enviar e-mail${escolhidos.size ? ` (${escolhidos.size})` : ''}` : 'Enviar e-mail (plano pago)'}</button>}
        {podeEditar && <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={incluirFixos} onChange={(e) => setIncluirFixos(e.target.checked)} />Enviar fixos também</label>}
        {podeEditar && <button className="btn btn-primary" type="button" onClick={conectarBatePapo} disabled={enviando || !pago} title={pago ? undefined : 'Conectar bate-papo está disponível nos planos pagos'}>{enviando ? 'Enviando…' : pago ? `Conectar bate-papo${escolhidos.size ? ` (${escolhidos.size})` : ''}` : 'Conectar bate-papo (plano pago)'}</button>}
      </div>
      <p className="small muted" style={{ margin: '-8px 0 0' }}>Exportar planilha usa o filtro atual. Enviar e-mail escreve uma mensagem para todos os marcados. Conectar bate-papo envia os marcados ao WhatsApp.</p>
      {emailAberto && <EmailEmMassa ids={[...escolhidos]} vistos={vistos.current} onClose={() => setEmailAberto(false)} />}
      <section className="panel">
        <div className="table-wrap">
          <table className="t">
            <thead><tr>{podeEditar && <th style={{ width: 36 }}><input type="checkbox" aria-label="Marcar todos da página" checked={!!linhas?.length && linhas.every((l) => escolhidos.has(l.id))} onChange={(e) => setEscolhidos((s) => { const n = new Set(s); (linhas || []).forEach((l) => (e.target.checked ? n.add(l.id) : n.delete(l.id))); return n })} /></th>}<th>Prospect</th><th>Cidade</th><th>Situação</th><th>Telefone</th><th>Atualizado</th></tr></thead>
            <tbody>
              {linhas === null ? <tr><td colSpan={6}><div className="empty"><div className="spinner" /></div></td></tr>
                : !linhas.length ? <tr><td colSpan={6}><div className="empty"><h2>{soma ? 'Nenhum prospect com esse filtro' : 'Sua lista de prospects está vazia'}</h2><p>{soma ? 'Escolha outra situação.' : 'Na aba Base nacional, clique em Adicionar nos estabelecimentos que quer trabalhar.'}</p></div></td></tr>
                : linhas.map((l) => (
                  <tr key={l.id} className="click" tabIndex={0} onClick={() => abrir(l.id)} onKeyDown={(e) => e.key === 'Enter' && abrir(l.id)}>
                    {podeEditar && <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Marcar ${l.nome}`} checked={escolhidos.has(l.id)} onChange={() => alternar(l.id)} /></td>}
                    <td><div style={{ fontWeight: 600 }}>{l.nome}</div><div className="sub">{l.categoria ? rotulo(l.categoria) : ''}{l.chat_enviado_em ? ` · enviado ao bate-papo em ${dataBR(l.chat_enviado_em)}` : ''}</div></td>
                    <td>{l.cidade} <span className="sub">{l.uf}</span></td>
                    <td><span className="pill pill-sit">{SITUACAO_ROTULO[l.situacao]}</span></td>
                    <td><span className="mono">{l.telefone}</span>{(() => { const sl = seloTelefone(l); return sl ? <div><span className={'selo ' + sl.classe}>{sl.texto}</span></div> : null })()}</td>
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
  const { seg } = useSegmento()
  const aba = sp.get('aba') === 'meus' ? 'meus' : 'base'
  const [estab, setEstab] = useState<number | null>(null)
  const [prospect, setProspect] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Prospecção</h1><p>{seg ? `${seg.publico[0].toUpperCase()}${seg.publico.slice(1)} de todo o Brasil` : 'Potenciais clientes de todo o Brasil'}, a partir dos dados públicos da Receita Federal.</p></div>
      </div>
      <div className="auth-tabs" role="tablist" style={{ maxWidth: 420 }}>
        <button type="button" role="tab" aria-selected={aba === 'base'} aria-pressed={aba === 'base'} onClick={() => setSp({})}>Base nacional</button>
        <button type="button" role="tab" aria-selected={aba === 'meus'} aria-pressed={aba === 'meus'} onClick={() => setSp({ aba: 'meus' })}>Meus prospects</button>
      </div>
      {aba === 'base' ? <BaseNacional abrir={setEstab} /> : <MeusProspects abrir={setProspect} versao={versao} />}
      {estab !== null && <FichaEstabelecimento id={estab} onClose={() => setEstab(null)} onProspect={() => { esquecer('busca:'); esquecer('potenciais:'); setVersao((v) => v + 1) }} />}
      {prospect && <FichaProspect id={prospect} onClose={() => setProspect(null)} onChange={() => setVersao((v) => v + 1)} />}
    </div>
  )
}

const EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Escrever um e-mail e enviar para todos os marcados. O envio ainda não está ligado: a tela já mostra quem não receberia e por quê. */
function EmailEmMassa({ ids, vistos, onClose }: { ids: string[]; vistos: Map<string, { nome: string; email: string | null }>; onClose: () => void }) {
  const [assunto, setAssunto] = useState('')
  const [texto, setTexto] = useState('')
  const [resultado, setResultado] = useState<{ fora: { nome: string; motivo: string }[]; ok: number } | null>(null)
  useEffect(() => { const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc) }, [onClose])
  const itens = ids.map((id) => ({ id, ...(vistos.get(id) || { nome: 'Prospect', email: null }) }))
  const fora = itens.filter((i) => !i.email || !EMAIL_OK.test(i.email)).map((i) => ({ nome: i.nome, motivo: i.email ? 'e-mail inválido' : 'sem e-mail cadastrado' }))
  const validos = itens.length - fora.length
  function enviar() { setResultado({ fora, ok: 0 }) }
  return (
    <div className="modal-fundo" role="dialog" aria-modal="true" aria-label="Enviar e-mail" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-h"><h2>Enviar e-mail</h2><button className="btn" type="button" onClick={onClose}>Fechar</button></div>
        <div style={{ padding: 16, display: 'grid', gap: 12 }}>
          {!itens.length ? <div className="alert alert-warn">Marque pelo menos um prospect na lista para enviar o e-mail.</div> : (
            <div className="small muted">{itens.length} marcado{itens.length > 1 ? 's' : ''}: {validos} com e-mail válido{fora.length ? ` e ${fora.length} que não receberia${fora.length > 1 ? 'm' : ''}` : ''}.</div>
          )}
          <label className="field"><span>Assunto</span><input className="input" value={assunto} maxLength={150} onChange={(e) => setAssunto(e.target.value)} /></label>
          <label className="field"><span>Mensagem</span><textarea className="input" rows={7} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva o e-mail que será enviado a todos os marcados." /></label>
          {resultado && (
            <div className="alert alert-info" role="status">
              O envio de e-mail ainda está em desenvolvimento: nada foi enviado.
              {resultado.fora.length > 0 && <> Estes não seriam enviados:
                <ul style={{ margin: '6px 0 0 18px' }}>{resultado.fora.slice(0, 50).map((f, i) => <li key={i}>{f.nome}: {f.motivo}</li>)}</ul>
                {resultado.fora.length > 50 && <div>e mais {resultado.fora.length - 50}.</div>}</>}
            </div>
          )}
          <div><button className="btn btn-primary" type="button" disabled={!itens.length || !assunto.trim() || !texto.trim()} onClick={enviar}>Enviar e-mail para {validos} {validos === 1 ? 'prospect' : 'prospects'}</button></div>
        </div>
      </div>
    </div>
  )
}
