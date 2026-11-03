import { useEffect, useState } from 'react'

export interface Estabelecimento {
  id: number
  cnpj: string | null
  razao_social: string | null
  nome_fantasia: string | null
  cnae_principal: string | null
  logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; cep: string | null
  municipio_ibge: number | null
  uf: string | null
  lat: number | null; lng: number | null
  telefone: string | null; email: string | null; site: string | null; instagram: string | null
  situacao_cadastral: string | null
  data_abertura: string | null
  categoria: string | null
  confiabilidade: 'alta' | 'media' | 'baixa' | null
  criterio_inclusao: string | null
  fonte_principal: string
  mes_referencia: string | null
  porte: string | null
  ia_avaliacao: unknown
  atualizado_em: string
}

export interface LinhaBusca {
  id: number; cnpj: string | null; razao_social: string | null; nome_fantasia: string | null; categoria: string | null
  confiabilidade: 'alta' | 'media' | 'baixa' | null; cidade: string | null; uf: string | null; municipio_ibge: number | null
  telefone: string | null; email: string | null; situacao_cadastral: string | null; data_abertura: string | null
  lat: number | null; lng: number | null; ja_cliente: boolean; prospect_id: string | null; total: number
}

export interface PontoPotencial { id: number; nome: string; lat: number; lng: number; confiabilidade: string | null; categoria: string | null; uf: string; municipio_ibge: number | null; prospect_id: string | null }

export interface ResultadoGoogle {
  lugar: null | { nome: string; endereco?: string; telefone?: string; site?: string; status?: string; mapa?: string; horarios?: string[] }
  uso?: number
}

export type Situacao = 'novo_prospect' | 'nao_abordado' | 'em_contato' | 'interessado' | 'negociacao' | 'convertido' | 'nao_interessado'
export const SITUACOES: [Situacao, string][] = [
  ['novo_prospect', 'Novo prospect'], ['nao_abordado', 'Não abordado'], ['em_contato', 'Em contato'], ['interessado', 'Interessado'],
  ['negociacao', 'Negociação'], ['convertido', 'Convertido'], ['nao_interessado', 'Não interessado'],
]
export const SITUACAO_ROTULO = Object.fromEntries(SITUACOES) as Record<Situacao, string>

// ---- Segmento desta instalação (public/config/segmento.json) ----
export interface Segmento { nome: string; publico: string; categorias: { id: string; rotulo: string }[] }
let segCache: Segmento | null = null
let segP: Promise<Segmento> | null = null
export const carregarSegmento = () =>
  (segP ??= fetch('/config/segmento.json').then((r) => r.json()).then((j: Segmento) => (segCache = j)))

/** Rótulos e textos do segmento configurado (categorias, público-alvo). */
export function useSegmento() {
  const [seg, setSeg] = useState<Segmento | null>(segCache)
  useEffect(() => { if (!segCache) carregarSegmento().then(setSeg).catch(() => setSeg(null)) }, [])
  const rotulo = (id: string | null | undefined) => (id ? seg?.categorias.find((c) => c.id === id)?.rotulo || 'Outro' : '—')
  return { seg, rotulo, categorias: seg?.categorias || [] }
}
export const CONFIANCA_ROTULO: Record<string, string> = { alta: 'alta', media: 'média', baixa: 'baixa' }

// ---- Memória da sessão: evita refazer buscas ao trocar de aba (some ao recarregar a página) ----
const memo = new Map<string, { em: number; v: unknown }>()
export function lembrado<T>(chave: string, maxMs: number): T | undefined {
  const m = memo.get(chave)
  return m && Date.now() - m.em < maxMs ? (m.v as T) : undefined
}
export function lembrar(chave: string, v: unknown) { memo.set(chave, { em: Date.now(), v }) }
export function esquecer(prefixo: string) { for (const k of [...memo.keys()]) if (k.startsWith(prefixo)) memo.delete(k) }
