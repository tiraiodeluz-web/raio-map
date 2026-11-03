import { OFERTA } from '../lib/oferta'

/** Tela exibida a quem está no teste grátis ao abrir um recurso dos planos pagos. */
export default function Bloqueado({ titulo, descricao, extra }: { titulo: string; descricao: string; extra?: string }) {
  return (
    <div className="page">
      <div className="bloqueado panel">
        <span className="pill pill-inativo">Disponível nos planos pagos</span>
        <h1>{titulo}</h1>
        <p>{descricao}</p>
        {extra && <p className="muted">{extra}</p>}
        <p><s className="muted">{OFERTA.precoOriginal}</s> <b>{OFERTA.preco}</b> · {OFERTA.desconto} {OFERTA.validade}</p>
        <a className="btn btn-primary" href={OFERTA.contato} target="_blank" rel="noreferrer">Conhecer os planos</a>
      </div>
    </div>
  )
}
