import { useState, type FormEvent } from 'react'
import { msgErro, supabase } from '../lib/supabase'

export default function NovaSenha() {
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  async function salvar(e: FormEvent) {
    e.preventDefault(); setErro(null)
    if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.')
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) setErro(msgErro(error)); else setOk(true)
  }
  return (
    <div className="center-fill" style={{ padding: 24 }}>
      <form onSubmit={salvar} className="panel panel-b" style={{ width: 'min(380px,100%)', display: 'grid', gap: 14 }}>
        <h2>Criar nova senha</h2>
        {ok ? (<><div className="alert alert-ok">Senha alterada.</div><a className="btn btn-primary" href="/">Ir para o RAIO MAP</a></>) : (<>
          <label className="field"><span>Nova senha</span><input id="nova" className="input" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} /></label>
          {erro && <div className="alert alert-err">{erro}</div>}
          <button className="btn btn-primary" type="submit">Salvar senha</button>
        </>)}
      </form>
    </div>
  )
}
