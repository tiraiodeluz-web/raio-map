import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { ClienteMapa } from './types'

export const COLS_MAPA = 'id,nome,nome_fantasia,cidade,uf,municipio_ibge,lat,lng,situacao,telefones,contato,cep,codigo_erp'

const cache = new Map<string, ClienteMapa[]>()
export const invalidarClientes = (org: string) => cache.delete(org)

/** Todos os clientes da empresa, em lotes de 1.000 (limite da API). */
export async function buscarClientesMapa(org: string): Promise<ClienteMapa[]> {
  const hit = cache.get(org)
  if (hit) return hit
  const out: ClienteMapa[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from('clientes').select(COLS_MAPA).eq('org_id', org).order('nome').range(de, de + 999)
    if (error) throw error
    out.push(...((data as ClienteMapa[]) || []))
    if (!data || data.length < 1000) break
  }
  cache.set(org, out)
  return out
}

export function useClientesMapa(org: string | undefined) {
  const [dados, setDados] = useState<ClienteMapa[] | null>(org ? cache.get(org) || null : null)
  const [erro, setErro] = useState<string | null>(null)
  const recarregar = useCallback(() => {
    if (!org) return
    invalidarClientes(org)
    setErro(null)
    buscarClientesMapa(org).then(setDados).catch((e) => setErro(e.message || String(e)))
  }, [org])
  useEffect(() => {
    if (!org) return
    let vivo = true
    setErro(null)
    buscarClientesMapa(org).then((d) => vivo && setDados(d)).catch((e) => vivo && setErro(e.message || String(e)))
    return () => { vivo = false }
  }, [org])
  return { dados, erro, recarregar }
}
