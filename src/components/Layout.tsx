import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useSessao } from '../context/Sessao'
import { supabase } from '../lib/supabase'
import { PAPEL_ROTULO } from '../lib/types'
import { IcClientes, IcConfig, IcMapa, IcPainel } from './Icones'

const ITENS = [
  { to: '/', rotulo: 'Dashboard', Ic: IcPainel, end: true },
  { to: '/mapa', rotulo: 'Mapa comercial', Ic: IcMapa },
  { to: '/clientes', rotulo: 'Clientes', Ic: IcClientes },
  { to: '/configuracoes', rotulo: 'Configurações', Ic: IcConfig },
]

export default function Layout() {
  const { org, orgs, trocarOrg, session } = useSessao()
  const [aberto, setAberto] = useState(false)
  const loc = useLocation()
  const ehMapa = loc.pathname.startsWith('/mapa')

  return (
    <div className="app">
      <div className="mobile-bar">
        <button type="button" onClick={() => setAberto(true)} aria-label="Abrir menu">☰ Menu</button>
        <b style={{ letterSpacing: '.06em' }}>RAIO MAP</b>
        <span className="small" style={{ opacity: 0.8 }}>{org?.nome}</span>
      </div>
      <aside className={'sidebar' + (aberto ? ' open' : '')} onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setAberto(false) }}>
        <a className="brand" href="/"><img src="/logo.svg" alt="" /><b>RAIO MAP</b></a>
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
      <main className="main" style={ehMapa ? { overflow: 'hidden' } : undefined}>
        <Outlet />
      </main>
    </div>
  )
}
