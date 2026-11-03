/** Recursos dos planos pagos. A validação real é feita no banco (função recurso_pago) e nas funções de servidor. */
export const ehPago = (org: { plano_id: string } | null | undefined) => !!org && org.plano_id !== 'teste'
