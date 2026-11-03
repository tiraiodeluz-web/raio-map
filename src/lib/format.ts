export const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString('pt-BR')
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0).toLocaleString('pt-BR') + '%'
export function dataBR(s: string | null | undefined): string {
  if (!s) return ''
  const d = s.length === 10 ? new Date(s + 'T12:00:00') : new Date(s)
  return isNaN(+d) ? '' : d.toLocaleDateString('pt-BR')
}
export function dataHoraBR(s: string | null | undefined): string {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(+d) ? '' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}
export const km = (d: number) => (d < 1 ? 'aqui' : d < 10 ? d.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' km' : Math.round(d).toLocaleString('pt-BR') + ' km')
export function formatarDoc(d: string | null | undefined): string {
  const s = (d || '').replace(/\D/g, '')
  if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  return d || ''
}
