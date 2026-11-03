import { useEffect, useState, type FormEvent } from 'react'
import { useSessao } from '../context/Sessao'
import { msgErro, supabase } from '../lib/supabase'
import { CANAIS, type Interacao } from '../lib/types'
import { dataBR, dataHoraBR, formatarDoc } from '../lib/format'
import { chamarBatePapo, seloTelefone, textoResultado } from '../lib/chat'
import { SITUACOES, SITUACAO_ROTULO, useSegmento, type Situacao } from '../lib/prospeccao'

interface Prospect {
  id: string; org_id: string; estabelecimento_id: number | null; nome: string; documento: string | null; telefone: string | null
  email: string | null; site: string | null; instagram: string | null; logradouro: string | null; bairro: string | null; cep: string | null
  cidade: string | null; uf: string | null; categoria: string | null; situacao: Situacao; nota: number | null; fonte: string
  observacoes: string | null; criado_em: string; atualizado_em: string
  tipo_telefone: string | null; whatsapp_status: string | null; chat_bloqueado: boolean; chat_enviado_em: string | null
}
type InteracaoP = Interacao & { situacao_nova: Situacao | null }

export default function FichaProspect({ id, onClose, onChange }: { id: string; onClose: () => void; onChange?: () => void }) {
  const { org, podeEditar, ehAdmin, toast } = useSessao()
  const { rotulo } = useSegmento()
  const [p, setP] = useState<Prospect | null>(null)
  const [hist, setHist] = useState<InteracaoP[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [canal, setCanal] = useState('telefone')
  const [novaSit, setNovaSit] = useState<string>('')
  const [chatOk, setChatOk] = useState(false)
  const [enviando, setEnviando] = useState(false)

  async function carregar() {
    const [{ data, error }, h] = await Promise.all([
      supabase.from('prospects').select('*').eq('id', id).single(),
      supabase.from('interacoes').select('id,user_id,data,canal,texto,situacao_nova').eq('prospect_id', id).order('data', { ascending: false }),
    ])
    if (error) return setErro(msgErro(error))
    setP(data as Prospect); setHist((h.data as InteracaoP[]) || [])
  }
  useEffect(() => { setP(null); carregar() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  async function mudarSituacao(s: Situacao) {
    if (!p) return
    const { error } = await supabase.from('prospects').update({ situacao: s }).eq('id', p.id)
    if (error) return setErro(msgErro(error))
    toast('Situação: ' + SITUACAO_ROTULO[s]); carregar(); onChange?.()
  }

  async function registrar(e: FormEvent) {
    e.preventDefault(); if (!p || !org || !texto.trim()) return
    const uid = (await supabase.auth.getUser()).data.user?.id
    const { error } = await supabase.from('interacoes').insert({ org_id: org.id, prospect_id: p.id, canal, texto: texto.trim(), situacao_nova: novaSit || null, user_id: uid })
    if (error) return setErro(msgErro(error))
    setTexto(''); setNovaSit(''); toast('Abordagem registrada'); carregar(); onChange?.()
  }

  useEffect(() => { if (org) supabase.rpc('bate_papo_conectado', { p_org: org.id }).then(({ data }) => setChatOk(!!data)) }, [org])
  async function enviarChat() {
    if (!p || !org) return
    setEnviando(true); setErro(null)
    try { toast(textoResultado(await chamarBatePapo(org.id, 'enviar', [p.id]))); carregar(); onChange?.() }
    catch (e) { setErro((e as Error).message) } finally { setEnviando(false) }
  }

  async function liberarEnvio() {
    if (!p) return
    const { error } = await supabase.from('prospects').update({ chat_bloqueado: false, whatsapp_status: null }).eq('id', p.id)
    if (error) return setErro(msgErro(error)); toast('Envio pelo bate-papo liberado de novo'); carregar(); onChange?.()
  }

  async function remover() {
    if (!p) return
    const { error } = await supabase.from('prospects').delete().eq('id', p.id)
    if (error) return setErro(msgErro(error))
    toast('Prospect removido da lista'); onChange?.(); onClose()
  }

  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Ficha do prospect">
        {!p ? <div className="center-fill">{erro ? <div className="alert alert-err">{erro}</div> : <div className="spinner" />}</div> : (<>
          <div className="drawer-h">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <h2>{p.nome}</h2>
              <button className="btn btn-ghost btn-sm" type="button" onClick={onClose}>Fechar</button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="small muted" htmlFor="fp-sit">Situação</label>
              <select id="fp-sit" className="input" style={{ height: 32, width: 190 }} value={p.situacao} disabled={!podeEditar} onChange={(e) => mudarSituacao(e.target.value as Situacao)}>
                {SITUACOES.map(([k, r]) => <option key={k} value={k}>{r}</option>)}
              </select>
              <span className="small muted">{p.cidade ? `${p.cidade} – ${p.uf}` : p.uf}</span>
            </div>
          </div>
          <div className="drawer-b">
            {erro && <div className="alert alert-err">{erro}</div>}
            <dl className="kv">
              <dt>CNPJ</dt><dd className="mono">{formatarDoc(p.documento) || '—'}</dd>
              <dt>Categoria</dt><dd>{rotulo(p.categoria)}</dd>
              <dt>Telefone</dt><dd><span className="mono">{p.telefone || '—'}</span> {(() => { const sl = seloTelefone(p); return sl ? <span className={'selo ' + sl.classe}>{sl.texto}</span> : null })()}</dd>
              <dt>E-mail</dt><dd>{p.email || '—'}</dd>
              <dt>Endereço</dt><dd>{[p.logradouro, p.bairro].filter(Boolean).join(', ') || '—'}</dd>
              <dt>CEP</dt><dd className="mono">{p.cep || '—'}</dd>
              <dt>Na lista desde</dt><dd>{dataBR(p.criado_em)}</dd>
              <dt>Fonte</dt><dd>{p.fonte === 'manual' ? 'Cadastro manual' : 'Base aberta da Receita Federal'}</dd>
            </dl>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a className="btn" target="_blank" rel="noopener" href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([p.nome, p.logradouro, p.cidade, p.uf].filter(Boolean).join(', '))}>Abrir no Google Maps</a>
              {ehAdmin && (p.chat_bloqueado || p.whatsapp_status === 'invalido') && <button className="btn" type="button" onClick={liberarEnvio} title="Use se o contato pediu para voltar a receber ou se o telefone foi corrigido">Liberar envio de novo</button>}
              {podeEditar && chatOk && !p.chat_bloqueado && <button className="btn btn-primary" type="button" onClick={enviarChat} disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar ao bate-papo'}</button>}
              {ehAdmin && <button className="btn btn-danger" type="button" onClick={remover}>Remover da lista</button>}
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <h3>Histórico de abordagem</h3>
              {podeEditar && (
                <form onSubmit={registrar} style={{ display: 'grid', gap: 8 }}>
                  <textarea id="fp-texto" className="input" placeholder="Como foi o contato, o que ficou combinado…" value={texto} onChange={(e) => setTexto(e.target.value)} />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <select id="fp-canal" className="input" style={{ width: 140 }} value={canal} onChange={(e) => setCanal(e.target.value)} aria-label="Canal">
                      {CANAIS.map(([k, r]) => <option key={k} value={k}>{r}</option>)}
                    </select>
                    <select id="fp-nsit" className="input" style={{ width: 190 }} value={novaSit} onChange={(e) => setNovaSit(e.target.value)} aria-label="Nova situação">
                      <option value="">Manter situação</option>{SITUACOES.map(([k, r]) => <option key={k} value={k}>Mudar para: {r}</option>)}
                    </select>
                    <button className="btn btn-primary" type="submit" disabled={!texto.trim()}>Registrar abordagem</button>
                  </div>
                </form>
              )}
              {hist.length ? (
                <ul className="timeline" style={{ margin: 0, padding: 0 }}>
                  {hist.map((h) => (
                    <li key={h.id}>
                      <div className="small muted">{dataHoraBR(h.data)} · {CANAIS.find(([k]) => k === h.canal)?.[1] || 'Contato'}{h.situacao_nova ? ` · passou para ${SITUACAO_ROTULO[h.situacao_nova]}` : ''}</div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{h.texto}</div>
                    </li>
                  ))}
                </ul>
              ) : <p className="small muted">Nenhuma abordagem registrada ainda.</p>}
            </div>
          </div>
        </>)}
      </aside>
    </>
  )
}
