import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Municipio, Organizacao, Papel } from '../lib/types'
import { indexarMunicipios, type IndiceMunicipios } from '../lib/geo'

interface OrgComPapel extends Organizacao { papel: Papel }

interface Ctx {
  session: Session | null
  carregando: boolean
  orgs: OrgComPapel[]
  org: OrgComPapel | null
  trocarOrg: (id: string) => void
  recarregarOrgs: () => Promise<void>
  podeEditar: boolean
  ehAdmin: boolean
  municipios: Municipio[]
  idxMun: IndiceMunicipios | null
  toast: (m: string) => void
}

const SessaoCtx = createContext<Ctx | null>(null)
export const useSessao = () => {
  const c = useContext(SessaoCtx)
  if (!c) throw new Error('useSessao fora do provedor')
  return c
}

const CHAVE_ORG = 'raiomap.org'

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [orgs, setOrgs] = useState<OrgComPapel[]>([])
  const [orgId, setOrgId] = useState<string | null>(() => {
    try { return localStorage.getItem(CHAVE_ORG) } catch { return null }
  })
  const [municipios, setMunicipios] = useState<Municipio[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (!data.session) setCarregando(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const recarregarOrgs = useCallback(async () => {
    const uid = session?.user.id
    if (!uid) { setOrgs([]); return }
    await supabase.rpc('aceitar_convites')
    const { data, error } = await supabase
      .from('membros')
      .select('papel, organizacoes(*)')
      .eq('user_id', uid)
    if (error) throw error
    const lista = (data || [])
      .filter((r) => r.organizacoes)
      .map((r) => ({ ...(r.organizacoes as unknown as Organizacao), papel: r.papel as Papel }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    setOrgs(lista)
  }, [session?.user.id])

  useEffect(() => {
    if (!session) return
    setCarregando(true)
    Promise.all([
      recarregarOrgs(),
      supabase.from('municipios').select('*').range(0, 5999).then(({ data }) => setMunicipios((data as Municipio[]) || [])),
    ]).finally(() => setCarregando(false))
  }, [session, recarregarOrgs])

  const org = useMemo(() => orgs.find((o) => o.id === orgId) || orgs[0] || null, [orgs, orgId])
  const idxMun = useMemo(() => (municipios.length ? indexarMunicipios(municipios) : null), [municipios])

  const trocarOrg = (id: string) => {
    setOrgId(id)
    try { localStorage.setItem(CHAVE_ORG, id) } catch { /* sem armazenamento */ }
  }
  const toast = useCallback((m: string) => {
    setMsg(m)
    window.setTimeout(() => setMsg((x) => (x === m ? null : x)), 3200)
  }, [])

  const valor: Ctx = {
    session, carregando, orgs, org, trocarOrg, recarregarOrgs,
    podeEditar: !!org && org.papel !== 'leitor',
    ehAdmin: !!org && (org.papel === 'dono' || org.papel === 'admin'),
    municipios, idxMun, toast,
  }
  return (
    <SessaoCtx.Provider value={valor}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </SessaoCtx.Provider>
  )
}
