import { useEffect, useRef, useState, type FormEvent } from 'react'
import { msgErro, supabase } from '../lib/supabase'
import Marca from '../components/Marca'

type Modo = 'entrar' | 'criar' | 'esqueci'

/** Fundo do login: os municípios do Brasil como pontos, com um feixe azul varrendo o mapa. */
function ArteMapa() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current!; const ctx = cv.getContext('2d')!
    let raf = 0; let pts: [number, number][] = []
    const reduz = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    fetch('/geo/faixas-cep.json').then((r) => r.json()).then((F: number[][]) => {
      const seen = new Set<string>()
      for (const f of F) { const k = f[2] + ',' + f[3]; if (!seen.has(k)) { seen.add(k); pts.push([f[2] as number, f[3] as number]) } }
      desenhar(0)
    }).catch(() => { pts = [] })
    function desenhar(t: number) {
      const w = cv.clientWidth, h = cv.clientHeight, dpr = devicePixelRatio || 1
      if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h)
      // Brasil: lat 5.3..-33.8, lng -74..-34.8
      const s = Math.min((w * 0.9) / 39.2, (h * 0.95) / 39.1)
      const ox = w - 39.2 * s - w * 0.04, oy = (h - 39.1 * s) / 2
      const cx = ox + (-47.9 + 74) * s, cy = oy + (5.3 + 15.8) * s // Brasília
      const ang = reduz ? 0.9 : (t / 4200) % (Math.PI * 2)
      for (const [la, lo] of pts) {
        const x = ox + (lo + 74) * s, y = oy + (5.3 - la) * s
        let a = Math.atan2(y - cy, x - cx) - ang; a = Math.atan2(Math.sin(a), Math.cos(a))
        const luz = Math.max(0, 1 - Math.abs(a) / 0.35)
        ctx.fillStyle = luz > 0.02 ? `rgba(58,182,255,${0.25 + luz * 0.75})` : 'rgba(120,150,210,0.22)'
        ctx.fillRect(x, y, 1.6, 1.6)
      }
      if (!reduz) raf = requestAnimationFrame(desenhar)
    }
    return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={ref} aria-hidden="true" />
}

export default function Login() {
  const [modo, setModo] = useState<Modo>('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault(); setErro(null); setOk(null); setEnviando(true)
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
        if (error) throw error
      } else if (modo === 'criar') {
        if (senha.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.')
        const { data, error } = await supabase.auth.signUp({ email, password: senha, options: { emailRedirectTo: location.origin } })
        if (error) throw error
        if (!data.session) setOk('Conta criada. Abra o link que enviamos para ' + email + ' para confirmar e depois entre.')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/nova-senha' })
        if (error) throw error
        setOk('Se existir uma conta com esse e-mail, enviamos um link para criar uma nova senha.')
      }
    } catch (e2) { setErro(msgErro(e2)) } finally { setEnviando(false) }
  }

  return (
    <div className="auth">
      <section className="auth-art">
        <ArteMapa />
        <Marca />
        <div>
          <h1>Onde estão seus clientes e onde estão os próximos.</h1>
          <p>Mapa comercial e expansão territorial para distribuidoras, fabricantes e atacadistas de artigos religiosos.</p>
        </div>
        <span className="small" style={{ color: '#8597b8' }}>Cada empresa vê apenas os próprios dados.</span>
      </section>
      <section className="auth-form">
        <form onSubmit={enviar}>
          <h2>{modo === 'esqueci' ? 'Recuperar senha' : 'Acesse sua conta'}</h2>
          {modo !== 'esqueci' && (
            <div className="auth-tabs" role="group" aria-label="Entrar ou criar conta">
              <button type="button" aria-pressed={modo === 'entrar'} onClick={() => setModo('entrar')}>Entrar</button>
              <button type="button" aria-pressed={modo === 'criar'} onClick={() => setModo('criar')}>Criar conta</button>
            </div>
          )}
          <label className="field"><span>E-mail</span>
            <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {modo !== 'esqueci' && (
            <label className="field"><span>Senha</span>
              <input id="senha" className="input" type="password" autoComplete={modo === 'criar' ? 'new-password' : 'current-password'} required minLength={modo === 'criar' ? 8 : undefined} value={senha} onChange={(e) => setSenha(e.target.value)} />
            </label>
          )}
          {erro && <div className="alert alert-err" role="alert">{erro}</div>}
          {ok && <div className="alert alert-ok" role="status">{ok}</div>}
          <button className="btn btn-primary" type="submit" disabled={enviando} style={{ height: 40 }}>
            {modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar conta' : 'Enviar link'}
          </button>
          {modo === 'entrar' && <button type="button" className="linkbtn" onClick={() => setModo('esqueci')}>Esqueci minha senha</button>}
          {modo === 'esqueci' && <button type="button" className="linkbtn" onClick={() => setModo('entrar')}>Voltar para entrar</button>}
          <p className="small muted">Ao criar uma conta você concorda com o uso dos seus dados de acesso para operar a plataforma, conforme a LGPD.</p>
        </form>
      </section>
    </div>
  )
}
