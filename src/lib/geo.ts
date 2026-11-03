import type { Municipio } from './types'

export const UF_NOMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
}

export const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371, p = Math.PI / 180
  const x = Math.sin(((lat2 - lat1) * p) / 2) ** 2 + Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(((lng2 - lng1) * p) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

export const cepNum = (s: string | null | undefined): number | null => {
  const d = (s || '').replace(/\D/g, '')
  return d.length === 8 && d !== '00000000' ? +d : null
}
export const fmtCep = (n: number) => { const s = String(n).padStart(8, '0'); return s.slice(0, 5) + '-' + s.slice(5) }

// ---- Faixas de CEP (Correios), carregadas sob demanda ----
type Faixa = [number, number, number, number, string, string] // ini, fim, lat, lng, nome, uf
let faixasP: Promise<Faixa[]> | null = null
export const carregarFaixas = () => (faixasP ??= fetch('/geo/faixas-cep.json').then((r) => {
  if (!r.ok) throw new Error('Não foi possível carregar a tabela de CEP.')
  return r.json()
}))

export interface LocalCep { cep: number; lat: number; lng: number; cidade: string; uf: string; exato: boolean }

export async function localizarCep(n: number): Promise<LocalCep | null> {
  const F = await carregarFaixas()
  let best: Faixa | null = null
  for (const f of F) if (f[0] <= n && n <= f[1] && (!best || f[1] - f[0] < best[1] - best[0])) best = f
  if (best) return { cep: n, lat: best[2], lng: best[3], cidade: best[4], uf: best[5], exato: true }
  const pre = Math.floor(n / 1e6); let bd = Infinity
  for (const f of F) {
    if (Math.floor(f[0] / 1e6) !== pre && Math.floor(f[1] / 1e6) !== pre) continue
    const d = Math.min(Math.abs(n - f[0]), Math.abs(n - f[1]))
    if (d < bd) { bd = d; best = f }
  }
  return best ? { cep: n, lat: best[2], lng: best[3], cidade: best[4], uf: best[5], exato: false } : null
}

// ---- Municípios (do banco), indexados por nome+UF ----
export function indexarMunicipios(ms: Municipio[]) {
  const porNome = new Map<string, Municipio>()
  const porIbge = new Map<number, Municipio>()
  const porUf = new Map<string, string[]>()
  for (const m of ms) {
    porNome.set(norm(m.nome) + '|' + m.uf, m)
    porIbge.set(m.ibge, m)
    const l = porUf.get(m.uf) || []; l.push(norm(m.nome)); porUf.set(m.uf, l)
  }
  return { porNome, porIbge, porUf }
}
export type IndiceMunicipios = ReturnType<typeof indexarMunicipios>

const APELIDOS: Record<string, string> = { PARATI: 'PARATY', EMBU: 'EMBUDASARTES', MOJIMIRIM: 'MOGIMIRIM' }

/** Distância de edição simples para tolerar grafias (Santa Isabel / Izabel). */
function lev(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 9
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

export function acharMunicipio(idx: IndiceMunicipios, cidade: string, uf: string): Municipio | null {
  if (!cidade || !uf) return null
  let k = norm(cidade); k = APELIDOS[k] || k
  const hit = idx.porNome.get(k + '|' + uf)
  if (hit) return hit
  const cands = idx.porUf.get(uf) || []
  let best: string | null = null, bd = 3
  for (const c of cands) { const d = lev(k, c); if (d < bd) { bd = d; best = c } }
  return best && bd <= 2 ? idx.porNome.get(best + '|' + uf) || null : null
}
