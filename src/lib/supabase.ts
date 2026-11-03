import { createClient } from '@supabase/supabase-js'

// Valores PÚBLICOS do projeto raio-map (podem ficar no navegador). As variáveis de ambiente,
// se existirem, têm prioridade — útil para apontar para outro projeto Supabase.
const url = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://pizwcdcxpdulyntwbdex.supabase.co'
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string) || 'sb_publishable_O1R_Ta-U0HNpDKDw8wTbKw_nDaBzpR0'

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

/** Mensagem legível a partir de um erro do Supabase ou JS. */
export function msgErro(e: unknown): string {
  if (!e) return 'Erro desconhecido.'
  if (typeof e === 'string') return e
  const m = (e as { message?: string }).message || String(e)
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.'
  if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.'
  if (/User already registered/i.test(m)) return 'Já existe uma conta com esse e-mail. Use "Entrar".'
  if (/rate limit/i.test(m)) return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos.'
  if (/Failed to fetch/i.test(m)) return 'Sem conexão com o servidor. Verifique sua internet.'
  return m
}
