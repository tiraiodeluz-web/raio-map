import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import Supercluster from 'supercluster'
import { useSessao } from '../context/Sessao'
import { useClientesMapa } from '../lib/dados'
import type { ClienteMapa } from '../lib/types'
import { cepNum, fmtCep, haversine, localizarCep, norm, UF_NOMES, type LocalCep } from '../lib/geo'
import { fmt, km } from '../lib/format'
import FichaCliente from '../components/FichaCliente'
import { IcBusca } from '../components/Icones'

const COR = { ativo: '#2563c9', inativo: '#c8433a' }
const RAIOS = [10, 25, 50, 100, 200]

interface Cidade { key: string; cidade: string; uf: string; lat: number; lng: number; lista: ClienteMapa[]; a: number; i: number }
type Sug = { tipo: 'uf' | 'cidade' | 'cliente' | 'cep'; rotulo: string; extra?: string; valor: string }
type Painel = { tipo: 'cidade'; key: string } | { tipo: 'raio' } | null

function mix(a: string, b: string, t: number) {
  const pa = a.match(/\w\w/g)!.map((x) => parseInt(x, 16)), pb = b.match(/\w\w/g)!.map((x) => parseInt(x, 16))
  return 'rgb(' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',') + ')'
}

export default function MapaComercial() {
  const { org } = useSessao()
  const { dados, erro } = useClientesMapa(org?.id)
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const ufLayer = useRef<L.GeoJSON | null>(null)
  const pontos = useRef<L.LayerGroup | null>(null)
  const raioLayer = useRef<L.LayerGroup | null>(null)
  const [geo, setGeo] = useState<GeoJSON.FeatureCollection | null>(null)
  const [cats, setCats] = useState({ ativo: true, inativo: true })
  const [uf, setUf] = useState('')
  const [cidadeSel, setCidadeSel] = useState('')
  const [busca, setBusca] = useState('')
  const [sugOn, setSugOn] = useState(0)
  const [focoBusca, setFocoBusca] = useState(false)
  const [painel, setPainel] = useState<Painel>(null)
  const [aqui, setAqui] = useState<LocalCep | null>(null)
  const [raio, setRaio] = useState(50)
  const [msgCep, setMsgCep] = useState<string | null>(null)
  const [ficha, setFicha] = useState<string | null>(null)
  const [zoom, setZoom] = useState(4)

  // ---------- dados derivados ----------
  const filtrados = useMemo(() => (dados || []).filter((c) => c.lat != null && cats[c.situacao] && (!uf || c.uf === uf)), [dados, cats, uf])
  const cidades = useMemo(() => {
    const m = new Map<string, Cidade>()
    for (const c of filtrados) {
      const key = (c.municipio_ibge ?? c.cidade) + '|' + c.uf
      let g = m.get(key)
      if (!g) { g = { key, cidade: c.cidade || '', uf: c.uf || '', lat: c.lat!, lng: c.lng!, lista: [], a: 0, i: 0 }; m.set(key, g) }
      g.lista.push(c); if (c.situacao === 'ativo') g.a++; else g.i++
    }
    return m
  }, [filtrados])
  const porUf = useMemo(() => { const m: Record<string, number> = {}; filtrados.forEach((c) => (m[c.uf!] = (m[c.uf!] || 0) + 1)); return m }, [filtrados])
  const contagem = useMemo(() => {
    const t = { ativo: 0, inativo: 0 }; (dados || []).forEach((c) => { if (c.lat != null && (!uf || c.uf === uf)) t[c.situacao]++ }); return t
  }, [dados, uf])
  const indice = useMemo(() => {
    const sc = new Supercluster<{ key: string; n: number; a: number; i: number }, { n: number; a: number; i: number }>({
      radius: 46, maxZoom: 8,
      map: (p) => ({ n: p.n, a: p.a, i: p.i }),
      reduce: (acc, p) => { acc.n += p.n; acc.a += p.a; acc.i += p.i },
    })
    sc.load([...cidades.values()].map((g) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [g.lng, g.lat] }, properties: { key: g.key, n: g.lista.length, a: g.a, i: g.i } })))
    return sc
  }, [cidades])
  const perto = useMemo(() => {
    if (!aqui || !dados) return []
    return dados.filter((c) => c.lat != null && cats[c.situacao])
      .map((c) => ({ c, d: haversine(aqui.lat, aqui.lng, c.lat!, c.lng!), cd: Math.abs((cepNum(c.cep) ?? 1e9) - aqui.cep) }))
      .filter((x) => x.d <= raio)
      .sort((x, y) => x.d - y.d || x.cd - y.cd || x.c.nome.localeCompare(y.c.nome, 'pt-BR'))
  }, [aqui, dados, cats, raio])

  // ---------- mapa ----------
  useEffect(() => { fetch('/geo/br-uf.json').then((r) => r.json()).then(setGeo) }, [])
  useEffect(() => {
    if (!divRef.current || mapRef.current) return
    const map = L.map(divRef.current, { zoomSnap: 0.25, minZoom: 3, maxZoom: 12, attributionControl: false, preferCanvas: true, zoomControl: false })
    L.control.zoom({ position: 'bottomleft' }).addTo(map)
    map.fitBounds([[5.3, -74], [-33.8, -34.8]], { padding: [20, 20] })
    pontos.current = L.layerGroup().addTo(map)
    raioLayer.current = L.layerGroup().addTo(map)
    map.on('zoomend', () => setZoom(map.getZoom()))
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // estados (choropleth por quantidade de clientes)
  useEffect(() => {
    const map = mapRef.current; if (!map || !geo) return
    ufLayer.current?.remove()
    const max = Math.max(1, ...Object.values(porUf))
    const lyr = L.geoJSON(geo, {
      style: (f) => {
        const s = f?.properties?.sigla as string, n = porUf[s] || 0
        return { fillColor: n ? mix('ffffff', '2a4170', 0.05 + 0.3 * Math.sqrt(n / max)) : '#ffffff', fillOpacity: 1, color: s === uf ? '#c9973a' : '#cfd5e1', weight: s === uf ? 2.2 : 0.8 }
      },
      onEachFeature: (f, l) => {
        const s = f.properties.sigla as string
        l.bindTooltip(`<b>${UF_NOMES[s]}</b> · ${fmt(porUf[s] || 0)} clientes`, { className: 'tip', sticky: true })
        l.on('click', () => escolherUf(s))
      },
    }).addTo(map)
    lyr.bringToBack()
    ufLayer.current = lyr
  }, [geo, porUf, uf]) // eslint-disable-line react-hooks/exhaustive-deps

  // pontos agrupados
  useEffect(() => {
    const map = mapRef.current, grp = pontos.current; if (!map || !grp) return
    const desenhar = () => {
      grp.clearLayers()
      const b = map.getBounds()
      const z = Math.round(map.getZoom())
      for (const f of indice.getClusters([b.getWest() - 1, b.getSouth() - 1, b.getEast() + 1, b.getNorth() + 1], z)) {
        const [lng, lat] = f.geometry.coordinates
        const p = f.properties as { n: number; a: number; i: number; key?: string; cluster?: boolean; cluster_id?: number }
        const cor = p.a ? COR.ativo : COR.inativo
        const d = Math.round(Math.min(54, 14 + Math.sqrt(p.n) * 4.2))
        const sel = painel?.tipo === 'cidade' && p.key === painel.key
        const icon = L.divIcon({ className: '', iconSize: [d, d], html: `<div class="cluster-icon" style="width:${d}px;height:${d}px;background:${cor};${sel ? 'box-shadow:0 0 0 3px #c9973a;' : ''}${p.i && p.a ? `background:conic-gradient(${COR.ativo} 0 ${(p.a / p.n) * 360}deg, ${COR.inativo} 0)` : ''}">${p.n > 1 ? p.n : ''}</div>` })
        const m = L.marker([lat, lng], { icon, keyboard: true, riseOnHover: true })
        if (p.cluster) {
          m.bindTooltip(`${fmt(p.n)} clientes nesta região. Clique para aproximar.`, { className: 'tip', direction: 'top', offset: [0, -d / 2] })
          m.on('click', () => map.flyTo([lat, lng], Math.min(indice.getClusterExpansionZoom(p.cluster_id!), 10), { duration: 0.5 }))
        } else {
          const g = cidades.get(p.key!)!
          m.bindTooltip(`<b>${g.cidade}</b> – ${g.uf} · ${fmt(p.n)} cliente${p.n > 1 ? 's' : ''}`, { className: 'tip', direction: 'top', offset: [0, -d / 2] })
          m.on('click', () => setPainel({ tipo: 'cidade', key: g.key }))
        }
        grp.addLayer(m)
      }
    }
    desenhar()
    map.on('moveend', desenhar)
    return () => { map.off('moveend', desenhar) }
  }, [indice, cidades, painel])

  // raio a partir do CEP
  useEffect(() => {
    const map = mapRef.current, lyr = raioLayer.current; if (!map || !lyr) return
    lyr.clearLayers()
    if (!aqui) return
    const circ = L.circle([aqui.lat, aqui.lng], { radius: raio * 1000, color: '#c9973a', weight: 1.6, dashArray: '6 6', fillColor: '#c9973a', fillOpacity: 0.06, interactive: false }).addTo(lyr)
    L.marker([aqui.lat, aqui.lng], { icon: L.divIcon({ className: '', html: '<div class="you-pin"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }), zIndexOffset: 1000 })
      .bindTooltip(`CEP ${fmtCep(aqui.cep)} · ${aqui.cidade} – ${aqui.uf}`, { className: 'tip', direction: 'top', offset: [0, -10] }).addTo(lyr)
    map.flyToBounds(circ.getBounds(), { padding: [40, 40], duration: 0.6 })
  }, [aqui, raio])

  // ---------- ações ----------
  function escolherUf(s: string) {
    setUf(s); setCidadeSel(''); setPainel(null)
    const map = mapRef.current; if (!map || !ufLayer.current) return
    ufLayer.current.eachLayer((l) => {
      const f = (l as L.GeoJSON & { feature: GeoJSON.Feature }).feature
      if (f?.properties?.sigla === s) map.flyToBounds((l as L.Polygon).getBounds(), { padding: [30, 30], duration: 0.6 })
    })
  }
  function irCidade(key: string) {
    const g = cidades.get(key) || [...cidades.values()].find((x) => x.key === key)
    if (!g) return
    setCidadeSel(key); setPainel({ tipo: 'cidade', key })
    mapRef.current?.flyTo([g.lat, g.lng], Math.max(mapRef.current.getZoom(), 9), { duration: 0.6 })
  }
  function limpar() {
    setUf(''); setCidadeSel(''); setPainel(null); setAqui(null); setMsgCep(null); setBusca('')
    mapRef.current?.flyToBounds([[5.3, -74], [-33.8, -34.8]], { padding: [20, 20], duration: 0.6 })
  }
  async function buscarCep(n: number) {
    setMsgCep(null)
    const loc = await localizarCep(n)
    if (!loc) { setMsgCep('Esse CEP não está na tabela dos Correios. Confira os números.'); return }
    setAqui(loc); setPainel({ tipo: 'raio' })
    // raio inicial: o menor com pelo menos 10 clientes
    const base = (dados || []).filter((c) => c.lat != null).map((c) => haversine(loc.lat, loc.lng, c.lat!, c.lng!))
    setRaio(RAIOS.find((r) => base.filter((d) => d <= r).length >= 10) || 200)
    if (!loc.exato) setMsgCep('CEP fora da tabela: usei a cidade com faixa de CEP mais próxima.')
  }

  const sugestoes = useMemo<Sug[]>(() => {
    const t = busca.trim(); if (t.length < 2) return []
    const dig = t.replace(/\D/g, '')
    if (dig.length === 8 && /^[\d\s.-]+$/.test(t)) return [{ tipo: 'cep', rotulo: `Clientes perto do CEP ${fmtCep(+dig)}`, valor: dig }]
    const k = norm(t); const out: Sug[] = []
    for (const [s, n] of Object.entries(UF_NOMES)) if (norm(n).startsWith(k) || s === t.toUpperCase()) out.push({ tipo: 'uf', rotulo: n, extra: 'estado', valor: s })
    const todasCidades = new Map<string, Cidade>()
    ;(dados || []).forEach((c) => { if (c.lat != null) { const key = (c.municipio_ibge ?? c.cidade) + '|' + c.uf; if (!todasCidades.has(key)) todasCidades.set(key, { key, cidade: c.cidade || '', uf: c.uf || '', lat: c.lat, lng: c.lng!, lista: [], a: 0, i: 0 }) } })
    for (const g of todasCidades.values()) if (norm(g.cidade).startsWith(k)) out.push({ tipo: 'cidade', rotulo: `${g.cidade} – ${g.uf}`, extra: 'cidade', valor: g.key })
    for (const c of dados || []) if (norm(c.nome).includes(k) || (c.nome_fantasia && norm(c.nome_fantasia).includes(k))) out.push({ tipo: 'cliente', rotulo: c.nome, extra: c.cidade ? `${c.cidade} – ${c.uf}` : 'cliente', valor: c.id })
    return out.slice(0, 12)
  }, [busca, dados])

  function escolher(s: Sug) {
    setFocoBusca(false); setBusca(s.tipo === 'cep' ? fmtCep(+s.valor) : s.rotulo)
    if (s.tipo === 'cep') buscarCep(+s.valor)
    else if (s.tipo === 'uf') escolherUf(s.valor)
    else if (s.tipo === 'cidade') { setUf(''); irCidade(s.valor) }
    else setFicha(s.valor)
  }
  function teclaBusca(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSugOn((i) => Math.min(i + 1, sugestoes.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSugOn((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const s = sugestoes[sugOn]; if (s) escolher(s) }
    else if (e.key === 'Escape') setFocoBusca(false)
  }

  const ranking = useMemo(() => {
    if (uf) return [...cidades.values()].map((g) => ({ k: g.key, rot: g.cidade, n: g.lista.length })).sort((a, b) => b.n - a.n).slice(0, 30)
    return Object.entries(porUf).map(([s, n]) => ({ k: s, rot: UF_NOMES[s], n })).sort((a, b) => b.n - a.n)
  }, [uf, cidades, porUf])
  const cidadesDoUf = useMemo(() => [...cidades.values()].sort((a, b) => a.cidade.localeCompare(b.cidade, 'pt-BR')), [cidades])
  const grupoPerto = useMemo(() => {
    const g: { key: string; rot: string; d: number; itens: ClienteMapa[] }[] = []; const idx = new Map<string, number>()
    for (const { c, d } of perto) {
      const key = (c.municipio_ibge ?? c.cidade) + '|' + c.uf
      if (!idx.has(key)) { idx.set(key, g.length); g.push({ key, rot: `${c.cidade} – ${c.uf}`, d, itens: [] }) }
      g[idx.get(key)!].itens.push(c)
    }
    return g
  }, [perto])

  const semDados = dados && !dados.length
  const cidadePainel = painel?.tipo === 'cidade' ? cidades.get(painel.key) : null

  return (
    <div className="mapa">
      <div ref={divRef} aria-label="Mapa comercial do Brasil" />

      <div className="float map-tools">
        <div className="sec">
          <div className="search-box">
            <IcBusca />
            <input
              id="busca-mapa" className="input" type="search" autoComplete="off" placeholder="Cidade, estado, CEP ou cliente"
              value={busca} onChange={(e) => { setBusca(e.target.value); setSugOn(0) }}
              onFocus={() => setFocoBusca(true)} onBlur={() => setTimeout(() => setFocoBusca(false), 150)} onKeyDown={teclaBusca}
              aria-autocomplete="list" aria-controls="sug-mapa"
            />
            {focoBusca && sugestoes.length > 0 && (
              <div className="sugestoes" id="sug-mapa" role="listbox">
                {sugestoes.map((s, i) => (
                  <button key={s.tipo + s.valor} type="button" role="option" aria-selected={i === sugOn} className={i === sugOn ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(s)}>
                    <span>{s.rotulo}</span><small>{s.extra}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
          {msgCep && <div className="alert alert-warn small">{msgCep}</div>}
          <div className="chips" role="group" aria-label="Categorias">
            <button type="button" className="chip" aria-pressed={cats.ativo} onClick={() => setCats((c) => ({ ...c, ativo: !c.ativo }))}><span className="dot" style={{ background: COR.ativo }} />Clientes ativos <small>{fmt(contagem.ativo)}</small></button>
            <button type="button" className="chip" aria-pressed={cats.inativo} disabled={!contagem.inativo} onClick={() => setCats((c) => ({ ...c, inativo: !c.inativo }))}><span className="dot" style={{ background: COR.inativo }} />Inativos <small>{fmt(contagem.inativo)}</small></button>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <select id="m-uf" className="input" aria-label="Estado" value={uf} onChange={(e) => (e.target.value ? escolherUf(e.target.value) : limpar())}>
              <option value="">Todos os estados</option>{Object.entries(UF_NOMES).map(([s, n]) => <option key={s} value={s}>{n}</option>)}
            </select>
            <select id="m-cid" className="input" aria-label="Município" value={cidadeSel} disabled={!uf} onChange={(e) => e.target.value && irCidade(e.target.value)}>
              <option value="">{uf ? 'Município' : 'Escolha o estado'}</option>{cidadesDoUf.map((g) => <option key={g.key} value={g.key}>{g.cidade} ({g.lista.length})</option>)}
            </select>
          </div>
          {(uf || aqui) && <button className="linkbtn" type="button" onClick={limpar} style={{ justifySelf: 'start' }}>Ver o Brasil inteiro</button>}
        </div>
        <div className="scroll">
          <div className="small muted" style={{ padding: '10px 16px 4px', fontWeight: 600 }}>{uf ? `Concentração em ${UF_NOMES[uf]}` : 'Concentração por estado'}</div>
          <ul className="rank">
            {ranking.map((r) => (
              <li key={r.k}>
                <button type="button" onClick={() => (uf ? irCidade(r.k) : escolherUf(r.k))}>
                  <span className="nm">{r.rot}</span><span className="num">{fmt(r.n)}</span>
                  <span className="bar"><i style={{ width: `${(r.n / (ranking[0]?.n || 1)) * 100}%` }} /></span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {painel && (
        <aside className="float map-panel" aria-live="polite">
          {painel.tipo === 'cidade' && cidadePainel && (<>
            <div className="h">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><h2>{cidadePainel.cidade} – {cidadePainel.uf}</h2><button className="btn btn-ghost btn-sm" type="button" onClick={() => setPainel(null)}>Fechar</button></div>
              <span className="small muted">{fmt(cidadePainel.lista.length)} clientes{cidadePainel.i ? ` · ${cidadePainel.i} inativos` : ''}</span>
            </div>
            <div className="b">
              {cidadePainel.lista.map((c) => (
                <button key={c.id} type="button" className="client-row" onClick={() => setFicha(c.id)}>
                  <b>{c.nome}</b>
                  {c.nome_fantasia && c.nome_fantasia !== c.nome && <span className="meta">{c.nome_fantasia}</span>}
                  <span className="meta mono">{c.telefones?.[0] || ''}{c.contato ? ` · ${c.contato}` : ''}</span>
                  {c.situacao === 'inativo' && <span className="pill pill-inativo" style={{ justifySelf: 'start' }}>Inativo</span>}
                </button>
              ))}
            </div>
          </>)}
          {painel.tipo === 'raio' && aqui && (<>
            <div className="h">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><h2>Perto de {aqui.cidade} – {aqui.uf}</h2><button className="btn btn-ghost btn-sm" type="button" onClick={() => { setPainel(null); setAqui(null) }}>Fechar</button></div>
              <span className="small muted">{fmt(perto.length)} clientes em até {raio} km do CEP {fmtCep(aqui.cep)}, em linha reta</span>
              <div className="chips" role="group" aria-label="Raio">
                {RAIOS.map((r) => <button key={r} type="button" className="chip" aria-pressed={raio === r} onClick={() => setRaio(r)}>{r} km</button>)}
              </div>
            </div>
            <div className="b">
              {!grupoPerto.length && <div className="empty"><p>Nenhum cliente neste raio. Aumente a distância.</p></div>}
              {grupoPerto.map((g) => (
                <div key={g.key}>
                  <div className="grp-h"><span>{g.rot}</span><span className="d">{km(g.d)}</span></div>
                  {g.itens.map((c) => (
                    <button key={c.id} type="button" className="client-row" onClick={() => setFicha(c.id)}>
                      <b>{c.nome}</b>
                      <span className="meta mono">{c.telefones?.[0] || ''}{c.contato ? ` · ${c.contato}` : ''}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </>)}
        </aside>
      )}

      {!painel && (
        <div className="float legend" aria-hidden="true">
          <div className="row"><span className="dot" style={{ background: COR.ativo }} />Cliente ativo</div>
          <div className="row"><span className="dot" style={{ background: COR.inativo }} />Cliente inativo</div>
          <div className="row"><span className="dot" style={{ background: '#c9973a' }} />Seu CEP e o raio de busca</div>
          <div className="row" style={{ color: 'var(--faint)' }}>Número no círculo = clientes agrupados{zoom < 6 ? '. Aproxime para separar.' : ''}</div>
        </div>
      )}

      {(erro || semDados || !dados) && (
        <div className="float" style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', padding: 20, maxWidth: 360 }}>
          {erro ? <div className="alert alert-err">{erro}</div>
            : !dados ? <div className="spinner" aria-label="Carregando clientes" />
            : <div className="empty" style={{ padding: 0 }}><h2>Sem clientes para mostrar</h2><p>Importe sua carteira para vê-la no mapa.</p><Link className="btn btn-primary" to="/clientes/importar">Importar clientes</Link></div>}
        </div>
      )}

      {ficha && <FichaCliente id={ficha} onClose={() => setFicha(null)} />}
    </div>
  )
}
