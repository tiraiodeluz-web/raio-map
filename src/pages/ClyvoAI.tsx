import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useSessao } from '../context/Sessao'
import { msgErro, supabase } from '../lib/supabase'
import { dataHoraBR, fmt } from '../lib/format'
import { ehPago } from '../lib/plano'
import Bloqueado from '../components/Bloqueado'

interface Item { id: string; pergunta: string; resposta: string | null; erro: string | null; criado_em: string }
const SUGESTOES = [
  'Quais clientes precisam de atenção?',
  'Quais cidades devemos prospectar?',
  'Quais prospects devemos priorizar?',
  'Onde estamos perdendo oportunidades?',
  'Como está o desempenho da equipe?',
  'Quais regiões têm maior potencial comercial?',
]

export default function ClyvoAI() {
  const { org } = useSessao()
  if (!ehPago(org)) {
    return <Bloqueado titulo="Clyvo AI" descricao="Pergunte em linguagem natural quais clientes recuperar, quais cidades prospectar e como está a equipe. As respostas usam os dados reais da sua empresa." extra="Este recurso utiliza créditos de IA, incluídos nos planos pagos." />
  }
  return <Conversa />
}

function Conversa() {
  const { org } = useSessao()
  const [itens, setItens] = useState<Item[] | null>(null)
  const [saldo, setSaldo] = useState<number | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const fim = useRef<HTMLDivElement>(null)

  const carregar = useCallback(async () => {
    if (!org) return
    const [h, c] = await Promise.all([
      supabase.from('ia_perguntas').select('id,pergunta,resposta,erro,criado_em').eq('org_id', org.id).order('criado_em', { ascending: true }).limit(100),
      supabase.from('ia_creditos').select('saldo').eq('org_id', org.id).maybeSingle(),
    ])
    if (h.error) return setErro(msgErro(h.error))
    setItens((h.data as Item[]) || []); setSaldo(c.data ? (c.data.saldo as number) : null)
  }, [org])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }) }, [itens, enviando])

  async function perguntar(e?: FormEvent, t = texto) {
    e?.preventDefault()
    const p = t.trim(); if (!org || !p || enviando) return
    setEnviando(true); setErro(null); setTexto('')
    const { data, error } = await supabase.functions.invoke('clyvo-ai', { body: { org_id: org.id, pergunta: p } })
    if (error) {
      let msg = msgErro(error)
      try { const j = await (error as unknown as { context: Response }).context.json(); if (j?.erro) msg = j.erro } catch { /* mantém */ }
      setErro(msg); setTexto(p)
    } else if (data?.erro) { setErro(data.erro); setTexto(p) }
    else { setSaldo(data.saldo); await carregar() }
    setEnviando(false)
  }

  return (
    <div className="page ia-page">
      <div className="page-head">
        <div><h1>Clyvo AI</h1><p>Pergunte sobre clientes, prospects e equipe. Responde só com os dados da sua empresa.</p></div>
        <span className="pill pill-nid" title="Cada pergunta usa 1 crédito">{saldo == null ? '50 créditos iniciais' : `${fmt(saldo)} ${saldo === 1 ? 'crédito' : 'créditos'}`}</span>
      </div>
      <div className="panel ia-chat">
        <div className="ia-lista" aria-live="polite">
          {itens === null && <div className="spinner" aria-label="Carregando" />}
          {itens?.length === 0 && !enviando && (
            <div className="empty"><h2>Faça sua primeira pergunta</h2><p>Escolha uma sugestão ou escreva a sua.</p>
              <div className="ia-sug">{SUGESTOES.map((s) => <button key={s} type="button" className="btn" onClick={() => perguntar(undefined, s)}>{s}</button>)}</div></div>
          )}
          {itens?.map((i) => (
            <div key={i.id} className="ia-par">
              <div className="ia-p"><span className="small muted">{dataHoraBR(i.criado_em)}</span>{i.pergunta}</div>
              {i.resposta ? <div className="ia-r">{i.resposta}</div> : <div className="ia-r ia-erro">{i.erro || 'Sem resposta.'}</div>}
            </div>
          ))}
          {enviando && <div className="ia-par"><div className="ia-r muted">Analisando os dados da sua empresa…</div></div>}
          <div ref={fim} />
        </div>
        {erro && <div className="alert alert-err" role="alert" style={{ margin: '0 16px' }}>{erro}</div>}
        <form className="ia-form" onSubmit={perguntar}>
          <input className="input" value={texto} maxLength={600} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: quais clientes devo ligar esta semana?" aria-label="Sua pergunta" disabled={enviando} />
          <button className="btn btn-primary" type="submit" disabled={enviando || !texto.trim()}>Perguntar</button>
        </form>
        <div className="small muted" style={{ padding: '0 16px 14px' }}>A IA pode errar. Confira os números nas telas antes de decidir. Ela não vê faturamento nem a base nacional completa.</div>
      </div>
    </div>
  )
}
