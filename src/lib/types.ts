export type Papel = 'dono' | 'admin' | 'vendedor' | 'leitor'

export interface Organizacao {
  id: string
  nome: string
  cnpj: string | null
  plano_id: string
  assinatura_status: string
  config: Record<string, unknown>
  criado_em: string
}

export interface Membro { user_id: string; email: string; papel: Papel; criado_em: string }

export interface Municipio { ibge: number; nome: string; uf: string; lat: number; lng: number; capital: boolean }

export interface Cliente {
  id: string
  org_id: string
  codigo_erp: string | null
  nome: string
  nome_fantasia: string | null
  documento: string | null
  ie: string | null
  telefones: string[]
  contato: string | null
  email: string | null
  logradouro: string | null
  bairro: string | null
  cep: string | null
  cidade: string | null
  uf: string | null
  municipio_ibge: number | null
  lat: number | null
  lng: number | null
  precisao_geo: string | null
  data_cadastro: string | null
  ultima_compra: string | null
  situacao: 'ativo' | 'inativo'
  observacoes: string | null
  criado_em: string
  atualizado_em: string
}

/** Colunas leves usadas no mapa (todos os clientes da empresa). */
export type ClienteMapa = Pick<Cliente, 'id' | 'nome' | 'nome_fantasia' | 'cidade' | 'uf' | 'municipio_ibge' | 'lat' | 'lng' | 'situacao' | 'telefones' | 'contato' | 'cep' | 'codigo_erp'>

export interface Interacao {
  id: string
  user_id: string | null
  data: string
  canal: string | null
  texto: string
}

export interface Plano { id: string; nome: string; max_usuarios: number | null; max_consultas_mes: number | null; max_exportacoes_mes: number | null; max_prospects: number | null }

export const PAPEL_ROTULO: Record<Papel, string> = { dono: 'Dono', admin: 'Admin', vendedor: 'Vendedor', leitor: 'Leitor' }
export const CANAIS = [
  ['telefone', 'Telefone'], ['whatsapp', 'WhatsApp'], ['email', 'E-mail'], ['visita', 'Visita'], ['instagram', 'Instagram'], ['outro', 'Outro'],
] as const
