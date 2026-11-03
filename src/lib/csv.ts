/** Gera e baixa um CSV (separador ponto e vírgula, com BOM, abre certo no Excel). */
export function campoCsv(v: unknown) {
  const s = Array.isArray(v) ? v.join(' / ') : v == null ? '' : String(v)
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function baixarCsv(nome: string, cabecalho: string[], linhas: unknown[][]) {
  const csv = '﻿' + [cabecalho.join(';'), ...linhas.map((l) => l.map(campoCsv).join(';'))].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  a.download = nome
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
