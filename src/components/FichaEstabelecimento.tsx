import { useEffect, useState } from 'react'
import { useSessao } from '../context/Sessao'
import { msgErro, supabase } from '../lib/supabase'
import { dataBR, formatarDoc } from '../lib/format'
import { UF_NOMES } from '../lib/geo'
import { CONFIANCA_ROTULO, useSegmento, type Estabelecimento, type ResultadoGoogle } from '../lib/prospeccao'

const FONTE_ROTULO: Record<string, string> = {
  receita: 'Receita Federal (dados abertos do CNPJ)',
  espelho: 'Receita Federal, via espelho da base aberta do CNPJ',
  manual: 'Cadastro manual',
}

export default function FichaEstabelecimento({ id, onClose, onProspect }: { id: number; onClose: () => void; onProspect?: (prospectId: string) => void }) {
  const { org, podeEditar, toast } = useSessao()
  const { rotulo } = useSegmento()
  const [e, setE] = useState<Estabelecimento | null>(null)
  const [cidade, setCidade] = useState('')
  const [jaCliente, setJaCliente] = useState(false)
  const [prospectId, setProspectId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [google, setGoogle] = useState<ResultadoGoogle | null>(null)
  const [buscandoGoogle, setBuscandoGoogle] = useState(false)

  useEffect(() => {
    if (!org) return
    setE(null); setGoogle(null)
    ;(async () => {
      const { data, error } = await supabase.from('estabelecimentos').select('*').eq('id', id).single()
      if (error) return setErro(msgErro(error))
      const est = data as Estabelecimento
      setE(est)
      const [m, c, p] = await Promise.all([
        est.municipio_ibge ? supabase.from('municipios').select('nome').eq('ibge', est.municipio_ibge).single() : Promise.resolve({ data: null }),
        est.cnpj ? supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('org_id', org.id).eq('documento', est.cnpj) : Promise.resolve({ count: 0 }),
        supabase.from('prospects').select('id').eq('org_id', org.id).eq('estabelecimento_id', id).maybeSingle(),
      ])
      setCidade((m.data as { nome: string } | null)?.nome || '')
      setJaCliente(((c as { count: number | null }).count || 0) > 0)
      setProspectId((p.data as { id: string } | null)?.id || null)
    })()
  }, [id, org])

  useEffect(() => {
    const esc = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  async function adicionar() {
    if (!org || !e) return
    const { data, error } = await supabase.rpc('adicionar_prospect', { p_org: org.id, p_estab: e.id })
    if (error) return setErro(msgErro(error))
    setProspectId(data as string); toast('Adicionado aos seus prospects'); onProspect?.(data as string)
  }

  async function buscarGoogle() {
    if (!org || !e) return
    setBuscandoGoogle(true); setErro(null)
    const { data, error } = await supabase.functions.invoke('google-places', { body: { org_id: org.id, estabelecimento_id: e.id } })
    setBuscandoGoogle(false)
    if (error) {
      let m = msgErro(error)
      try { const ctx = (error as { context?: Response }).context; if (ctx) m = (await ctx.json()).erro || m } catch { /* resposta sem JSON */ }
      return setErro(m)
    }
    setGoogle(data as ResultadoGoogle)
  }

  const nome = e ? (e.nome_fantasia || e.razao_social || 'Sem nome') : ''
  const ia = e?.ia_avaliacao as { e_do_segmento?: boolean; motivo?: string; confianca?: number } | null

  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Ficha do estabelecimento">
        {!e ? <div className="center-fill">{erro ? <div className="alert alert-err">{erro}</div> : <div className="spinner" />}</div> : (<>
          <div className="drawer-h">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <h2>{nome}</h2>
                {e.razao_social && e.razao_social !== nome && <span className="muted">{e.razao_social}</span>}
              </div>
              <button className="btn btn-ghost btn-sm" type="button" onClick={onClose}>Fechar</button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="pill pill-potencial"><span className="dot" style={{ background: 'var(--cat-potencial)' }} />{jaCliente ? 'Já é seu cliente' : prospectId ? 'Na sua lista de prospects' : 'Potencial cliente'}</span>
              {e.confiabilidade && <span className={'pill conf-' + e.confiabilidade}>Confiabilidade {CONFIANCA_ROTULO[e.confiabilidade]}</span>}
              <span className="small muted">{cidade ? `${cidade} – ${e.uf}` : e.uf}</span>
            </div>
          </div>
          <div className="drawer-b">
            {erro && <div className="alert alert-err">{erro}</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!jaCliente && !prospectId && podeEditar && <button className="btn btn-primary" type="button" onClick={adicionar}>Adicionar aos prospects</button>}
              <button className="btn" type="button" onClick={buscarGoogle} disabled={buscandoGoogle}>{buscandoGoogle ? 'Buscando…' : 'Buscar no Google'}</button>
            </div>

            {google && (
              <section className="panel panel-b" style={{ display: 'grid', gap: 8 }}>
                <h3>Encontrado no Google</h3>
                {!google.lugar ? <p className="small muted">Nenhum resultado no Google para esse nome e cidade.</p> : (
                  <dl className="kv">
                    <dt>Nome no Google</dt><dd>{google.lugar.nome}</dd>
                    <dt>Endereço</dt><dd>{google.lugar.endereco || '—'}</dd>
                    <dt>Telefone</dt><dd className="mono">{google.lugar.telefone || '—'}</dd>
                    <dt>Site</dt><dd>{google.lugar.site ? <a href={google.lugar.site} target="_blank" rel="noopener">{google.lugar.site.replace(/^https?:\/\//, '')}</a> : '—'}</dd>
                    <dt>Situação</dt><dd>{google.lugar.status === 'OPERATIONAL' ? 'Funcionando' : google.lugar.status === 'CLOSED_PERMANENTLY' ? 'Fechado definitivamente' : google.lugar.status === 'CLOSED_TEMPORARILY' ? 'Fechado temporariamente' : '—'}</dd>
                    {google.lugar.horarios && (<><dt>Horários</dt><dd className="small">{google.lugar.horarios.join(' · ')}</dd></>)}
                  </dl>
                )}
                {google.lugar?.mapa && <a className="small" href={google.lugar.mapa} target="_blank" rel="noopener">Ver no Google Maps</a>}
                <p className="small muted">Consulta feita agora no Google Places. Esses dados não ficam guardados; consulte de novo quando precisar.{google.uso ? ` Consultas no mês: ${google.uso}.` : ''}</p>
              </section>
            )}

            <dl className="kv">
              <dt>CNPJ</dt><dd className="mono">{formatarDoc(e.cnpj)}</dd>
              <dt>Categoria</dt><dd>{rotulo(e.categoria)}</dd>
              <dt>CNAE principal</dt><dd className="mono">{e.cnae_principal || '—'}</dd>
              <dt>Endereço</dt><dd>{[e.logradouro, e.numero, e.complemento, e.bairro].filter(Boolean).join(', ') || '—'}</dd>
              <dt>CEP</dt><dd className="mono">{e.cep || '—'}</dd>
              <dt>Cidade</dt><dd>{cidade ? `${cidade} – ${UF_NOMES[e.uf || ''] || e.uf}` : '—'}</dd>
              <dt>Telefone</dt><dd className="mono">{e.telefone || '—'}</dd>
              <dt>E-mail</dt><dd>{e.email || '—'}</dd>
              <dt>Situação na Receita</dt><dd>{e.situacao_cadastral === '02' ? 'Ativa' : e.situacao_cadastral || '—'}</dd>
              <dt>Aberta em</dt><dd>{dataBR(e.data_abertura) || '—'}</dd>
              {e.porte && (<><dt>Porte</dt><dd>{e.porte}</dd></>)}
            </dl>

            <section style={{ display: 'grid', gap: 6 }}>
              <h3>De onde veio</h3>
              <dl className="kv small">
                <dt>Fonte</dt><dd>{FONTE_ROTULO[e.fonte_principal] || e.fonte_principal}</dd>
                <dt>Base de</dt><dd>{e.mes_referencia || '—'}</dd>
                <dt>Atualizado em</dt><dd>{dataBR(e.atualizado_em)}</dd>
                <dt>Por que entrou</dt><dd>{e.criterio_inclusao || '—'}</dd>
              </dl>
              {ia && (
                <div className="obs">
                  <b>Avaliação da IA:</b> {ia.e_do_segmento === false ? 'provavelmente não é do segmento. ' : ia.e_do_segmento ? 'parece ser do segmento. ' : ''}{ia.motivo}
                </div>
              )}
              <p className="small muted">Dados públicos de empresas. Telefone e e-mail são os informados à Receita e podem estar desatualizados.</p>
            </section>
          </div>
        </>)}
      </aside>
    </>
  )
}
