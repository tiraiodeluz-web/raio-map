import { fmt } from '../lib/format'

/** Barras horizontais com rótulo e valor; ordenadas por quem chama. HTML, para o texto não encolher. */
export function BarrasH({ itens, cor = 'var(--navy-600)', max = 12 }: { itens: { rotulo: string; valor: number; dica?: string }[]; cor?: string; max?: number }) {
  const lista = itens.slice(0, max)
  const top = Math.max(1, ...lista.map((i) => i.valor))
  return (
    <div className="barras" role="list">
      {lista.map((it) => (
        <div key={it.rotulo} className="barra" role="listitem" title={it.dica || `${it.rotulo}: ${fmt(it.valor)}`}>
          <span className="rot">{it.rotulo}</span>
          <span className="trilho"><i style={{ width: `${Math.max(1.5, (it.valor / top) * 100)}%`, background: cor }} /></span>
          <span className="v num">{fmt(it.valor)}</span>
        </div>
      ))}
    </div>
  )
}

/** Colunas por mês (série temporal), com grade leve e último ponto em destaque. */
export function ColunasMes({ serie }: { serie: { mes: string; n: number }[] }) {
  const w = 520, h = 190, pl = 30, pb = 26, pt = 10
  const top = Math.max(1, ...serie.map((s) => s.n))
  const passo = Math.pow(10, Math.floor(Math.log10(top)))
  const tick = top / passo > 5 ? passo * 2 : top / passo > 2 ? passo : passo / 2
  const ticks: number[] = []; for (let v = 0; v <= top; v += Math.max(1, tick)) ticks.push(v)
  const bw = (w - pl) / Math.max(1, serie.length)
  const y = (v: number) => h - pb - ((h - pb - pt) * v) / Math.max(top, ticks[ticks.length - 1])
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Clientes cadastrados por mês">
      {ticks.map((t) => (
        <g key={t}><line x1={pl} x2={w} y1={y(t)} y2={y(t)} stroke="var(--line)" /><text x={pl - 6} y={y(t) + 4} textAnchor="end">{t}</text></g>
      ))}
      {serie.map((s, i) => {
        const [a, m] = s.mes.split('-'); const ult = i === serie.length - 1
        return (
          <g key={s.mes}>
            <title>{`${MES[+m - 1]}/${a}: ${fmt(s.n)}`}</title>
            <rect x={pl + i * bw + 2} y={y(s.n)} width={Math.max(2, bw - 4)} height={h - pb - y(s.n)} rx={2} fill={ult ? 'var(--gold)' : 'var(--navy-600)'} />
            {(i % 3 === 0 || ult) && <text x={pl + i * bw + bw / 2} y={h - 8} textAnchor="middle">{MES[+m - 1]}{m === '01' || i === 0 ? '/' + a.slice(2) : ''}</text>}
          </g>
        )
      })}
    </svg>
  )
}
