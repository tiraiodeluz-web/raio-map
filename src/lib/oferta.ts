// Oferta comercial exibida no login e no aviso do teste. Ajuste aqui se mudar preço ou contato.
export const OFERTA = {
  diasTeste: 7,
  precoOriginal: 'R$ 7.199,00',
  preco: 'R$ 5.039,30',
  desconto: '30% OFF',
  validade: 'até 30/11/2026',
  limiteClientesTeste: 30,
  mensalidade: 'R$ 497',
  precoDetalhe: 'de entrada (implementação). A 1ª mensalidade de R$ 497 só vence em janeiro',
  custosCliente: 'Servidor, IA e consultas ao Google são pagos à parte, direto pela sua empresa (cerca de R$ 150 por mês, conforme o uso).',
  contato: 'https://pay.cakto.com.br/ss4bjts_1277685',
}

/** Dias restantes do teste (0 = venceu). null quando a empresa não está em teste. */
export function diasDeTeste(org: { plano_id: string; teste_ate: string | null } | null): number | null {
  if (!org || org.plano_id !== 'teste' || !org.teste_ate) return null
  return Math.max(0, Math.ceil((new Date(org.teste_ate).getTime() - Date.now()) / 86400000))
}
