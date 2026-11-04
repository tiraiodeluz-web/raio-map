import { supabase } from './supabase'

export interface CatConc { chave: string; rotulo: string; cor: string; ativa: boolean }
export const CATEGORIAS_PADRAO: CatConc[] = [
  { chave: 'concorrente', rotulo: 'Concorrente direto', cor: '#c8433a', ativa: true },
  { chave: 'potencial', rotulo: 'Potencial cliente', cor: '#e07b22', ativa: true },
  { chave: 'distribuidor', rotulo: 'Distribuidor', cor: '#7a4fd0', ativa: true },
  { chave: 'revendedor', rotulo: 'Revendedor', cor: '#0f9d8a', ativa: true },
  { chave: 'fornecedor', rotulo: 'Fornecedor', cor: '#2563c9', ativa: true },
  { chave: 'irrelevante', rotulo: 'Não relevante', cor: '#8a94a6', ativa: true },
]

/** Categorias padrão com as personalizações da empresa (nome, cor, ativa) e as criadas por ela. */
export async function categoriasDaEmpresa(orgId: string): Promise<CatConc[]> {
  const { data } = await supabase.from('conc_categorias').select('chave,rotulo,cor,ativa').eq('org_id', orgId)
  const m = new Map(((data as CatConc[]) || []).map((x) => [x.chave, x]))
  const out = CATEGORIAS_PADRAO.map((p) => m.get(p.chave) || p)
  for (const x of (data as CatConc[]) || []) if (!CATEGORIAS_PADRAO.some((p) => p.chave === x.chave)) out.push(x)
  return out
}

export interface PontoConc { id: number; nome: string; lat: number; lng: number; categoria: string; uf: string; observacao: string | null }
