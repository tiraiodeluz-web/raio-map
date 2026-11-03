import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useSessao } from '../context/Sessao'
import { supabase } from '../lib/supabase'
import { PAPEL_ROTULO } from '../lib/types'
import Marca from './Marca'
import { diasDeTeste, OFERTA } from '../lib/oferta'
import { IcAjuda, IcClientes, IcConfig, IcFunil, IcMapa, IcPainel, IcProspeccao } from './Icones'

const ITENS = [
  { to: '/', rotulo: 'Dashboard', Ic: IcPainel, end: true },
  { to: '/mapa', rotulo: 'Mapa comercial', Ic: IcMapa },
  { to: '/clientes', rotulo: 'Clientes', Ic: IcClientes },
  { to: '/prospeccao', rotulo: 'Prospecção', Ic: IcProspeccao },
  { to: '/funil', rotulo: 'Funil', Ic: IcFunil },
  { to: '/configuracoes', rotulo: 'Configurações', Ic: IcConfig },
  { to: '/como-usar', rotulo: 'Como usar', Ic: IcAjuda },
]

export default function Layout() {
  const { org, orgs, trocarOrg, session } = useSessao()
  const [aberto, setAberto] = useState(false)
  const loc = useLocation()
  const ehMapa = loc.pathname.startsWith('/mapa')
  const dias = diasDeTeste(org)

  return (
    <div className="app">
      <div className="mobile-bar">
        <button type="button" onClick={() => setAberto(true)} aria-label="Abrir menu">☰ Menu</button>
        <Marca compacta />
        <span className="small" style={{ opacity: 0.8 }}>{org?.nome}</span>
      </div>
      <aside className={'sidebar' + (aberto ? ' open' : '')} onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setAberto(false) }}>
        <Link className="brand" to="/"><Marca /></Link>
        {orgs.length > 1 ? (
          <div className="org-switch">
            <select aria-label="Empresa" value={org?.id} onChange={(e) => trocarOrg(e.target.value)}>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </div>
        ) : (
          <div className="org-name">{org?.nome}</div>
        )}
        <nav className="nav">
          {ITENS.map(({ to, rotulo, Ic, end }) => (
            <NavLink key={to} to={to} end={end}><Ic />{rotulo}</NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span>{session?.user.email}{org ? ` · ${PAPEL_ROTULO[org.papel]}` : ''}</span>
          <button type="button" onClick={() => supabase.auth.signOut()}>Sair</button>
          {aberto && <button type="button" onClick={() => setAberto(false)}>Fechar menu</button>}
        </div>
      </aside>
      <main className="main" style={ehMapa && dias !== 0 ? { overflow: 'hidden', display: 'flex', flexDirection: 'column' } : undefined}>
        {dias !== null && dias > 0 && (
          <div className="faixa-teste" role="status">
            <span><b>Teste grátis:</b> {dias === 1 ? 'último dia' : `faltam ${dias} dias`}. Depois, licença por {OFERTA.preco} ({OFERTA.desconto} {OFERTA.validade}), {OFERTA.precoDetalhe}.</span>
            <a className="btn btn-sm btn-primary" href={OFERTA.contato} target="_blank" rel="noopener">Contratar</a>
          </div>
        )}
        {dias === 0 ? (
          <div className="page" style={{ maxWidth: 640 }}>
            <section className="panel panel-b" style={{ display: 'grid', gap: 14, marginTop: 40 }}>
              <h1>Seu teste grátis terminou</h1>
              <p>Os {OFERTA.diasTeste} dias de teste da empresa {org?.nome} acabaram. Seus clientes, prospects e anotações continuam guardados e voltam a aparecer assim que a licença for ativada.</p>
              <p><b>Licença do Clyvo Map: <s>{OFERTA.precoOriginal}</s> {OFERTA.preco}</b> ({OFERTA.desconto} {OFERTA.validade}), {OFERTA.precoDetalhe}. {OFERTA.custosCliente}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a className="btn btn-primary" href={OFERTA.contato} target="_blank" rel="noopener">Falar com a Clyvo</a>
                <button className="btn" type="button" onClick={() => supabase.auth.signOut()}>Sair</button>
              </div>
            </section>
          </div>
        ) : <div style={ehMapa ? { flex: 1, minHeight: 0 } : undefined}><Outlet /></div>}
      </main>
    </div>
  )
}
