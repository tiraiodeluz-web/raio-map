import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useSessao } from '../context/Sessao'
import { msgErro, supabase } from '../lib/supabase'
import { PAPEL_ROTULO, type Membro, type Papel, type Plano } from '../lib/types'
import { dataBR, dataHoraBR, fmt } from '../lib/format'
import { chamarBatePapo, RETORNO_URL } from '../lib/chat'

type Aba = 'empresa' | 'membros' | 'plano' | 'bate_papo' | 'atividade'

const ACOES: Record<string, string> = {
  criar: 'Criou', insert: 'Adicionou', update: 'Alterou', delete: 'Removeu', convidar: 'Convidou', exportar: 'Exportou clientes',
}
const ENTIDADES: Record<string, string> = { organizacoes: 'a empresa', clientes: 'cliente', prospects: 'prospect', importacoes: 'importação', membros: 'membro', convites: '' }

function Empresa() {
  const { org, ehAdmin, recarregarOrgs, toast } = useSessao()
  const [nome, setNome] = useState(org?.nome || '')
  const [cnpj, setCnpj] = useState(org?.cnpj || '')
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => { setNome(org?.nome || ''); setCnpj(org?.cnpj || '') }, [org])
  async function salvar(e: FormEvent) {
    e.preventDefault(); setErro(null)
    const { error } = await supabase.from('organizacoes').update({ nome, cnpj: cnpj || null }).eq('id', org!.id)
    if (error) return setErro(msgErro(error))
    await recarregarOrgs(); toast('Dados da empresa salvos')
  }
  return (
    <form onSubmit={salvar} className="panel panel-b" style={{ display: 'grid', gap: 14, maxWidth: 520 }}>
      <label className="field"><span>Nome da empresa</span><input id="e-nome" className="input" value={nome} disabled={!ehAdmin} onChange={(e) => setNome(e.target.value)} /></label>
      <label className="field"><span>CNPJ</span><input id="e-cnpj" className="input" value={cnpj} disabled={!ehAdmin} onChange={(e) => setCnpj(e.target.value)} /></label>
      {erro && <div className="alert alert-err">{erro}</div>}
      {ehAdmin ? <div><button className="btn btn-primary" type="submit">Salvar</button></div> : <p className="small muted">Só dono ou admin pode alterar.</p>}
      <p className="small muted">Precisa de outra empresa separada? <Link to="/nova-empresa">Criar nova empresa</Link></p>
    </form>
  )
}

function Membros() {
  const { org, ehAdmin, session, toast } = useSessao()
  const [membros, setMembros] = useState<Membro[]>([])
  const [convites, setConvites] = useState<{ id: string; email: string; papel: Papel; criado_em: string; aceito_em: string | null }[]>([])
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState<Papel>('vendedor')
  const [erro, setErro] = useState<string | null>(null)

  async function carregar() {
    const [m, c] = await Promise.all([
      supabase.rpc('listar_membros', { p_org: org!.id }),
      ehAdmin ? supabase.from('convites').select('*').eq('org_id', org!.id).is('aceito_em', null).order('criado_em') : Promise.resolve({ data: [] }),
    ])
    setMembros((m.data as Membro[]) || []); setConvites((c.data as typeof convites) || [])
  }
  useEffect(() => { carregar() }, [org?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function convidar(e: FormEvent) {
    e.preventDefault(); setErro(null)
    const { error } = await supabase.rpc('convidar_membro', { p_org: org!.id, p_email: email, p_papel: papel })
    if (error) return setErro(msgErro(error))
    setEmail(''); toast('Convite registrado'); carregar()
  }
  async function mudarPapel(uid: string, p: Papel) {
    const { error } = await supabase.rpc('alterar_papel', { p_org: org!.id, p_user: uid, p_papel: p })
    if (error) setErro(msgErro(error)); else { toast('Papel alterado'); carregar() }
  }
  async function remover(uid: string) {
    const { error } = await supabase.rpc('remover_membro', { p_org: org!.id, p_user: uid })
    if (error) setErro(msgErro(error)); else { toast('Membro removido'); carregar() }
  }
  async function cancelarConvite(id: string) {
    const { error } = await supabase.from('convites').delete().eq('id', id)
    if (error) setErro(msgErro(error)); else carregar()
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {erro && <div className="alert alert-err">{erro}</div>}
      <section className="panel">
        <div className="panel-h"><h2>Membros</h2><span className="small muted">{membros.length} pessoas</span></div>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>E-mail</th><th>Papel</th><th>Desde</th><th /></tr></thead>
            <tbody>
              {membros.map((m) => (
                <tr key={m.user_id}>
                  <td>{m.email}{m.user_id === session?.user.id && <span className="small muted"> (você)</span>}</td>
                  <td>
                    {ehAdmin && m.user_id !== session?.user.id ? (
                      <select className="input" style={{ height: 32, width: 140 }} value={m.papel} onChange={(e) => mudarPapel(m.user_id, e.target.value as Papel)} aria-label={'Papel de ' + m.email}>
                        {(Object.keys(PAPEL_ROTULO) as Papel[]).map((p) => <option key={p} value={p}>{PAPEL_ROTULO[p]}</option>)}
                      </select>
                    ) : PAPEL_ROTULO[m.papel]}
                  </td>
                  <td>{dataBR(m.criado_em)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {(ehAdmin || m.user_id === session?.user.id) && <button className="btn btn-sm btn-danger" type="button" onClick={() => remover(m.user_id)}>{m.user_id === session?.user.id ? 'Sair da empresa' : 'Remover'}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {ehAdmin && (
        <section className="panel">
          <div className="panel-h"><h2>Convidar pessoa</h2></div>
          <div className="panel-b" style={{ display: 'grid', gap: 14 }}>
            <form onSubmit={convidar} className="filters">
              <label className="field grow"><span>E-mail</span><input id="cv-email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <label className="field"><span>Papel</span>
                <select id="cv-papel" className="input" value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
                  <option value="admin">Admin</option><option value="vendedor">Vendedor</option><option value="leitor">Leitor</option>
                </select>
              </label>
              <button className="btn btn-primary" type="submit">Convidar</button>
            </form>
            <p className="small muted">A pessoa cria a conta no Clyvo Map com esse e-mail e entra na empresa automaticamente. Admin gerencia membros; vendedor edita clientes; leitor só consulta.</p>
            {convites.length > 0 && (
              <table className="t">
                <thead><tr><th>Convite pendente</th><th>Papel</th><th>Enviado</th><th /></tr></thead>
                <tbody>{convites.map((c) => (
                  <tr key={c.id}><td>{c.email}</td><td>{PAPEL_ROTULO[c.papel]}</td><td>{dataBR(c.criado_em)}</td>
                    <td style={{ textAlign: 'right' }}><button className="btn btn-sm" type="button" onClick={() => cancelarConvite(c.id)}>Cancelar</button></td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

function PlanoUso() {
  const { org } = useSessao()
  const [plano, setPlano] = useState<Plano | null>(null)
  const [uso, setUso] = useState<{ consultas: number; exportacoes: number } | null>(null)
  const [nMembros, setNMembros] = useState(0)
  useEffect(() => {
    if (!org) return
    const mes = new Date().toISOString().slice(0, 7) + '-01'
    supabase.from('planos').select('*').eq('id', org.plano_id).single().then(({ data }) => setPlano(data as Plano))
    supabase.from('uso_mensal').select('consultas,exportacoes').eq('org_id', org.id).eq('mes', mes).maybeSingle().then(({ data }) => setUso(data || { consultas: 0, exportacoes: 0 }))
    supabase.from('membros').select('user_id', { count: 'exact', head: true }).eq('org_id', org.id).then(({ count }) => setNMembros(count || 0))
  }, [org])
  const lim = (n: number | null | undefined) => (n == null ? 'sem limite' : fmt(n))
  return (
    <section className="panel">
      <div className="panel-h"><h2>Plano {plano?.nome}</h2><span className="small muted">Cobrança ainda não ativada</span></div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Recurso</th><th className="num">Usado</th><th className="num">Limite</th></tr></thead>
          <tbody>
            <tr><td>Usuários</td><td className="num">{fmt(nMembros)}</td><td className="num">{lim(plano?.max_usuarios)}</td></tr>
            <tr><td>Exportações neste mês</td><td className="num">{fmt(uso?.exportacoes)}</td><td className="num">{lim(plano?.max_exportacoes_mes)}</td></tr>
            <tr><td>Consultas externas neste mês</td><td className="num">{fmt(uso?.consultas)}</td><td className="num">{lim(plano?.max_consultas_mes)}</td></tr>
          </tbody>
        </table>
      </div>
      <div className="panel-b small muted">Para mudar de plano, fale com o suporte do Clyvo Map.</div>
    </section>
  )
}

function Atividade() {
  const { org, ehAdmin } = useSessao()
  const [itens, setItens] = useState<{ id: number; acao: string; entidade: string | null; detalhes: Record<string, string> | null; criado_em: string }[] | null>(null)
  useEffect(() => {
    if (!org || !ehAdmin) return
    supabase.from('auditoria').select('id,acao,entidade,detalhes,criado_em').eq('org_id', org.id).order('criado_em', { ascending: false }).limit(100)
      .then(({ data }) => setItens((data as typeof itens) || []))
  }, [org, ehAdmin])
  if (!ehAdmin) return <div className="alert alert-warn">Só dono ou admin vê o registro de atividades.</div>
  return (
    <section className="panel">
      <div className="panel-h"><h2>Registro de atividades</h2><span className="small muted">últimos 100 eventos</span></div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Quando</th><th>O que aconteceu</th></tr></thead>
          <tbody>
            {itens === null ? <tr><td colSpan={2}><div className="empty"><div className="spinner" /></div></td></tr>
              : !itens.length ? <tr><td colSpan={2} className="muted">Nada registrado ainda.</td></tr>
              : itens.map((i) => (
                <tr key={i.id}>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>{dataHoraBR(i.criado_em)}</td>
                  <td>{ACOES[i.acao] || i.acao} {ENTIDADES[i.entidade || ''] ?? i.entidade} {i.detalhes?.nome || i.detalhes?.email || i.detalhes?.arquivo || ''}{i.detalhes?.linhas_ok ? ` (${i.detalhes.linhas_ok} linhas)` : ''}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}


function BatePapo() {
  const { org, ehAdmin, toast } = useSessao()
  const [url, setUrl] = useState('')
  const [segredo, setSegredo] = useState<string | null>(null)
  const [existe, setExiste] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [colunas, setColunas] = useState<{ id: string; nome: string }[]>([])
  const [colInt, setColInt] = useState('')
  const [colPerd, setColPerd] = useState('')
  async function carregar() {
    if (!org || !ehAdmin) return
    const [{ data }, cols] = await Promise.all([
      supabase.from('integracoes').select('webhook_url,segredo,coluna_interessado,coluna_perdido').eq('org_id', org.id).eq('tipo', 'bate_papo').maybeSingle(),
      supabase.from('colunas_funil').select('id,nome').eq('org_id', org.id).order('ordem'),
    ])
    setExiste(!!data); setUrl(data?.webhook_url || ''); setSegredo(data?.segredo || null)
    setColInt(data?.coluna_interessado || ''); setColPerd(data?.coluna_perdido || '')
    setColunas((cols.data as { id: string; nome: string }[]) || [])
  }
  useEffect(() => { carregar() }, [org, ehAdmin]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!ehAdmin) return <div className="alert alert-warn">Só dono ou admin configura o bate-papo.</div>
  async function salvar(e: FormEvent) {
    e.preventDefault(); setErro(null)
    const u = url.trim()
    if (!/^https:\/\/\S+$/.test(u)) return setErro('Cole o endereço completo do webhook, começando com https://')
    const { error } = await supabase.from('integracoes').upsert({ org_id: org!.id, tipo: 'bate_papo', webhook_url: u, coluna_interessado: colInt || null, coluna_perdido: colPerd || null, atualizado_em: new Date().toISOString() }, { onConflict: 'org_id,tipo' })
    if (error) return setErro(msgErro(error))
    toast('Bate-papo conectado'); carregar()
  }
  async function testar() {
    setErro(null); setOcupado(true)
    try { await chamarBatePapo(org!.id, 'testar'); toast('Teste enviado. Veja a execução no n8n.') } catch (e) { setErro((e as Error).message) } finally { setOcupado(false) }
  }
  async function remover() {
    if (!window.confirm('Desconectar o bate-papo desta empresa?')) return
    const { error } = await supabase.from('integracoes').delete().eq('org_id', org!.id).eq('tipo', 'bate_papo')
    if (error) return setErro(msgErro(error)); toast('Bate-papo desconectado'); carregar()
  }
  return (
    <form onSubmit={salvar} className="panel panel-b" style={{ display: 'grid', gap: 14, maxWidth: 640 }}>
      <div>
        <h2>Bate-papo (WhatsApp)</h2>
        <p className="small muted">Em Meus prospects, o botão Conectar bate-papo envia os prospects escolhidos para o seu fluxo no n8n, que faz a abordagem pelo WhatsApp.</p>
      </div>
      <label className="field"><span>Endereço do webhook (n8n)</span>
        <input id="bp-url" className="input" type="url" placeholder="https://seu-n8n/webhook/..." value={url} onChange={(e) => setUrl(e.target.value)} />
      </label>
      <p className="small muted">No n8n, abra o nó <b>Webhook</b> do fluxo, método POST, e copie a <b>Production URL</b>. O fluxo precisa estar ativo.</p>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <label className="field"><span>Quando o contato tiver interesse, mover para</span>
          <select id="bp-int" className="input" value={colInt} onChange={(e) => setColInt(e.target.value)}>
            <option value="">Não mover</option>{colunas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
        <label className="field"><span>Quando não tiver interesse, mover para</span>
          <select id="bp-perd" className="input" value={colPerd} onChange={(e) => setColPerd(e.target.value)}>
            <option value="">Não mover</option>{colunas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
      </div>
      {!colunas.length && <p className="small muted">Abra a aba Funil uma vez para criar as colunas e poder escolher aqui.</p>}
      {segredo && (
        <section style={{ display: 'grid', gap: 10, paddingTop: 6, borderTop: '1px solid var(--line)' }}>
          <h3>Retorno das conversas</h3>
          <p className="small muted">No n8n, depois de cada aviso do Umbler, use um nó HTTP Request (POST) para este endereço, com o cabeçalho <b>X-Clyvo-Token</b> e o corpo em JSON: <code>{'{ "prospect_id": "...", "evento": "respondeu", "texto": "..." }'}</code>. Eventos: entregue, lida, sem_whatsapp, respondeu, interessado, nao_interessado.</p>
          <label className="field"><span>Endereço de retorno</span>
            <input className="input mono" readOnly value={RETORNO_URL} onFocus={(e) => e.currentTarget.select()} />
          </label>
          <label className="field"><span>Chave de segurança (cabeçalho X-Clyvo-Token)</span>
            <input className="input mono" readOnly value={segredo} onFocus={(e) => e.currentTarget.select()} />
          </label>
        </section>
      )}
      {erro && <div className="alert alert-err">{erro}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" type="submit">Salvar</button>
        {existe && <button className="btn" type="button" onClick={testar} disabled={ocupado}>{ocupado ? 'Enviando…' : 'Enviar teste'}</button>}
        {existe && <button className="btn btn-danger" type="button" onClick={remover}>Desconectar</button>}
      </div>
    </form>
  )
}
export default function Configuracoes() {
  const [aba, setAba] = useState<Aba>('empresa')
  const ABAS: [Aba, string][] = [['empresa', 'Empresa'], ['membros', 'Membros'], ['plano', 'Plano e uso'], ['bate_papo', 'Bate-papo'], ['atividade', 'Atividades']]
  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <div className="page-head"><div><h1>Configurações</h1><p>Empresa, pessoas com acesso, limites do plano e registro de atividades.</p></div></div>
      <div className="auth-tabs" role="tablist" style={{ maxWidth: 520 }}>
        {ABAS.map(([k, r]) => <button key={k} type="button" role="tab" aria-pressed={aba === k} aria-selected={aba === k} onClick={() => setAba(k)}>{r}</button>)}
      </div>
      {aba === 'empresa' && <Empresa />}
      {aba === 'membros' && <Membros />}
      {aba === 'plano' && <PlanoUso />}
      {aba === 'bate_papo' && <BatePapo />}
      {aba === 'atividade' && <Atividade />}
    </div>
  )
}
