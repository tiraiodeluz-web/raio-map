import { useEffect, useState, type FormEvent } from 'react'
import { useSessao } from '../context/Sessao'
import { msgErro, supabase } from '../lib/supabase'
import { CANAIS, type Cliente, type Interacao } from '../lib/types'
import { dataBR, dataHoraBR, formatarDoc } from '../lib/format'
import { acharMunicipio, UF_NOMES } from '../lib/geo'
import { invalidarClientes } from '../lib/dados'

export default function FichaCliente({ id, onClose, onChange }: { id: string; onClose: () => void; onChange?: () => void }) {
  const { org, podeEditar, idxMun, toast } = useSessao()
  const [c, setC] = useState<Cliente | null>(null)
  const [hist, setHist] = useState<Interacao[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState<Partial<Cliente>>({})
  const [nota, setNota] = useState('')
  const [canal, setCanal] = useState('telefone')

  async function carregar() {
    const [{ data, error }, h] = await Promise.all([
      supabase.from('clientes').select('*').eq('id', id).single(),
      supabase.from('interacoes').select('id,user_id,data,canal,texto').eq('cliente_id', id).order('data', { ascending: false }),
    ])
    if (error) return setErro(msgErro(error))
    setC(data as Cliente); setHist((h.data as Interacao[]) || [])
  }
  useEffect(() => { setC(null); setEditando(false); carregar() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  async function salvar(e: FormEvent) {
    e.preventDefault(); if (!c || !org) return
    const patch: Partial<Cliente> = { ...form }
    if ((patch.cidade !== undefined || patch.uf !== undefined) && idxMun) {
      const m = acharMunicipio(idxMun, patch.cidade ?? c.cidade ?? '', (patch.uf ?? c.uf ?? '').toUpperCase())
      Object.assign(patch, m ? { cidade: m.nome, uf: m.uf, municipio_ibge: m.ibge, lat: m.lat, lng: m.lng, precisao_geo: 'municipio' } : { municipio_ibge: null, lat: null, lng: null, precisao_geo: null })
      if (!m) toast('Cidade não encontrada: o cliente ficará fora do mapa.')
    }
    if (patch.ultima_compra === '') patch.ultima_compra = null
    const { error } = await supabase.from('clientes').update(patch).eq('id', c.id)
    if (error) return setErro(msgErro(error))
    invalidarClientes(org.id); setEditando(false); setForm({}); toast('Cliente atualizado'); carregar(); onChange?.()
  }

  async function registrar(e: FormEvent) {
    e.preventDefault(); if (!c || !org || !nota.trim()) return
    const { error } = await supabase.from('interacoes').insert({ org_id: org.id, cliente_id: c.id, canal, texto: nota.trim(), user_id: (await supabase.auth.getUser()).data.user?.id })
    if (error) return setErro(msgErro(error))
    setNota(''); toast('Contato registrado'); carregar()
  }

  const set = (k: keyof Cliente) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const v = (k: keyof Cliente) => (form[k] ?? c?.[k] ?? '') as string

  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Ficha do cliente">
        {!c ? <div className="center-fill">{erro ? <div className="alert alert-err">{erro}</div> : <div className="spinner" />}</div> : (<>
          <div className="drawer-h">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <h2>{c.nome}</h2>
                {c.nome_fantasia && c.nome_fantasia !== c.nome && <span className="muted">{c.nome_fantasia}</span>}
              </div>
              <button className="btn btn-ghost btn-sm" type="button" onClick={onClose} aria-label="Fechar">Fechar</button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className={'pill pill-' + c.situacao}><span className="dot" style={{ background: c.situacao === 'ativo' ? 'var(--cat-ativo)' : 'var(--cat-inativo)' }} />Cliente {c.situacao}</span>
              <span className="small muted">{c.cidade ? `${c.cidade} – ${c.uf}` : 'Sem cidade reconhecida'}</span>
            </div>
          </div>
          <div className="drawer-b">
            {erro && <div className="alert alert-err">{erro}</div>}
            {!editando ? (
              <>
                <dl className="kv">
                  <dt>Código no ERP</dt><dd className="mono">{c.codigo_erp || '—'}</dd>
                  <dt>CNPJ / CPF</dt><dd className="mono">{formatarDoc(c.documento) || '—'}</dd>
                  {c.ie && (<><dt>Inscrição estadual</dt><dd className="mono">{c.ie}</dd></>)}
                  <dt>Telefones</dt><dd className="mono">{c.telefones?.length ? c.telefones.join(' · ') : '—'}</dd>
                  <dt>Contato</dt><dd>{c.contato || '—'}</dd>
                  {c.email && (<><dt>E-mail</dt><dd>{c.email}</dd></>)}
                  <dt>Endereço</dt><dd>{[c.logradouro, c.bairro].filter(Boolean).join(', ') || '—'}</dd>
                  <dt>CEP</dt><dd className="mono">{c.cep || '—'}</dd>
                  <dt>Cidade</dt><dd>{c.cidade ? `${c.cidade} – ${UF_NOMES[c.uf || ''] || c.uf}` : '—'}</dd>
                  <dt>Cadastro</dt><dd>{dataBR(c.data_cadastro) || '—'}</dd>
                  <dt>Última compra</dt><dd>{dataBR(c.ultima_compra) || 'Não informada'}</dd>
                  <dt>Localização</dt><dd className="small">{c.precisao_geo === 'municipio' ? 'Centro do município' : c.precisao_geo === 'cep' ? 'Pela faixa de CEP' : c.precisao_geo === 'endereco' ? 'Endereço' : 'Fora do mapa'}</dd>
                </dl>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {podeEditar && <button className="btn" type="button" onClick={() => setEditando(true)}>Editar</button>}
                  <a className="btn" target="_blank" rel="noopener" href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([c.logradouro, c.bairro, c.cidade, c.uf, c.cep].filter(Boolean).join(', '))}>Abrir no Google Maps</a>
                </div>
                {c.observacoes && (<div style={{ display: 'grid', gap: 6 }}><h3>Observações do ERP</h3><div className="obs">{c.observacoes}</div></div>)}
              </>
            ) : (
              <form onSubmit={salvar} style={{ display: 'grid', gap: 12 }}>
                <label className="field"><span>Situação</span>
                  <select id="f-sit" className="input" value={v('situacao')} onChange={set('situacao')}><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select>
                </label>
                <label className="field"><span>Última compra</span><input id="f-uc" className="input" type="date" value={v('ultima_compra')} onChange={set('ultima_compra')} /></label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 10 }}>
                  <label className="field"><span>Cidade</span><input id="f-cid" className="input" value={v('cidade')} onChange={set('cidade')} /></label>
                  <label className="field"><span>UF</span><input id="f-uf" className="input" maxLength={2} value={v('uf')} onChange={set('uf')} /></label>
                </div>
                <label className="field"><span>Contato</span><input id="f-contato" className="input" value={v('contato')} onChange={set('contato')} /></label>
                <label className="field"><span>E-mail</span><input id="f-email" className="input" type="email" value={v('email')} onChange={set('email')} /></label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" type="submit">Salvar alterações</button>
                  <button className="btn" type="button" onClick={() => { setEditando(false); setForm({}) }}>Cancelar</button>
                </div>
              </form>
            )}

            <div style={{ display: 'grid', gap: 10 }}>
              <h3>Histórico de contatos</h3>
              {podeEditar && (
                <form onSubmit={registrar} style={{ display: 'grid', gap: 8 }}>
                  <textarea id="f-nota" className="input" placeholder="O que foi conversado, próximos passos…" value={nota} onChange={(e) => setNota(e.target.value)} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select id="f-canal" className="input" style={{ width: 150 }} value={canal} onChange={(e) => setCanal(e.target.value)}>
                      {CANAIS.map(([k, r]) => <option key={k} value={k}>{r}</option>)}
                    </select>
                    <button className="btn btn-primary" type="submit" disabled={!nota.trim()}>Registrar contato</button>
                  </div>
                </form>
              )}
              {hist.length ? (
                <ul className="timeline" style={{ margin: 0, padding: 0 }}>
                  {hist.map((h) => (
                    <li key={h.id}>
                      <div className="small muted">{dataHoraBR(h.data)} · {CANAIS.find(([k]) => k === h.canal)?.[1] || 'Contato'}</div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{h.texto}</div>
                    </li>
                  ))}
                </ul>
              ) : <p className="small muted">Nenhum contato registrado no RAIO MAP.</p>}
            </div>
          </div>
        </>)}
      </aside>
    </>
  )
}
