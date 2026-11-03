import { useEffect, useRef } from 'react'
import L from 'leaflet'

export interface PontoMini { id: string; lat: number; lng: number; cor: string; titulo: string; rotulo?: string }

/** Mapa simples com pontos coloridos (ou numerados) e, opcionalmente, uma linha de rota. */
export default function MiniMapa({ pontos, onClick, linha, altura = 460 }: { pontos: PontoMini[]; onClick?: (id: string) => void; linha?: [number, number][]; altura?: number }) {
  const div = useRef<HTMLDivElement>(null)
  const mapa = useRef<L.Map | null>(null)
  const camada = useRef<L.LayerGroup | null>(null)
  const clique = useRef(onClick); clique.current = onClick

  useEffect(() => {
    if (!div.current || mapa.current) return
    const m = L.map(div.current, { zoomSnap: 0.25, minZoom: 3, maxZoom: 18, attributionControl: false, preferCanvas: true })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(m)
    L.control.attribution({ prefix: false }).addAttribution('© OpenStreetMap').addTo(m)
    m.fitBounds([[5.3, -74], [-33.8, -34.8]])
    camada.current = L.layerGroup().addTo(m)
    mapa.current = m
    return () => { m.remove(); mapa.current = null }
  }, [])

  useEffect(() => {
    const m = mapa.current, g = camada.current; if (!m || !g) return
    g.clearLayers()
    const bounds: [number, number][] = []
    if (linha && linha.length > 1) L.polyline(linha, { color: '#2563c9', weight: 3, opacity: 0.8, dashArray: '6 6' }).addTo(g)
    for (const p of pontos) {
      bounds.push([p.lat, p.lng])
      const mk = p.rotulo
        ? L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', html: `<div class="mm-num" style="background:${p.cor}">${p.rotulo}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }) })
        : L.circleMarker([p.lat, p.lng], { radius: 6, color: '#fff', weight: 1.5, fillColor: p.cor, fillOpacity: 0.92 })
      mk.bindTooltip(p.titulo).on('click', () => clique.current?.(p.id)).addTo(g)
    }
    if (bounds.length) m.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 })
  }, [pontos, linha])

  return <div ref={div} style={{ height: altura, borderRadius: 'var(--r-md)', border: '1px solid var(--line)' }} role="img" aria-label="Mapa" />
}
