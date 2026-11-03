import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SessaoProvider, useSessao } from './context/Sessao'
import Layout from './components/Layout'
import Login from './pages/Login'
import NovaEmpresa from './pages/NovaEmpresa'
import Dashboard from './pages/Dashboard'
import Clientes from './pages/Clientes'
import Importar from './pages/Importar'
import Configuracoes from './pages/Configuracoes'
import NovaSenha from './pages/NovaSenha'
import Prospeccao from './pages/Prospeccao'
import Funil from './pages/Funil'
import ComoUsar from './pages/ComoUsar'
import Recuperacao from './pages/Recuperacao'
import ClyvoAI from './pages/ClyvoAI'
import Relatorio from './pages/Relatorio'
import Simulador from './pages/Simulador'
import RotasVisita from './pages/Rotas'
import Concorrencia from './pages/Concorrencia'

const MapaComercial = lazy(() => import('./pages/MapaComercial'))

function Carregando() {
  return <div className="center-fill"><div className="spinner" aria-label="Carregando" /></div>
}

function Rotas() {
  const { session, carregando, orgs } = useSessao()
  if (location.pathname === '/nova-senha') return <NovaSenha />
  if (!session) return carregando ? <Carregando /> : <Login />
  if (carregando) return <Carregando />
  if (!orgs.length) return <NovaEmpresa primeira />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="mapa" element={<Suspense fallback={<Carregando />}><MapaComercial /></Suspense>} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="clientes/importar" element={<Importar />} />
        <Route path="prospeccao" element={<Prospeccao />} />
        <Route path="inativos" element={<Recuperacao />} />
        <Route path="clyvo-ai" element={<ClyvoAI />} />
        <Route path="concorrencia" element={<Concorrencia />} />
        <Route path="rotas" element={<RotasVisita />} />
        <Route path="simulador" element={<Simulador />} />
        <Route path="relatorio" element={<Relatorio />} />
        <Route path="funil" element={<Funil />} />
        <Route path="como-usar" element={<ComoUsar />} />
        <Route path="configuracoes" element={<Configuracoes />} />
        <Route path="nova-empresa" element={<NovaEmpresa />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <SessaoProvider>
        <Rotas />
      </SessaoProvider>
    </BrowserRouter>
  )
}
