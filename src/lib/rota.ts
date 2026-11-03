import { haversine } from './geo'

export interface Pt { lat: number; lng: number }

export function distanciaTotal(p: Pt[]) { let t = 0; for (let i = 1; i < p.length; i++) t += haversine(p[i - 1].lat, p[i - 1].lng, p[i].lat, p[i].lng); return t }

/** Vizinho mais próximo + melhoria 2-opt. O primeiro ponto é a partida e fica fixo. Distâncias em linha reta. */
export function otimizar<T extends Pt>(pontos: T[]): T[] {
  if (pontos.length < 3) return [...pontos]
  const rest = pontos.slice(1), rota: T[] = [pontos[0]]
  while (rest.length) {
    const u = rota[rota.length - 1]; let bi = 0, bd = Infinity
    rest.forEach((p, i) => { const d = haversine(u.lat, u.lng, p.lat, p.lng); if (d < bd) { bd = d; bi = i } })
    rota.push(rest.splice(bi, 1)[0])
  }
  let melhorou = true, voltas = 0
  while (melhorou && voltas++ < 50) {
    melhorou = false
    for (let i = 1; i < rota.length - 1; i++) for (let k = i + 1; k < rota.length; k++) {
      const novo = [...rota.slice(0, i), ...rota.slice(i, k + 1).reverse(), ...rota.slice(k + 1)]
      if (distanciaTotal(novo) + 1e-9 < distanciaTotal(rota)) { rota.splice(0, rota.length, ...novo); melhorou = true }
    }
  }
  return rota
}

/** Link do Google Maps com a sequência de paradas (o app abre o trajeto por ruas). */
export function linkGoogleMaps(p: Pt[]): string | null {
  if (p.length < 2) return null
  const f = (x: Pt) => `${x.lat},${x.lng}`
  const meio = p.slice(1, -1).slice(0, 8)
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${f(p[0])}&destination=${f(p[p.length - 1])}${meio.length ? '&waypoints=' + meio.map(f).join('%7C') : ''}`
}
