type OrgPlano = { plano_id: string; config?: Record<string, unknown> | null } | null | undefined

/** Recursos pagos (IA, concorrência, rotas, relatório): planos pagos, ou teste com recursos liberados pelo suporte. A validação real é no banco (recurso_pago). */
export const ehPago = (org: OrgPlano) => !!org && (org.plano_id !== 'teste' || org.config?.recursos_liberados === true)

/** Exportar planilhas e PDF: só planos pagos, mesmo no teste com recursos liberados. */
export const podeExportar = (org: OrgPlano) => !!org && org.plano_id !== 'teste'
