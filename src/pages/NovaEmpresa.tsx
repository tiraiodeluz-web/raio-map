import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSessao } from '../context/Sessao'
import { msgErro, supabase } from '../lib/supabase'

export default function NovaEmpresa({ primeira = false }: { primeira?: boolean }) {
  const { recarregarOrgs, trocarOrg, session } = useSessao()
  const [nome, setNome] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const nav = useNavigate()

  async function criar(e: FormEvent) {
    e.preventDefault(); setErro(null); setEnviando(true)
    const { data, error } = await supabase.rpc('criar_organizacao', { p_nome: nome, p_cnpj: cnpj || null })
    if (error) { setErro(msgErro(error)); setEnviando(false); return }
    trocarOrg(data as string)
    await recarregarOrgs()
    nav('/clientes/importar')
  }

  return (
    <div className={primeira ? 'center-fill' : 'page'} style={{ padding: primeira ? 24 : undefined }}>
      <form onSubmit={criar} className="panel panel-b" style={{ width: 'min(440px,100%)', display: 'grid', gap: 14 }}>
        <h2>{primeira ? 'Cadastre sua empresa' : 'Nova empresa'}</h2>
        <p className="muted">
          {primeira
            ? 'Sua conta ainda não participa de nenhuma empresa. Crie a sua para começar, ou peça a um admin para convidar ' + (session?.user.email || 'seu e-mail') + '.'
            : 'Você será o dono da nova empresa. Os dados dela ficam separados das outras.'}
        </p>
        <label className="field"><span>Nome da empresa</span><input id="org-nome" className="input" required minLength={2} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Raio de Luz Artigos Religiosos" /></label>
        <label className="field"><span>CNPJ (opcional)</span><input id="org-cnpj" className="input" value={cnpj} onChange={(e) => setCnpj(e.target.value)} inputMode="numeric" /></label>
        {erro && <div className="alert alert-err">{erro}</div>}
        <button className="btn btn-primary" type="submit" disabled={enviando}>Criar empresa</button>
        {primeira && <button type="button" className="linkbtn" onClick={() => supabase.auth.signOut()}>Sair</button>}
      </form>
    </div>
  )
}
