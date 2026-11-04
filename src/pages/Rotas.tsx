import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSessao } from '../context/Sessao'
import { msgErro, supabase } from '../lib/supabase'
import { dataHoraBR, fmt, km } from '../lib/format'
import { ehPago, podeExportar } from '../lib/plano'
import { distanciaTotal, linkGoogleMaps, otimizar } from '../lib/rota'
import Bloqueado from '../components/Bloqueado'
import MiniMapa, { type PontoMini } from '../components/MiniMapa'

interface Cand { chave: string; tipo: 'cliente' | 'prospect'; ref: string; nome: string; endereco: string; cidade: string; uf: string; lat: number; lng: number }
interface Parada { id?: string; tipo: 'cliente' | 'prospect'; ref_id: string; nome: string; endereco: string | null; lat: number; lng: number; ordem?: number; visitado_em?: string | null; observacao?: string | null }
interface RotaSalva { id: string; nome: string; criado_em: string; responsavel_id: string | null; rota_paradas: Parada[] }
interface Membro { user_id: string; email: string; papel: string }
const MAX = 25

export default function Rotas() {
  const { org } = useSessao()
  if (!ehPago(org)) return <Bloqueado titulo="Planejador de rotas" descricao="Selecione clientes e prospects, deixe o sistema ordenar as visitas pela proximidade, veja a rota no mapa, marque visitas feitas e guarde o histórico." />
  return <Tela />
}

function Tela() {
  const { org, municipios, podeEditar, toast, session } = useSessao()
  const uid = session?.user.id
  const [params] = useSearchParams()
  const [membros, setMembros] = useState<Membro[]>([])
  const [resp, setResp] = useState('')
  const [fonte, setFonte] = useState<'cliente' | 'prospect'>('cliente')
  const [uf, setUf] = useState(''); const [cidade, setCidade] = useState(''); const [q, setQ] = useState('')
  const [cands, setCands] = useState<Cand[] | null>(null)
  const [escolhidos, setEscolhidos] = useState<Cand[]>([])
  const [rota, setRota] = useState<Parada[]>([])
  const [nome, setNome] = useState('')
  const [salvas, setSalvas] = useState<RotaSalva[]>([])
  const [aberta, setAberta] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const ufs = useMemo(() => [...new Set(municipios.map((m) => m.uf))].sort(), [municipios])

  const carregarSalvas = useCallback(async () => {
    if (!org) return
    const { data, error } = await supabase.from('rotas').select('id,nome,criado_em,responsavel_id,rota_paradas(id,tipo,ref_id,nome,endereco,lat,lng,ordem,visitado_em,observacao)').eq('org_id', org.id).order('criado_em', { ascending: false }).limit(30)
    if (error) return setErro(msgErro(error))
    setSalvas(((data as unknown as RotaSalva[]) || []).map((r) => ({ ...r, rota_paradas: [...r.rota_paradas].sort((a, b) => (a.ordem || 0) - (b.ordem || 0)) })))
  }, [org])
  useEffect(() => { carregarSalvas() }, [carregarSalvas])
  useEffect(() => { if (org) supabase.rpc('listar_membros', { p_org: org.id }).then(({ data }) => setMembros((data as Membro[]) || [])) }, [org])
  useEffect(() => { const r = params.get('rota'); if (r) setAberta(r) }, [params])

  async function buscar() {
    if (!org) return
    setErro(null); setCands(null)
    if (fonte === 'cliente') {
      let qb = supabase.from('clientes').select('id,nome,nome_fantasia,logradouro,bairro,cidade,uf,lat,lng').eq('org_id', org.id).not('lat', 'is', null).limit(300)
      if (uf) qb = qb.eq('uf', uf); if (cidade.trim()) qb = qb.ilike('cidade', cidade.trim() + '%'); if (q.trim()) qb = qb.ilike('nome', '%' + q.trim() + '%')
      const { data, error } = await qb.order('nome')
      if (error) return setErro(msgErro(error))
      setCands((data || []).map((c: any) => ({ chave: 'c' + c.id, tipo: 'cliente' as const, ref: c.id, nome: c.nome_fantasia || c.nome, endereco: [c.logradouro, c.bairro].filter(Boolean).join(', '), cidade: c.cidade || '', uf: c.uf || '', lat: c.lat, lng: c.lng }))) // eslint-disable-line @typescript-eslint/no-explicit-any
    } else {
      let qb = supabase.from('prospects').select('id,nome,logradouro,bairro,cidade,uf,lat,lng').eq('org_id', org.id).not('lat', 'is', null).limit(300)
      if (uf) qb = qb.eq('uf', uf); if (cidade.trim()) qb = qb.ilike('cidade', cidade.trim() + '%'); if (q.trim()) qb = qb.ilike('nome', '%' + q.trim() + '%')
      const { data, error } = await qb.order('nome')
      if (error) return setErro(msgErro(error))
      setCands((data || []).map((c: any) => ({ chave: 'p' + c.id, tipo: 'prospect' as const, ref: c.id, nome: c.nome, endereco: [c.logradouro, c.bairro].filter(Boolean).join(', '), cidade: c.cidade || '', uf: c.uf || '', lat: c.lat, lng: c.lng }))) // eslint-disable-line @typescript-eslint/no-explicit-any
    }
  }
  const alternar = (c: Cand) => setEscolhidos((l) => l.some((x) => x.chave === c.chave) ? l.filter((x) => x.chave !== c.chave) : l.length >= MAX ? (toast(`Máximo de ${MAX} paradas por rota.`), l) : [...l, c])

  function montar() {
    const ps: Parada[] = escolhidos.map((c) => ({ tipo: c.tipo, ref_id: c.ref, nome: c.nome, endereco: [c.endereco, c.cidade && c.cidade + '/' + c.uf].filter(Boolean).join(' · '), lat: c.lat, lng: c.lng }))
    setRota(otimizar(ps)); setAberta(null)
  }
  const mover = (i: number, d: number) => setRota((r) => { const n = [...r], j = i + d; if (j < 0 || j >= n.length) return r; [n[i], n[j]] = [n[j], n[i]]; return n })
  const tirar = (i: number) => setRota((r) => r.filter((_, k) => k !== i))

  async function guardar() {
    if (!org || rota.length < 2) return
    const { data: u } = await supabase.auth.getUser()
    const { data: r, error } = await supabase.from('rotas').insert({ org_id: org.id, nome: nome.trim() || `Rota de ${new Date().toLocaleDateString('pt-BR')}`, criado_por: u.user?.id, responsavel_id: resp || null }).select('id').single()
    if (error) return toast(msgErro(error))
    const { error: e2 } = await supabase.from('rota_paradas').insert(rota.map((p, i) => ({ rota_id: r.id, org_id: org.id, tipo: p.tipo, ref_id: p.ref_id, nome: p.nome, endereco: p.endereco, lat: p.lat, lng: p.lng, ordem: i })))
    if (e2) { await supabase.from('rotas').delete().eq('id', r.id); return toast(msgErro(e2)) }
    toast(resp ? 'Rota salva e atribuída. Use Compartilhar para avisar o representante.' : 'Rota salva.'); setRota([]); setEscolhidos([]); setNome(''); setResp(''); await carregarSalvas(); setAberta(r.id)
  }

  const pts: PontoMini[] = rota.map((p, i) => ({ id: String(i), lat: p.lat, lng: p.lng, cor: '#2563c9', titulo: p.nome, rotulo: String(i + 1) }))
  const dist = distanciaTotal(rota)
  const link = linkGoogleMaps(rota)

  return (
    <div className="page">
      <div className="page-head"><div><h1>Rotas de visita</h1><p>Escolha quem visitar e o sistema sugere a ordem pela proximidade. Você pode ajustar na mão.</p></div></div>
      {erro && <div className="alert alert-err" role="alert">{erro}</div>}
      <div className="dois-col">
        <section className="panel" style={{ padding: 16, display: 'grid', gap: 12 }}>
          <b>1. Escolha as paradas</b>
          <div className="filtros">
            <label className="field"><span>Quem</span><select className="input" value={fonte} onChange={(e) => { setFonte(e.target.value as 'cliente' | 'prospect'); setCands(null) }}><option value="cliente">Clientes</option><option value="prospect">Prospects</option></select></label>
            <label className="field"><span>Estado</span><select className="input" value={uf} onChange={(e) => setUf(e.target.value)}><option value="">Todos</option>{ufs.map((u) => <option key={u}>{u}</option>)}</select></label>
            <label className="field"><span>Cidade</span><input className="input" value={cidade} onChange={(e) => setCidade(e.target.value)} /></label>
            <label className="field"><span>Nome</span><input className="input" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            <button className="btn" type="button" onClick={buscar}>Buscar</button>
          </div>
          {cands && (
            <div className="table-wrap" style={{ maxHeight: 300, overflow: 'auto' }}><table className="t"><tbody>
              {!cands.length && <tr><td><div className="empty"><p>Nenhum com localização no mapa.</p></div></td></tr>}
              {cands.map((c) => (
                <tr key={c.chave}><td style={{ width: 28 }}><input type="checkbox" aria-label={'Selecionar ' + c.nome} checked={escolhidos.some((x) => x.chave === c.chave)} onChange={() => alternar(c)} /></td>
                  <td><b>{c.nome}</b><div className="small muted">{c.cidade}/{c.uf}{c.endereco ? ' · ' + c.endereco : ''}</div></td></tr>))}
            </tbody></table></div>
          )}
          <div className="small muted">{escolhidos.length} de {MAX} selecionados. A primeira parada da lista é o ponto de partida.</div>
          <div><button className="btn btn-primary" type="button" disabled={escolhidos.length < 2} onClick={montar}>Montar rota</button></div>
        </section>

        <section style={{ display: 'grid', gap: 12 }}>
          {rota.length > 0 ? (
            <>
              <MiniMapa pontos={pts} linha={rota.map((p) => [p.lat, p.lng])} altura={300} />
              <div className="panel" style={{ padding: 16, display: 'grid', gap: 10 }}>
                <b>2. Ordem das visitas · {km(dist)} em linha reta</b>
                <ol className="rota-lista">
                  {rota.map((p, i) => (
                    <li key={p.ref_id + i}><span><b>{p.nome}</b><div className="small muted">{p.endereco}</div></span>
                      <span className="rota-acoes"><button className="btn" type="button" aria-label="Subir" onClick={() => mover(i, -1)} disabled={i === 0}>↑</button><button className="btn" type="button" aria-label="Descer" onClick={() => mover(i, 1)} disabled={i === rota.length - 1}>↓</button><button className="btn" type="button" aria-label="Tirar da rota" onClick={() => tirar(i)}>×</button></span></li>))}
                </ol>
                <div className="small muted">A distância é em linha reta, só para ordenar. O trajeto por ruas abre no Google Maps.</div>
                <div className="filtros"><input className="input" style={{ flex: 1 }} placeholder="Nome da rota (opcional)" value={nome} onChange={(e) => setNome(e.target.value)} />
                  <select className="input" aria-label="Representante responsável" value={resp} onChange={(e) => setResp(e.target.value)}><option value="">Sem responsável</option>{membros.map((m) => <option key={m.user_id} value={m.user_id}>{m.email}{m.user_id === uid ? ' (eu)' : ''}</option>)}</select>
                  {podeEditar && <button className="btn btn-primary" type="button" onClick={guardar} disabled={rota.length < 2}>Salvar rota</button>}
                  {link && <a className="btn" href={link} target="_blank" rel="noreferrer">Abrir no Google Maps</a>}</div>
              </div>
            </>
          ) : <div className="empty"><h2>Nenhuma rota em montagem</h2><p>Marque pelo menos 2 paradas e clique em Montar rota.</p></div>}
        </section>
      </div>

      <section className="panel">
        <div className="panel-h"><h2>Rotas salvas e histórico de visitas</h2></div>
        {!salvas.length && <div className="panel-b muted">Nenhuma rota salva ainda.</div>}
        {[...salvas].sort((a, b) => Number(b.responsavel_id === uid) - Number(a.responsavel_id === uid)).map((r) => <RotaSalvaView key={r.id} r={r} aberta={aberta === r.id} onAbrir={() => setAberta(aberta === r.id ? null : r.id)} onMudou={carregarSalvas} podeEditar={podeEditar} membros={membros} uid={uid} />)}
      </section>
    </div>
  )
}

function RotaSalvaView({ r, aberta, onAbrir, onMudou, podeEditar, membros, uid }: { r: RotaSalva; aberta: boolean; onAbrir: () => void; onMudou: () => void; podeEditar: boolean; membros: Membro[]; uid?: string }) {
  const { toast, org } = useSessao()
  const liberado = podeExportar(org)
  const feitas = r.rota_paradas.filter((p) => p.visitado_em).length
  const dono = membros.find((m) => m.user_id === r.responsavel_id)
  const linkApp = `${location.origin}/rotas?rota=${r.id}`
  async function atribuir(v: string) {
    const { error } = await supabase.from('rotas').update({ responsavel_id: v || null }).eq('id', r.id)
    if (error) return toast(msgErro(error)); toast(v ? 'Rota atribuída.' : 'Responsável removido.'); onMudou()
  }
  function textoCompartilhar() {
    const paradas = r.rota_paradas.map((p, i) => `${i + 1}. ${p.nome}${p.endereco ? ' - ' + p.endereco : ''}`).join('\n')
    const maps = linkGoogleMaps(r.rota_paradas)
    return `Rota de visitas: ${r.nome}\n\n${paradas}\n\n${maps ? 'Trajeto no Google Maps: ' + maps + '\n' : ''}Marcar visitas no Clyvo Map: ${linkApp}`
  }
  async function compartilhar() {
    if (!liberado) return
    const t = textoCompartilhar()
    try { if (navigator.share) { await navigator.share({ title: r.nome, text: t }); return } } catch { return }
    window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank', 'noreferrer')
  }
  async function copiarLink() { try { await navigator.clipboard.writeText(linkApp); toast('Link copiado.') } catch { toast(linkApp) } }
  async function marcar(p: Parada, obs: string, feita: boolean) {
    const { data: u } = await supabase.auth.getUser()
    const { error } = await supabase.from('rota_paradas').update(feita ? { visitado_em: new Date().toISOString(), visitado_por: u.user?.id, observacao: obs.trim() || null } : { visitado_em: null, visitado_por: null }).eq('id', p.id!)
    if (error) return toast(msgErro(error)); onMudou()
  }
  async function apagar() { const { error } = await supabase.from('rotas').delete().eq('id', r.id); if (error) return toast(msgErro(error)); onMudou() }
  return (
    <div className="rota-salva">
      <button type="button" className="rota-cab" onClick={onAbrir} aria-expanded={aberta}><b>{r.nome}</b><span className="small muted">{r.responsavel_id === uid ? 'Minha rota · ' : dono ? dono.email + ' · ' : ''}{dataHoraBR(r.criado_em)} · {feitas}/{r.rota_paradas.length} visitadas {aberta ? '▲' : '▼'}</span></button>
      {aberta && (
        <div className="panel-b" style={{ display: 'grid', gap: 10 }}>
          <MiniMapa pontos={r.rota_paradas.map((p, i) => ({ id: String(i), lat: p.lat, lng: p.lng, cor: p.visitado_em ? '#2f9e5b' : '#2563c9', titulo: p.nome, rotulo: String(i + 1) }))} linha={r.rota_paradas.map((p) => [p.lat, p.lng])} altura={240} />
          {r.rota_paradas.map((p, i) => <Visita key={p.id} p={p} n={i + 1} podeEditar={podeEditar} onMarcar={marcar} />)}
          <div className="filtros" style={{ alignItems: 'center' }}>
            <label className="field"><span>Representante responsável</span>
              <select className="input" value={r.responsavel_id || ''} disabled={!podeEditar} onChange={(e) => atribuir(e.target.value)}><option value="">Sem responsável</option>{membros.map((m) => <option key={m.user_id} value={m.user_id}>{m.email}{m.user_id === uid ? ' (eu)' : ''}</option>)}</select></label>
            <button className="btn btn-primary" type="button" onClick={compartilhar} disabled={!liberado} title={liberado ? undefined : 'Compartilhar rota está disponível nos planos pagos'}>{liberado ? 'Compartilhar' : 'Compartilhar (plano pago)'}</button>
            <button className="btn" type="button" onClick={copiarLink} disabled={!liberado} title={liberado ? undefined : 'Disponível nos planos pagos'}>Copiar link</button>
          </div>
          <div className="small muted">O representante precisa ter acesso à empresa (Configurações → Membros, papel Vendedor). Ele abre o link, entra e marca cada visita.</div>
          <div className="filtros">{linkGoogleMaps(r.rota_paradas) && <a className="btn" href={linkGoogleMaps(r.rota_paradas)!} target="_blank" rel="noreferrer">Abrir no Google Maps</a>}
            {podeEditar && <button className="btn" type="button" onClick={() => confirm('Apagar esta rota e o histórico de visitas dela?') && apagar()}>Apagar rota</button>}</div>
          <div className="small muted">{fmt(feitas)} visitas registradas nesta rota.</div>
        </div>
      )}
    </div>
  )
}

function Visita({ p, n, podeEditar, onMarcar }: { p: Parada; n: number; podeEditar: boolean; onMarcar: (p: Parada, obs: string, feita: boolean) => void }) {
  const [obs, setObs] = useState(p.observacao || '')
  return (
    <div className="visita">
      <span className="mm-num" style={{ background: p.visitado_em ? '#2f9e5b' : '#2563c9' }}>{n}</span>
      <div style={{ flex: 1 }}><b>{p.nome}</b><div className="small muted">{p.endereco}</div>
        {p.visitado_em ? <div className="small">Visitado em {dataHoraBR(p.visitado_em)}{p.observacao ? ' · ' + p.observacao : ''}</div>
          : podeEditar && <input className="input" style={{ marginTop: 6 }} placeholder="Observações da visita" value={obs} onChange={(e) => setObs(e.target.value)} aria-label={'Observações da visita a ' + p.nome} />}</div>
      {podeEditar && (p.visitado_em ? <button className="btn" type="button" onClick={() => onMarcar(p, '', false)}>Desfazer</button> : <button className="btn btn-primary" type="button" onClick={() => onMarcar(p, obs, true)}>Marcar visitado</button>)}
    </div>
  )
}
