import { useMemo, useState, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Papa from 'papaparse'
import { useSessao } from '../context/Sessao'
import { msgErro, supabase } from '../lib/supabase'
import { acharMunicipio, cepNum, localizarCep, norm } from '../lib/geo'
import { invalidarClientes } from '../lib/dados'
import { fmt } from '../lib/format'

type Campo = 'codigo_erp' | 'nome' | 'nome_fantasia' | 'documento' | 'ie' | 'telefone_1' | 'telefone_2' | 'telefone_3' | 'contato' | 'email'
  | 'logradouro' | 'bairro' | 'cep' | 'cidade' | 'uf' | 'data_cadastro' | 'ultima_compra' | 'situacao' | 'observacoes'

const CAMPOS: { k: Campo; rotulo: string; obrig?: boolean; sin: string[] }[] = [
  { k: 'nome', rotulo: 'Nome / razão social', obrig: true, sin: ['nome', 'razaosocial', 'razao', 'cliente', 'nomecliente'] },
  { k: 'cidade', rotulo: 'Cidade', obrig: true, sin: ['cidade', 'municipio', 'localidade'] },
  { k: 'uf', rotulo: 'UF', obrig: true, sin: ['uf', 'estado'] },
  { k: 'codigo_erp', rotulo: 'Código no ERP', sin: ['codigo', 'cod', 'codigoerp', 'codcliente', 'id'] },
  { k: 'nome_fantasia', rotulo: 'Nome fantasia', sin: ['fantasia', 'nomefantasia'] },
  { k: 'documento', rotulo: 'CNPJ / CPF', sin: ['cnpj', 'cpf', 'cpfcnpj', 'cnpjcpf', 'documento'] },
  { k: 'ie', rotulo: 'Inscrição estadual', sin: ['ie', 'rgie', 'inscricaoestadual'] },
  { k: 'telefone_1', rotulo: 'Telefone 1', sin: ['celular', 'telefone', 'fone', 'telefone1', 'whatsapp'] },
  { k: 'telefone_2', rotulo: 'Telefone 2', sin: ['fonecom', 'telefonecomercial', 'telefone2', 'fonecomercial'] },
  { k: 'telefone_3', rotulo: 'Telefone 3', sin: ['foneres', 'foneresidencial', 'telefoneresidencial', 'telefone3'] },
  { k: 'contato', rotulo: 'Contato', sin: ['contato', 'responsavel'] },
  { k: 'email', rotulo: 'E-mail', sin: ['email', 'e-mail'] },
  { k: 'logradouro', rotulo: 'Endereço', sin: ['endereco', 'logradouro', 'ender', 'rua'] },
  { k: 'bairro', rotulo: 'Bairro', sin: ['bairro'] },
  { k: 'cep', rotulo: 'CEP', sin: ['cep'] },
  { k: 'data_cadastro', rotulo: 'Data de cadastro', sin: ['datacadastro', 'dtcad', 'cadastro', 'dtcadastro'] },
  { k: 'ultima_compra', rotulo: 'Data da última compra', sin: ['ultimacompra', 'dtultimacompra', 'dataultimacompra'] },
  { k: 'situacao', rotulo: 'Situação (ativo/inativo)', sin: ['situacao', 'status', 'ativo'] },
  { k: 'observacoes', rotulo: 'Observações', sin: ['observacoes', 'obs', 'observ', 'observacao'] },
]

const chave = (s: string) => norm(s).toLowerCase()

function data(s: string | undefined): string | null {
  const t = (s || '').trim()
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) { const a = m[3].length === 2 ? '20' + m[3] : m[3]; return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}
function situacao(s: string | undefined): 'ativo' | 'inativo' {
  const t = chave(s || '')
  return /^(i|inativo|inativa|n|nao|bloqueado|0)$/.test(t) ? 'inativo' : 'ativo'
}

/** Lê o arquivo em UTF-8; se tiver bytes inválidos, cai para Windows-1252 (CSV salvo pelo Excel). */
async function lerTexto(f: File) {
  const buf = await f.arrayBuffer()
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf) } catch { return new TextDecoder('windows-1252').decode(buf) }
}

interface Previa { total: number; noMapa: number; porCep: number; semLocal: string[]; semNome: number; comCodigo: number }

export default function Importar() {
  const { org, idxMun, podeEditar, toast } = useSessao()
  const nav = useNavigate()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [cab, setCab] = useState<string[]>([])
  const [linhas, setLinhas] = useState<Record<string, string>[]>([])
  const [mapa, setMapa] = useState<Partial<Record<Campo, string>>>({})
  const [over, setOver] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [progresso, setProgresso] = useState<number | null>(null)
  const [fim, setFim] = useState<{ ok: number; erro: number } | null>(null)

  async function abrir(f: File) {
    setErro(null); setPrevia(null); setFim(null)
    if (!/\.(csv|txt)$/i.test(f.name)) return setErro('Use um arquivo .csv. No Excel: Arquivo › Salvar como › CSV.')
    const txt = await lerTexto(f)
    const r = Papa.parse<Record<string, string>>(txt, { header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim() })
    if (!r.meta.fields?.length || !r.data.length) return setErro('Não encontrei linhas no arquivo. A primeira linha precisa ter os nomes das colunas.')
    const campos = r.meta.fields
    const auto: Partial<Record<Campo, string>> = {}
    for (const c of CAMPOS) {
      const hit = campos.find((h) => c.sin.includes(chave(h)) && !Object.values(auto).includes(h))
      if (hit) auto[c.k] = hit
    }
    setArquivo(f); setCab(campos); setLinhas(r.data); setMapa(auto)
  }

  const faltando = CAMPOS.filter((c) => c.obrig && !mapa[c.k]).map((c) => c.rotulo)
  const g = (l: Record<string, string>, k: Campo) => (mapa[k] ? (l[mapa[k]!] || '').trim() : '')

  async function montar() {
    if (!idxMun || !org) return []
    const out = []
    for (const l of linhas) {
      const nome = g(l, 'nome'); if (!nome) continue
      const cidade = g(l, 'cidade'), uf = g(l, 'uf').toUpperCase().slice(0, 2), cep = g(l, 'cep')
      let mun = acharMunicipio(idxMun, cidade, uf)
      let precisao: string | null = mun ? 'municipio' : null
      let lat = mun?.lat ?? null, lng = mun?.lng ?? null
      if (!mun) {
        const n = cepNum(cep)
        const loc = n ? await localizarCep(n) : null
        if (loc && loc.exato) {
          lat = loc.lat; lng = loc.lng; precisao = 'cep'
          mun = acharMunicipio(idxMun, loc.cidade, loc.uf)
        }
      }
      const tels = [g(l, 'telefone_1'), g(l, 'telefone_2'), g(l, 'telefone_3')].filter(Boolean)
      out.push({
        org_id: org.id,
        codigo_erp: g(l, 'codigo_erp') || null,
        nome, nome_fantasia: g(l, 'nome_fantasia') || null,
        documento: g(l, 'documento').replace(/\D/g, '') || null,
        ie: g(l, 'ie') || null,
        telefones: [...new Set(tels)],
        contato: g(l, 'contato') || null, email: g(l, 'email') || null,
        logradouro: g(l, 'logradouro') || null, bairro: g(l, 'bairro') || null, cep: cep || null,
        cidade: mun?.nome || cidade || null, uf: mun?.uf || uf || null, municipio_ibge: mun?.ibge ?? null,
        lat, lng, precisao_geo: precisao,
        data_cadastro: data(g(l, 'data_cadastro')), ultima_compra: data(g(l, 'ultima_compra')),
        situacao: mapa.situacao ? situacao(g(l, 'situacao')) : 'ativo',
        observacoes: g(l, 'observacoes') || null,
      })
    }
    return out
  }

  async function verPrevia() {
    const rs = await montar()
    const semLocal = rs.filter((r) => r.lat == null).map((r) => `${r.nome} (${r.cidade || 'sem cidade'} ${r.uf || ''})`)
    setPrevia({ total: rs.length, noMapa: rs.length - semLocal.length, porCep: rs.filter((r) => r.precisao_geo === 'cep').length, semLocal, semNome: linhas.length - rs.length, comCodigo: rs.filter((r) => r.codigo_erp).length })
  }

  async function importar() {
    if (!org || !arquivo) return
    setErro(null); setProgresso(0)
    try {
      const rs = await montar()
      const { data: imp, error: e1 } = await supabase.from('importacoes')
        .insert({ org_id: org.id, tipo: 'clientes', arquivo: arquivo.name, linhas_total: linhas.length, user_id: (await supabase.auth.getUser()).data.user?.id })
        .select('id').single()
      if (e1) throw e1
      const comCod = rs.filter((r) => r.codigo_erp).map((r) => ({ ...r, importacao_id: imp.id }))
      const semCod = rs.filter((r) => !r.codigo_erp).map((r) => ({ ...r, importacao_id: imp.id }))
      // códigos repetidos no arquivo: fica a última linha
      const unicos = [...new Map(comCod.map((r) => [r.codigo_erp, r])).values()]
      let ok = 0, falha = 0; const erros: string[] = []
      const lotes = [...Array(Math.ceil(unicos.length / 500)).keys()].map((i) => ({ up: true, rows: unicos.slice(i * 500, i * 500 + 500) }))
        .concat([...Array(Math.ceil(semCod.length / 500)).keys()].map((i) => ({ up: false, rows: semCod.slice(i * 500, i * 500 + 500) })))
      for (let i = 0; i < lotes.length; i++) {
        const { up, rows } = lotes[i]
        const { error } = up
          ? await supabase.from('clientes').upsert(rows, { onConflict: 'org_id,codigo_erp' })
          : await supabase.from('clientes').insert(rows)
        if (error) { falha += rows.length; erros.push(msgErro(error)) } else ok += rows.length
        setProgresso(Math.round(((i + 1) / lotes.length) * 100))
      }
      await supabase.from('importacoes').update({ linhas_ok: ok, linhas_erro: falha, erros: erros.length ? erros.slice(0, 20) : null }).eq('id', imp.id)
      invalidarClientes(org.id)
      setFim({ ok, erro: falha })
      if (erros.length) setErro(erros[0])
      toast(`${fmt(ok)} clientes importados`)
    } catch (e) { setErro(msgErro(e)) } finally { setProgresso(null) }
  }

  const amostra = useMemo(() => linhas.slice(0, 3), [linhas])
  if (!podeEditar) return <div className="page"><div className="alert alert-warn">Seu papel nesta empresa é Leitor. Peça a um admin para importar clientes.</div></div>

  return (
    <div className="page" style={{ maxWidth: 960 }}>
      <div className="page-head">
        <div><h1>Importar clientes</h1><p>Envie a planilha da sua carteira em CSV. Clientes com o mesmo código no ERP são atualizados, não duplicados.</p></div>
        <Link className="btn" to="/clientes">Voltar para clientes</Link>
      </div>
      <div className="steps" aria-label="Etapas">
        <span aria-current={!arquivo ? 'step' : undefined}>1. Arquivo</span><span>›</span>
        <span aria-current={arquivo && !previa ? 'step' : undefined}>2. Colunas</span><span>›</span>
        <span aria-current={previa && !fim ? 'step' : undefined}>3. Conferir e importar</span>
      </div>

      {erro && <div className="alert alert-err" role="alert">{erro}</div>}

      {fim ? (
        <section className="panel empty">
          <h2>Importação concluída</h2>
          <p>{fmt(fim.ok)} clientes gravados{fim.erro ? `, ${fmt(fim.erro)} com erro` : ''}.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" type="button" onClick={() => nav('/mapa')}>Ver no mapa</button>
            <button className="btn" type="button" onClick={() => nav('/clientes')}>Ver lista</button>
          </div>
        </section>
      ) : (<>
        <label
          className={'dropzone' + (over ? ' over' : '')}
          onDragOver={(e: DragEvent) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e: DragEvent) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) abrir(f) }}
        >
          <b>{arquivo ? arquivo.name : 'Arraste o arquivo CSV aqui'}</b>
          <span className="muted small">{arquivo ? `${fmt(linhas.length)} linhas e ${cab.length} colunas encontradas` : 'ou clique para escolher. Separador vírgula ou ponto e vírgula.'}</span>
          <input id="arquivo" type="file" accept=".csv,.txt,text/csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) abrir(f) }} />
          <span className="btn btn-sm">Escolher arquivo</span>
        </label>

        {arquivo && (
          <section className="panel">
            <div className="panel-h"><h2>Quais colunas correspondem a quê</h2><span className="small muted">Detectei automaticamente o que pude</span></div>
            <div className="panel-b" style={{ display: 'grid', gap: 14 }}>
              <div className="map-cols">
                {CAMPOS.map((c) => (
                  <label key={c.k} className="field"><span>{c.rotulo}{c.obrig ? ' *' : ''}</span>
                    <select id={'m-' + c.k} className="input" value={mapa[c.k] || ''} onChange={(e) => { setMapa((m) => ({ ...m, [c.k]: e.target.value || undefined })); setPrevia(null) }}>
                      <option value="">Não importar</option>{cab.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              {amostra.length > 0 && mapa.nome && (
                <p className="small muted">Exemplo da primeira linha: {g(amostra[0], 'nome')} · {g(amostra[0], 'cidade')} – {g(amostra[0], 'uf')}</p>
              )}
              {faltando.length ? <div className="alert alert-warn">Indique a coluna de: {faltando.join(', ')}.</div>
                : <div><button className="btn btn-primary" type="button" onClick={verPrevia} disabled={!idxMun}>Conferir antes de importar</button></div>}
            </div>
          </section>
        )}

        {previa && (
          <section className="panel">
            <div className="panel-h"><h2>Conferência</h2></div>
            <div className="panel-b" style={{ display: 'grid', gap: 12 }}>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
                <li><b>{fmt(previa.total)}</b> clientes serão importados{previa.semNome ? ` (${fmt(previa.semNome)} linhas sem nome serão ignoradas)` : ''}.</li>
                <li><b>{fmt(previa.noMapa)}</b> foram localizados pela cidade{previa.porCep ? `, ${fmt(previa.porCep)} deles pelo CEP` : ''}.</li>
                <li><b>{fmt(previa.comCodigo)}</b> têm código do ERP e serão atualizados se já existirem.</li>
                {previa.semLocal.length > 0 && <li><b>{fmt(previa.semLocal.length)}</b> ficarão fora do mapa porque a cidade não foi reconhecida: {previa.semLocal.slice(0, 6).join('; ')}{previa.semLocal.length > 6 ? '…' : ''}</li>}
              </ul>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button className="btn btn-primary" type="button" onClick={importar} disabled={progresso !== null}>Importar {fmt(previa.total)} clientes</button>
                {progresso !== null && <span className="muted num">Gravando… {progresso}%</span>}
              </div>
            </div>
          </section>
        )}
      </>)}
    </div>
  )
}
