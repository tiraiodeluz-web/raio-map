import { useCallback, useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react'
import { useSessao } from '../context/Sessao'
import { msgErro, supabase } from '../lib/supabase'
import FichaProspect from '../components/FichaProspect'
import { seloTelefone } from '../lib/chat'

interface Coluna { id: string; nome: string; ordem: number }
interface Card { id: string; nome: string; cidade: string | null; uf: string | null; telefone: string | null; coluna_id: string | null; atualizado_em: string; tipo_telefone: string | null; whatsapp_status: string | null; chat_bloqueado: boolean }

const PADRAO = ['Novo', 'Primeiro contato', 'Em conversa', 'Proposta enviada', 'Fechado', 'Perdido']
const LIMITE = 2000

export default function Funil() {
  const { org, podeEditar, toast } = useSessao()
  const [colunas, setColunas] = useState<Coluna[] | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [nomeEdit, setNomeEdit] = useState('')
  const [novaCol, setNovaCol] = useState('')

  const carregar = useCallback(async () => {
    if (!org) return
    setErro(null)
    let { data: cols, error } = await supabase.from('colunas_funil').select('id,nome,ordem').eq('org_id', org.id).order('ordem')
    if (error) return setErro(msgErro(error))
    if (!cols?.length && podeEditar) {
      const ins = await supabase.from('colunas_funil').insert(PADRAO.map((nome, i) => ({ org_id: org.id, nome, ordem: i }))).select('id,nome,ordem')
      if (ins.error) return setErro(msgErro(ins.error))
      cols = ins.data?.sort((a, b) => a.ordem - b.ordem) || []
    }
    setColunas((cols as Coluna[]) || [])
    const r = await supabase.from('prospects').select('id,nome,cidade,uf,telefone,coluna_id,atualizado_em,tipo_telefone,whatsapp_status,chat_bloqueado').eq('org_id', org.id).order('atualizado_em', { ascending: false }).limit(LIMITE)
    if (r.error) return setErro(msgErro(r.error))
    setCards((r.data as Card[]) || [])
  }, [org, podeEditar])
  useEffect(() => { setColunas(null); carregar() }, [carregar])

  const primeira = colunas?.[0]?.id
  const colDe = (c: Card) => (c.coluna_id && colunas?.some((x) => x.id === c.coluna_id) ? c.coluna_id : primeira)
  const visiveis = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? cards.filter((c) => (c.nome + ' ' + (c.cidade || '')).toLowerCase().includes(t)) : cards
  }, [cards, q])

  async function mover(cardId: string, destino: string) {
    const c = cards.find((x) => x.id === cardId); if (!c || !org || !colunas) return
    const de = colunas.find((x) => x.id === colDe(c)), para = colunas.find((x) => x.id === destino)
    if (!para || de?.id === para.id) return
    setCards((l) => l.map((x) => (x.id === cardId ? { ...x, coluna_id: destino, atualizado_em: new Date().toISOString() } : x)))
    const { error } = await supabase.from('prospects').update({ coluna_id: destino }).eq('id', cardId)
    if (error) { setErro(msgErro(error)); return carregar() }
    const uid = (await supabase.auth.getUser()).data.user?.id
    await supabase.from('interacoes').insert({ org_id: org.id, prospect_id: cardId, canal: 'outro', texto: `Movido no funil: ${de?.nome || '—'} → ${para.nome}`, user_id: uid })
  }

  const soltar = (e: DragEvent, col: string) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || arrastando; setSobre(null); setArrastando(null); if (id) mover(id, col) }

  async function renomear(id: string) {
    const nome = nomeEdit.trim(); setEditando(null)
    if (!nome) return
    const { error } = await supabase.from('colunas_funil').update({ nome }).eq('id', id)
    if (error) return setErro(msgErro(error)); carregar()
  }
  async function adicionarColuna(e: FormEvent) {
    e.preventDefault(); const nome = novaCol.trim(); if (!nome || !org || !colunas) return
    const ordem = Math.max(-1, ...colunas.map((c) => c.ordem)) + 1
    const { error } = await supabase.from('colunas_funil').insert({ org_id: org.id, nome, ordem })
    if (error) return setErro(msgErro(error)); setNovaCol(''); carregar()
  }
  async function deslocar(i: number, d: -1 | 1) {
    if (!colunas) return; const a = colunas[i], b = colunas[i + d]; if (!a || !b) return
    const r = await Promise.all([
      supabase.from('colunas_funil').update({ ordem: b.ordem }).eq('id', a.id),
      supabase.from('colunas_funil').update({ ordem: a.ordem }).eq('id', b.id),
    ])
    const er = r.find((x) => x.error)?.error; if (er) return setErro(msgErro(er)); carregar()
  }
  async function apagarColuna(c: Coluna) {
    if (colunas && colunas.length <= 1) return toast('O funil precisa de pelo menos uma coluna')
    if (!window.confirm(`Apagar a coluna "${c.nome}"? Os cartões dela vão para a primeira coluna.`)) return
    const { error } = await supabase.from('colunas_funil').delete().eq('id', c.id)
    if (error) return setErro(msgErro(error)); toast('Coluna apagada'); carregar()
  }

  const dias = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000)

  return (
    <div className="page" style={{ maxWidth: 'none' }}>
      <div className="page-head">
        <div>
          <h1>Funil</h1>
          <p>Arraste os cartões entre as colunas. {podeEditar ? 'Clique no nome da coluna para renomear.' : 'Você tem acesso somente para ver.'}</p>
        </div>
        <input className="input" style={{ width: 240 }} type="search" placeholder="Buscar empresa ou cidade" aria-label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {erro && <div className="alert alert-err">{erro}</div>}
      {!colunas ? <div className="center-fill"><div className="spinner" /></div> : !colunas.length ? (
        <p className="muted">O funil desta empresa ainda não tem colunas. Peça a alguém com permissão de edição para abrir esta página.</p>
      ) : !cards.length ? (
        <p className="muted">Nenhum prospect ainda. Adicione empresas na aba Prospecção e elas aparecem aqui.</p>
      ) : null}
      {colunas && (
        <div className="kanban">
          {colunas.map((col, i) => {
            const lista = visiveis.filter((c) => colDe(c) === col.id)
            return (
              <section key={col.id} className={'kcol' + (sobre === col.id ? ' sobre' : '')} aria-label={col.nome}
                onDragOver={(e) => { if (podeEditar) { e.preventDefault(); setSobre(col.id) } }}
                onDragLeave={() => setSobre((s) => (s === col.id ? null : s))}
                onDrop={(e) => podeEditar && soltar(e, col.id)}>
                <header className="kcol-h">
                  {editando === col.id ? (
                    <input className="input" autoFocus maxLength={40} value={nomeEdit} aria-label="Nome da coluna" onChange={(e) => setNomeEdit(e.target.value)}
                      onBlur={() => renomear(col.id)} onKeyDown={(e) => { if (e.key === 'Enter') renomear(col.id); if (e.key === 'Escape') setEditando(null) }} />
                  ) : (
                    <button type="button" className="kcol-nome" disabled={!podeEditar} onClick={() => { setEditando(col.id); setNomeEdit(col.nome) }}>{col.nome}</button>
                  )}
                  <span className="small muted">{lista.length}</span>
                  {podeEditar && (
                    <span className="kcol-acoes">
                      <button type="button" aria-label="Mover coluna para a esquerda" disabled={i === 0} onClick={() => deslocar(i, -1)}>‹</button>
                      <button type="button" aria-label="Mover coluna para a direita" disabled={i === colunas.length - 1} onClick={() => deslocar(i, 1)}>›</button>
                      <button type="button" aria-label={`Apagar coluna ${col.nome}`} onClick={() => apagarColuna(col)}>×</button>
                    </span>
                  )}
                </header>
                <div className="kcol-b">
                  {lista.map((c) => {
                    const d = dias(c.atualizado_em)
                    return (
                      <article key={c.id} className={'kcard' + (arrastando === c.id ? ' arrastando' : '')} draggable={podeEditar}
                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move'; setArrastando(c.id) }}
                        onDragEnd={() => { setArrastando(null); setSobre(null) }}>
                        <button type="button" className="kcard-nome" onClick={() => setAberto(c.id)}>{c.nome}</button>
                        <span className="small muted">{c.cidade ? `${c.cidade} – ${c.uf}` : c.uf || ''}</span>
                        {(() => { const sl = seloTelefone(c); return sl ? <span><span className={'selo ' + sl.classe}>{sl.texto}</span></span> : null })()}
                        <div className="kcard-pe">
                          <span className={'small ' + (d >= 14 ? 'parado' : 'muted')}>{d === 0 ? 'hoje' : `há ${d} dia${d > 1 ? 's' : ''}`}</span>
                          {c.telefone && <a className="small mono" href={'tel:' + c.telefone.replace(/\D/g, '')}>{c.telefone}</a>}
                        </div>
                        {podeEditar && (
                          <select className="input kcard-mover" aria-label={`Mover ${c.nome} para`} value={col.id} onChange={(e) => mover(c.id, e.target.value)}>
                            {colunas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                          </select>
                        )}
                      </article>
                    )
                  })}
                  {!lista.length && <p className="small muted" style={{ padding: 6 }}>{q ? 'Nada nesta busca.' : 'Solte cartões aqui.'}</p>}
                </div>
              </section>
            )
          })}
          {podeEditar && (
            <form className="kcol kcol-nova" onSubmit={adicionarColuna}>
              <input className="input" maxLength={40} placeholder="Nome da nova coluna" aria-label="Nome da nova coluna" value={novaCol} onChange={(e) => setNovaCol(e.target.value)} />
              <button className="btn" type="submit" disabled={!novaCol.trim()}>Adicionar coluna</button>
            </form>
          )}
        </div>
      )}
      {cards.length >= LIMITE && <p className="small muted">Mostrando os {LIMITE} prospects mais recentes.</p>}
      {aberto && <FichaProspect id={aberto} onClose={() => setAberto(null)} onChange={carregar} />}
    </div>
  )
}
