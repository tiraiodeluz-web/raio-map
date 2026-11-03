const so = (s: string | null | undefined) => (s || '').replace(/\D/g, '')

/** Número no formato do WhatsApp (55 + DDD + número) ou null se não for um telefone válido. */
export function whatsappDe(tel: string | null | undefined): string | null {
  let d = so(tel).replace(/^0+/, '')
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  if (d.length === 10 && '6789'.includes(d[2])) d = d.slice(0, 2) + '9' + d.slice(2)
  if (d.length !== 10 && d.length !== 11) return null
  if (d.length === 11 && d[2] !== '9') return null
  return '55' + d
}

export function linkWhatsapp(tels: (string | null | undefined)[], texto?: string): string | null {
  for (const t of tels) {
    const w = whatsappDe(t)
    if (w) return `https://wa.me/${w}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`
  }
  return null
}
