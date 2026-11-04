import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSessao } from '../context/Sessao'
import { msgErro, supabase } from '../lib/supabase'
import type { Cliente } from '../lib/types'
import { dataBR, fmt } from '../lib/format'
import { UF_NOMES } from '../lib/geo'
import FichaCliente from '../components/FichaCliente'
import { baixarCsv } from '../lib/csv'
import { podeExportar } from '../lib/plano'
import { IcImportar } from '../components/Icones'

const POR_PAGINA = 50
type Linha = Pick<Cliente, 'id' | 'codigo_erp' | 'nome' | 'nome_fantasia' | 'cidade' | 'uf' | 'telefones' | 'contato' | 'situacao' | 'data_cadastro' | 'lat'>


export default function Clientes() {
  const { org, podeEditar, toast } = useSessao()
  const [sp, setSp] = useSearchParams()
  const [q, setQ] = useState(sp.get('q') || '')
  const [uf, setUf] = useState(sp.get('uf') || '')
  const [cidade, setCidade] = useState(sp.get('cidade') || '')
  const [sit, setSit] = useState(sp.get('situacao') || '')
  const [ordem, setOrdem] = useState<'nome' | 'cidade' | 'data_cadastro'>('nome')
  const [pag, setPag] = useState(0)
  const [linhas, setLinhas] = useState<Linha[] | null>(null)
  const [total, setTotal] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState<string | null>(sp.get('id'))
  const [versao, setVersao] = useState(0)
  const [cidadesUf, setCidadesUf] = useState<string[]>([])
  const [exportando, setExportando] = useState(false)

  // filtros na URL, para poder compartilhar o link
  useEffect(() => {
    const p: Record<string, string> = {}
    if (q) p.q = q; if (uf) p.uf = uf; if (cidade) p.cidade = cidade; if (sit) p.situacao = sit; if (aberto) p.id = aberto
    setSp(p, { replace: true })
  }, [q, uf, cidade, sit, aberto, setSp])

  useEffect(() => {
    if (!org || !uf) { setCidadesUf([]); return }
    supabase.from('clientes').select('cidade').eq('org_id', org.id).eq('uf', uf).not('cidade', 'is', null).limit(5000)
      .then(({ data }) => setCidadesUf([...new Set((data || []).map((d) => d.cidade as string))].sort((a, b) => a.localeCompare(b, 'pt-BR'))))
  }, [org, uf])

  const consulta = useMemo(() => () => {
    let qb = supabase.from('clientes').select('id,codigo_erp,nome,nome_fantasia,cidade,uf,telefones,contato,situacao,data_cadastro,lat', { count: 'exact' }).eq('org_id', org!.id)
    if (uf) qb = qb.eq('uf', uf)
    if (cidade) qb = qb.eq('cidade', cidade)
    if (sit) qb = qb.eq('situacao', sit)
    const t = q.trim().replace(/[,()%]/g, ' ').trim()
    if (t) {
      const dig = t.replace(/\D/g, '')
      const ors = [`nome.ilike.%${t}%`, `nome_fantasia.ilike.%${t}%`, `contato.ilike.%${t}%`, `codigo_erp.eq.${t}`]
      if (dig.length >= 4) ors.push(`documento.ilike.%${dig}%`)
      qb = qb.or(ors.join(','))
    }
    return qb
  }, [org, uf, cidade, sit, q])

  useEffect(() => {
    if (!org) return
    let vivo = true
    const id = setTimeout(async () => {
      setErro(null)
      const { data, count, error } = await consulta().order(ordem, { ascending: ordem !== 'data_cadastro', nullsFirst: false }).order('nome').range(pag * POR_PAGINA, pag * POR_PAGINA + POR_PAGINA - 1)
      if (!vivo) return
      if (error) setErro(msgErro(error)); else { setLinhas(data as Linha[]); setTotal(count || 0) }
    }, 200)
    return () => { vivo = false; clearTimeout(id) }
  }, [org, consulta, ordem, pag, versao])

  useEffect(() => setPag(0), [q, uf, cidade, sit, ordem])

  async function exportar() {
    if (!org) return
    setExportando(true)
    try {
      const { error } = await supabase.rpc('registrar_exportacao', { p_org: org.id })
      if (error) throw error
      const todos: Cliente[] = []
      for (let de = 0; ; de += 1000) {
        const { data, error: e2 } = await consulta().select('*').order('nome').range(de, de + 999)
        if (e2) throw e2
        todos.push(...(data as unknown as Cliente[])); if (!data || data.length < 1000) break
      }
      const cols: (keyof Cliente)[] = ['codigo_erp', 'nome', 'nome_fantasia', 'documento', 'ie', 'telefones', 'contato', 'email', 'logradouro', 'bairro', 'cep', 'cidade', 'uf', 'situacao', 'data_cadastro', 'ultima_compra']
      baixarCsv(`clientes-${new Date().toISOString().slice(0, 10)}.csv`, cols, todos.map((c) => cols.map((k) => c[k])))
      toast(`${fmt(todos.length)} clientes exportados`)
    } catch (e) { toast(msgErro(e)) } finally { setExportando(false) }
  }

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Clientes</h1><p>Carteira da empresa, importada do ERP.</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" type="button" onClick={exportar} disabled={exportando || !total || !podeExportar(org)} title={podeExportar(org) ? undefined : 'Exportar planilha está disponível nos planos pagos'}>{podeExportar(org) ? 'Exportar CSV' : 'Exportar CSV (plano pago)'}</button>
          {podeEditar && <Link className="btn btn-primary" to="/clientes/importar"><IcImportar />Importar</Link>}
        </div>
      </div>

      <div className="filters">
        <label className="field grow"><span>Buscar</span><input id="c-q" className="input" type="search" placeholder="Nome, fantasia, contato, código ou CNPJ" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label className="field"><span>Estado</span>
          <select id="c-uf" className="input" value={uf} onChange={(e) => { setUf(e.target.value); setCidade('') }}>
            <option value="">Todos</option>{Object.entries(UF_NOMES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </label>
        <label className="field"><span>Município</span>
          <select id="c-cid" className="input" value={cidade} disabled={!uf} onChange={(e) => setCidade(e.target.value)}>
            <option value="">{uf ? 'Todos' : 'Escolha o estado'}</option>{cidadesUf.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="field"><span>Situação</span>
          <select id="c-sit" className="input" value={sit} onChange={(e) => setSit(e.target.value)}><option value="">Todas</option><option value="ativo">Ativos</option><option value="inativo">Inativos</option></select>
        </label>
        <label className="field"><span>Ordenar por</span>
          <select id="c-ord" className="input" value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)}><option value="nome">Nome</option><option value="cidade">Cidade</option><option value="data_cadastro">Cadastro mais recente</option></select>
        </label>
      </div>

      {erro && <div className="alert alert-err">{erro}</div>}
      <section className="panel">
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Código</th><th>Nome</th><th>Cidade</th><th>Telefones</th><th>Contato</th><th>Situação</th><th>Cadastro</th></tr></thead>
            <tbody>
              {linhas === null ? <tr><td colSpan={7}><div className="empty"><div className="spinner" /></div></td></tr>
                : !linhas.length ? <tr><td colSpan={7}><div className="empty"><h2>Nenhum cliente encontrado</h2><p>{q || uf || sit ? 'Mude a busca ou limpe os filtros.' : 'Importe sua carteira para começar.'}</p></div></td></tr>
                : linhas.map((c) => (
                  <tr key={c.id} className="click" tabIndex={0} onClick={() => setAberto(c.id)} onKeyDown={(e) => e.key === 'Enter' && setAberto(c.id)}>
                    <td className="mono">{c.codigo_erp}</td>
                    <td><div style={{ fontWeight: 600 }}>{c.nome}</div>{c.nome_fantasia && c.nome_fantasia !== c.nome && <div className="sub">{c.nome_fantasia}</div>}</td>
                    <td>{c.cidade ? <>{c.cidade} <span className="sub">{c.uf}</span></> : <span className="sub">Sem cidade</span>}{c.lat == null && c.cidade && <div className="sub" style={{ color: 'var(--warn)' }}>fora do mapa</div>}</td>
                    <td className="mono" style={{ whiteSpace: 'nowrap' }}>{c.telefones?.slice(0, 2).map((t) => <div key={t}>{t}</div>)}</td>
                    <td>{c.contato}</td>
                    <td><span className={'pill pill-' + c.situacao}>{c.situacao === 'ativo' ? 'Ativo' : 'Inativo'}</span></td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{dataBR(c.data_cadastro)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <span>{fmt(total)} clientes</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-sm" type="button" disabled={pag === 0} onClick={() => setPag(pag - 1)}>Anterior</button>
            <span className="num">Página {pag + 1} de {paginas}</span>
            <button className="btn btn-sm" type="button" disabled={pag + 1 >= paginas} onClick={() => setPag(pag + 1)}>Próxima</button>
          </div>
        </div>
      </section>
      {aberto && <FichaCliente id={aberto} onClose={() => setAberto(null)} onChange={() => setVersao((v) => v + 1)} />}
    </div>
  )
}
