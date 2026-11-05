import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SUPORTE_EMAIL } from '../lib/oferta'

interface Secao { id: string; titulo: string; link?: string; resumo: string; imagens: { src: string; legenda: string }[]; passos: string[]; dicas?: string[] }

const PRIMEIROS = [
  ['Importe seus clientes', 'Em Clientes > Importar CSV, envie a planilha exportada do seu sistema. Inclua a data da última compra para separar ativos e inativos.'],
  ['Convide a equipe', 'Em Configurações > Membros, convide vendedores e quem só precisa consultar.'],
  ['Veja o mapa', 'No Mapa comercial, digite um CEP para achar os clientes mais perto.'],
  ['Escolha potenciais clientes', 'Em Prospecção, filtre a base nacional e adicione as empresas que quer trabalhar.'],
  ['Acompanhe no Funil', 'Mova cada prospect pelas colunas até fechar ou descartar.'],
  ['Recupere clientes inativos', 'Em Clientes inativos, veja quem parou de comprar e chame pelo WhatsApp.'],
  ['Planeje as visitas', 'Em Rotas de visita, monte a rota, escolha o representante e compartilhe com ele.'],
  ['Tire dúvidas a qualquer hora', 'Pergunte à Clyvo AI, 24 horas, ou escreva para ' + SUPORTE_EMAIL + '.'],
]

const SECOES: Secao[] = [
  {
    id: 'dashboard', titulo: 'Dashboard', link: '/',
    resumo: 'Resumo da carteira: quantos clientes, em quantas cidades e estados, onde há mais clientes e onde ainda não há nenhum.',
    imagens: [{ src: '/ajuda/dashboard.jpg', legenda: 'Números da carteira, clientes por estado, cidades com mais clientes e novos clientes por mês.' }],
    passos: [
      'Os quatro números do topo mostram o tamanho da carteira e quantos municípios ainda não têm cliente.',
      'Clientes por estado e Cidades com mais clientes mostram onde a empresa já é forte.',
      'Novos clientes por mês mostra o ritmo de cadastro nos últimos 24 meses.',
      'Menor cobertura por estado aponta regiões com espaço para crescer.',
      'Abrir mapa comercial leva direto ao mapa.',
    ],
  },
  {
    id: 'mapa', titulo: 'Mapa comercial', link: '/mapa',
    resumo: 'Seus clientes, os potenciais clientes e a concorrência no mapa do Brasil. Serve para planejar visita, rota e região de venda.',
    imagens: [
      { src: '/ajuda/mapa.jpg', legenda: 'Azul: cliente ativo. Vermelho: inativo. Laranja: potencial cliente. Contorno escuro: concorrência e classificados.' },
      { src: '/ajuda/mapa-cep.jpg', legenda: 'Busca por CEP com raio de 25 km: clientes mais próximos, por cidade e distância.' },
      { src: '/ajuda/mapa-concorrencia.jpg', legenda: 'Cidade aberta no mapa, com clientes e a camada Concorrência ligada.' },
    ],
    passos: [
      'Digite uma cidade, um estado, um CEP ou o nome de um cliente na busca.',
      'Ao buscar um CEP, escolha o raio (10 a 200 km). A lista mostra os clientes mais perto, com telefone e contato.',
      'Ao abrir uma cidade, a lista ao lado mostra os clientes de lá. Ao escolher um estado, aparecem as cidades com mais clientes.',
      'Use os botões Clientes ativos, Inativos, Potenciais clientes e Concorrência para ligar e desligar cada camada.',
      'Concorrência (planos pagos) mostra os estabelecimentos que você classificou na tela Concorrência, com a cor de cada categoria.',
      'Os círculos com número agrupam vários pontos. Aproxime o mapa para separar e clique em um ponto para abrir a ficha.',
    ],
    dicas: ['A distância é em linha reta, não pelo trajeto de carro.'],
  },
  {
    id: 'clientes', titulo: 'Clientes e importação', link: '/clientes',
    resumo: 'A carteira completa em lista, com busca e filtros, e as formas de trazer os clientes do seu sistema.',
    imagens: [
      { src: '/ajuda/clientes.jpg', legenda: 'Lista de clientes com filtros e os botões Exportar CSV, Integrar API, Integrar banco de dados e Importar CSV.' },
      { src: '/ajuda/importar.jpg', legenda: 'Importar CSV: o sistema reconhece as colunas da planilha e você só confere.' },
    ],
    passos: [
      'Busque por nome, nome fantasia, contato, código ou CNPJ. Filtre por estado, município e situação, e escolha a ordem da lista.',
      'Para importar, clique em Importar CSV, escolha o arquivo e confira as colunas. Nome, cidade e UF são obrigatórios.',
      'Inclua a coluna de data da última compra. É ela que separa ativos e inativos na tela Clientes inativos.',
      'Clientes com o mesmo código do seu sistema são atualizados, não duplicados. Pode importar de novo sempre que quiser.',
      'Exportar CSV (planos pagos) baixa a lista do filtro atual.',
      'Integrar API e Integrar banco de dados (planos pagos) vão ligar o Clyvo Map direto ao seu sistema, sem precisar de planilha. Estão em desenvolvimento.',
    ],
    dicas: ['No teste grátis, dá para importar até 30 clientes.'],
  },
  {
    id: 'prospeccao', titulo: 'Prospecção: base nacional', link: '/prospeccao',
    resumo: 'Empresas de todo o Brasil do seu segmento, a partir dos dados públicos da Receita Federal, atualizados todo mês.',
    imagens: [
      { src: '/ajuda/prospeccao.jpg', legenda: 'Base nacional com filtros por estado, município, categoria e confiabilidade.' },
      { src: '/ajuda/prospeccao-ficha.jpg', legenda: 'Ficha do estabelecimento: dados da Receita, o motivo de ter entrado na base e o botão Adicionar aos prospects.' },
    ],
    passos: [
      'Busque por nome, razão social ou CNPJ e filtre por estado, município, categoria e confiabilidade.',
      'Confiabilidade indica o quanto temos certeza de que a empresa é do seu segmento: alta, média ou baixa.',
      'Quem já é seu cliente fica escondido. Marque Mostrar quem já está na carteira para ver todos.',
      'Clique em Adicionar (ou, na ficha, em Adicionar aos prospects) para colocar a empresa na sua lista de trabalho.',
      'Na ficha, Buscar no Google traz telefone, site e horário atualizados, quando a empresa estiver cadastrada lá.',
    ],
    dicas: ['Cada busca no Google conta no limite mensal de consultas do plano.', 'Telefone e e-mail da Receita são os que a empresa informou e podem estar desatualizados.'],
  },
  {
    id: 'meus', titulo: 'Meus prospects', link: '/prospeccao?aba=meus',
    resumo: 'As empresas que você escolheu trabalhar, com situação, histórico de contato e envio por e-mail e WhatsApp.',
    imagens: [
      { src: '/ajuda/meus-prospects.jpg', legenda: 'Prospects marcados e os botões Exportar planilha, Enviar e-mail e Conectar bate-papo.' },
      { src: '/ajuda/email-prospects.jpg', legenda: 'Enviar e-mail: assunto e mensagem para todos os marcados, e a lista de quem ficou de fora, com o motivo.' },
      { src: '/ajuda/prospect-ficha.jpg', legenda: 'Ficha do prospect com o histórico de abordagem, inclusive as respostas do WhatsApp.' },
    ],
    passos: [
      'Filtre por situação (Novo prospect, Em contato, Interessado…), por tipo de telefone ou busque por nome e cidade.',
      'O selo no telefone mostra se é celular, fixo (melhor ligar), WhatsApp confirmado ou sem WhatsApp.',
      'Marque as caixinhas dos prospects que quer trabalhar. Quantos estão marcados aparece acima da lista.',
      'Enviar e-mail (planos pagos): escreva o assunto e a mensagem uma vez e envie para todos os marcados. Quem não tem e-mail cadastrado ou tem e-mail inválido aparece na tela, com o motivo.',
      'Conectar bate-papo (planos pagos): envia os marcados ao WhatsApp da empresa. Fixos ficam de fora, a menos que você marque Enviar fixos também.',
      'Exportar planilha (planos pagos) baixa os prospects do filtro atual.',
      'Na ficha, registre cada contato (canal e o que foi combinado) e mude a situação quando avançar.',
    ],
    dicas: ['O envio de e-mail será liberado em breve. A tela já mostra quem receberia a mensagem e quem ficaria de fora.'],
  },
  {
    id: 'funil', titulo: 'Funil', link: '/funil',
    resumo: 'Seus prospects em colunas, do primeiro contato ao fechamento. As colunas têm os nomes que você quiser.',
    imagens: [{ src: '/ajuda/funil.jpg', legenda: 'Colunas personalizadas e cartões com telefone, selo do WhatsApp e dias sem movimento.' }],
    passos: [
      'Arraste o cartão para outra coluna. No celular, use a caixa de seleção dentro do cartão.',
      'Clique no nome da coluna para renomear. As setas mudam a ordem e o × apaga a coluna (os cartões vão para a primeira).',
      'Crie colunas novas no fim do quadro.',
      'Há quantos dias fica em laranja quando o prospect está parado há 14 dias ou mais.',
      'Use a busca no topo para achar uma empresa ou cidade. Clique no nome da empresa para abrir a ficha. Toda mudança de coluna fica no histórico.',
    ],
  },
  {
    id: 'inativos', titulo: 'Clientes inativos', link: '/inativos',
    resumo: 'Mostra quem já comprou e parou de comprar, para você ligar, visitar e recuperar.',
    imagens: [{ src: '/ajuda/inativos.jpg', legenda: 'Clientes inativos por tempo sem comprar, com mapa e botão de WhatsApp.' }],
    passos: [
      'Os quatro quadros do topo mostram o total, os ativos, os inativos e os que ainda não têm data de última compra. Clique em um quadro para filtrar.',
      'Cliente inativo é o que está sem comprar há mais dias do que a regra. Dono e admin mudam essa regra no campo do topo e clicam em Salvar regra.',
      'Quem não tem data de última compra aparece como Não identificado. O sistema não presume que esteja inativo.',
      'Filtre por situação, estado, cidade ou nome. A lista começa por quem está há mais tempo sem comprar.',
      'No mapa, azul é ativo, vermelho é inativo e cinza é não identificado.',
      'O botão WhatsApp abre a conversa com uma mensagem pronta quando o cliente tem celular válido.',
    ],
    dicas: ['Para classificar toda a carteira, importe a planilha com a coluna de última compra ou preencha a data na ficha do cliente.'],
  },
  {
    id: 'concorrencia', titulo: 'Concorrência e oportunidades (planos pagos)', link: '/concorrencia',
    resumo: 'Lista os estabelecimentos de uma região para você classificar como concorrente, distribuidor, revendedor, fornecedor ou potencial cliente.',
    imagens: [{ src: '/ajuda/concorrencia.jpg', legenda: 'Estabelecimentos de uma cidade, filtro por categoria, mapa e ficha para classificar.' }],
    passos: [
      'Escolha o estado e, se quiser, a cidade. Clique em Buscar na região.',
      'Clique em um estabelecimento (na lista ou no mapa) para classificar, escrever como você sabe e anotar observações.',
      'Use os botões acima da lista para ver só uma categoria ou só os que ainda não foram classificados.',
      'Dono e admin ajustam as categorias em Editar categorias: nome, cor, ligar e desligar, e criar novas.',
      'Em Potencial cliente, o botão Adicionar como prospect leva a empresa para a sua lista de trabalho.',
      'Tudo o que você classifica aparece no Mapa comercial, na camada Concorrência.',
    ],
    dicas: ['A atividade que aparece na base é só uma sugestão. A classificação vale o que você registrar.'],
  },
  {
    id: 'rotas', titulo: 'Rotas de visita (planos pagos)', link: '/rotas',
    resumo: 'Monta a rota de visitas a clientes ou prospects, na ordem mais próxima, envia ao representante e guarda o histórico do que foi visitado.',
    imagens: [
      { src: '/ajuda/rotas.jpg', legenda: 'Paradas escolhidas, rota no mapa, ordem das visitas e o representante responsável.' },
      { src: '/ajuda/rotas-salva.jpg', legenda: 'Rota salva: visitas feitas com observações, Compartilhar, Copiar link e Abrir no Google Maps.' },
    ],
    passos: [
      'Escolha clientes ou prospects, filtre por estado, cidade ou nome e clique em Buscar.',
      'Marque as paradas (até 25). A primeira marcada é o ponto de partida. Clique em Montar rota.',
      'O sistema sugere a ordem pela proximidade. Use as setas para subir ou descer uma parada e o × para tirar.',
      'Escolha o representante responsável, dê um nome à rota e clique em Salvar rota.',
      'Em Rotas salvas, Compartilhar manda pelo WhatsApp a lista de paradas, o trajeto no Google Maps e o link da rota. Copiar link copia só o endereço da rota.',
      'O representante abre o link, entra com o acesso dele e marca cada visita como feita, com observações. As rotas dele aparecem primeiro, como Minha rota.',
      'Abrir no Google Maps mostra o trajeto por ruas, pronto para seguir no celular.',
    ],
    dicas: ['O representante precisa estar cadastrado em Configurações > Membros, com o papel Vendedor.', 'A distância mostrada é em linha reta e serve só para ordenar as visitas.'],
  },
  {
    id: 'simulador', titulo: 'Simulador de expansão', link: '/simulador',
    resumo: 'Estima quanto uma nova cidade ou região pode render, com três cenários.',
    imagens: [{ src: '/ajuda/simulador.jpg', legenda: 'Cenários conservador, intermediário e otimista, com comparação do faturamento anual.' }],
    passos: [
      'Escolha o estado e, se quiser, a cidade. O sistema mostra quantos clientes e prospects você já tem lá e quantas empresas a base conhece.',
      'Informe quantos clientes novos espera, o ticket médio e a frequência de compra.',
      'Se quiser ver a margem, informe a margem de lucro em porcentagem.',
      'Compare os três cenários: conservador (metade dos clientes), intermediário e otimista (40% a mais).',
    ],
    dicas: ['É uma simulação com os números que você informa. Não é previsão nem garantia de faturamento.'],
  },
  {
    id: 'relatorio', titulo: 'Relatório semanal (planos pagos)', link: '/relatorio',
    resumo: 'Resumo da semana comercial para a diretoria, comparado com a semana anterior.',
    imagens: [{ src: '/ajuda/relatorio.jpg', legenda: 'Relatório da semana com variação, cidades em movimento, vendedores e envio por e-mail.' }],
    passos: [
      'Escolha a semana. A última semana completa já vem selecionada.',
      'Clique em Salvar em PDF e, na janela de impressão, escolha Salvar como PDF.',
      'Dono e admin ativam o envio automático por e-mail, escolhendo o dia, a hora e os destinatários.',
      'Cada semana é enviada uma única vez, no dia e horário combinados.',
    ],
  },
  {
    id: 'clyvo-ai', titulo: 'Clyvo AI (planos pagos)', link: '/clyvo-ai',
    resumo: 'Assistente que responde em português sobre clientes, prospects e equipe, e também tira dúvidas de como usar o Clyvo Map. Atende 24 horas.',
    imagens: [{ src: '/ajuda/clyvo-ai.jpg', legenda: 'Uma pergunta sobre a carteira, uma dúvida de uso e o saldo de créditos.' }],
    passos: [
      'Clique em uma sugestão ou escreva sua pergunta, por exemplo: quais clientes devo ligar esta semana?',
      'Pergunte também como fazer algo no sistema, por exemplo: como monto uma rota para o meu vendedor?',
      'Se algo não funcionar como deveria, descreva o que aconteceu: a tela, o botão e a mensagem que apareceu. A Clyvo AI orienta o que fazer e, se for um defeito, indica o e-mail do suporte.',
      'Cada pergunta usa 1 crédito. O saldo aparece no topo da tela.',
      'O histórico das suas perguntas fica na própria tela. Dono e admin também veem as da equipe.',
    ],
    dicas: ['As respostas sobre a sua operação usam só os dados da sua empresa. A IA pode errar: confira os números nas telas antes de decidir.'],
  },
  {
    id: 'equipe', titulo: 'Configurações e equipe', link: '/configuracoes',
    resumo: 'Dados da empresa, quem tem acesso, o que cada pessoa pode fazer e quanto do plano já foi usado.',
    imagens: [
      { src: '/ajuda/config-membros.jpg', legenda: 'Membros da empresa, papéis e convite de novas pessoas.' },
      { src: '/ajuda/config-uso.jpg', legenda: 'Uso: limites do plano e consumo do mês.' },
    ],
    passos: [
      'Empresa: nome e CNPJ. Só dono e admin alteram.',
      'Membros: convide pelo e-mail. A pessoa cria a conta com esse e-mail e entra na empresa automaticamente.',
      'Dono e admin gerenciam tudo, inclusive pessoas e o bate-papo. Vendedor trabalha clientes, prospects, funil e rotas. Leitor só consulta.',
      'Uso: mostra usuários, consultas ao Google, exportações e prospects em relação ao limite do plano, mês a mês.',
      'Atividades: dono e admin veem o registro do que foi feito na empresa.',
    ],
  },
  {
    id: 'bate-papo', titulo: 'Bate-papo: WhatsApp (planos pagos)', link: '/configuracoes',
    resumo: 'Liga o Clyvo Map ao WhatsApp da empresa, por um fluxo de automação (n8n). As respostas voltam para o histórico e para o Funil.',
    imagens: [{ src: '/ajuda/config-bate-papo.jpg', legenda: 'Endereço do fluxo, colunas automáticas do Funil e dados para o retorno das conversas.' }],
    passos: [
      'Em Configurações > Bate-papo, cole o endereço do webhook do seu fluxo e salve.',
      'Escolha para qual coluna do Funil vai quem tiver interesse e quem não tiver.',
      'Clique em Enviar teste e confira se o fluxo recebeu.',
      'No fluxo, use o endereço de retorno e a chave de segurança para avisar quando a mensagem for entregue, respondida ou quando o contato não tiver WhatsApp.',
      'Quem diz que não tem interesse não recebe mais mensagens. Um admin pode liberar de novo na ficha.',
    ],
    dicas: ['Use um número de WhatsApp oficial da empresa e respeite quem pedir para não receber mensagens.'],
  },
  {
    id: 'planos', titulo: 'Teste grátis e planos pagos',
    resumo: 'O teste grátis dura 7 dias e mostra o Clyvo Map funcionando com os seus próprios dados. Os recursos marcados como pago ficam liberados na contratação.',
    imagens: [{ src: '/ajuda/plano-pago.jpg', legenda: 'No teste grátis, os recursos pagos aparecem com a etiqueta pago no menu e, ao abrir, explicam o que fazem.' }],
    passos: [
      'No teste, importe até 30 clientes e use o mapa, a prospecção, o funil, os clientes inativos e o simulador.',
      'Concorrência, Rotas de visita, Relatório semanal e Clyvo AI são dos planos pagos. No menu, eles têm a etiqueta pago.',
      'Exportar planilhas, enviar e-mail, conectar o bate-papo, compartilhar rotas e integrar por API ou banco de dados também são dos planos pagos. No teste, esses botões aparecem com (plano pago).',
      'Para contratar, clique em Conhecer os planos em qualquer tela bloqueada.',
    ],
  },
]

export default function ComoUsar() {
  const [zoom, setZoom] = useState<{ src: string; legenda: string } | null>(null)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setZoom(null)
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [])
  return (
    <div className="page ajuda">
      <div className="page-head">
        <div>
          <h1>Como usar</h1>
          <p>O que cada parte do Clyvo Map faz e como usar no dia a dia. As imagens usam uma empresa e dados fictícios.</p>
        </div>
      </div>

      <div className="ajuda-grid">
        <nav className="ajuda-indice" aria-label="Seções">
          <a href="#primeiros">Primeiros passos</a>
          <a href="#implantacao">Como é a implantação</a>
          <a href="#suporte">Atendimento e suporte</a>
          {SECOES.map((s) => <a key={s.id} href={'#' + s.id}>{s.titulo}</a>)}
          <a href="#duvidas">Dúvidas comuns</a>
        </nav>

        <div className="ajuda-conteudo">
          <section id="primeiros" className="panel panel-b ajuda-secao">
            <h2>Primeiros passos</h2>
            <ol className="ajuda-passos-iniciais">
              {PRIMEIROS.map(([t, d]) => <li key={t}><b>{t}</b><span>{d}</span></li>)}
            </ol>
          </section>

          <section id="implantacao" className="panel panel-b ajuda-secao">
            <h2>Como é a implantação</h2>
            <p className="ajuda-resumo">A implantação leva 30 dias e é o trabalho da nossa equipe para deixar o Clyvo Map pronto e ajustado ao ramo da sua empresa. Você não começa com uma ferramenta genérica: ela já chega configurada para o seu mercado.</p>
            <h3>O que a equipe faz</h3>
            <ul className="ajuda-lista">
              <li><b>Entende o seu nicho.</b> Você preenche um formulário completo para a equipe entender o que você vende, para quem vende e em que região atua.</li>
              <li><b>Filtra os possíveis clientes.</b> Selecionamos, entre as empresas abertas na sua região, só as que combinam com o seu ramo, para a lista ser a mais fiel possível ao seu público.</li>
              <li><b>Traz possíveis concorrentes e fornecedores.</b> Mapeamos quem vende o mesmo que você e quem pode abastecer o seu negócio, para você enxergar o mercado inteiro no mapa.</li>
              <li><b>Ajusta o sistema ao seu ramo.</b> Categorias da concorrência, funil de vendas, termos e filtros seguem a realidade da sua empresa.</li>
              <li><b>Organiza a sua carteira.</b> Importamos sua lista de clientes e conferimos telefones, endereços e datas de compra.</li>
              <li><b>Prepara a equipe.</b> Criamos os acessos e as permissões de cada pessoa e mostramos como usar no dia a dia.</li>
            </ul>
            <h3>Como acontece</h3>
            <ol className="ajuda-passos-iniciais">
              <li><b>Formulário completo</b><span>Você responde às perguntas sobre o seu negócio, o seu público e a sua região de atuação.</span></li>
              <li><b>Configuração (até 30 dias)</b><span>A equipe monta a conta e filtra o seu nicho, com clientes, concorrentes e fornecedores. A implantação leva até 30 dias.</span></li>
              <li><b>Entrega e treinamento</b><span>Ao fim do prazo, você recebe o sistema pronto e a sua equipe aprende a usar.</span></li>
              <li><b>Acompanhamento</b><span>Seguimos disponíveis para ajustar filtros e tirar dúvidas.</span></li>
            </ol>
            <div className="obs"><p>Depois de pronto, os ajustes de nicho (novas categorias, outras cidades) podem ser pedidos à equipe a qualquer momento.</p></div>
          </section>

          <section id="suporte" className="panel panel-b ajuda-secao">
            <h2>Atendimento e suporte</h2>
            <p className="ajuda-resumo">O atendimento funciona 24 horas pela Clyvo AI, que tira qualquer dúvida de uso e ajuda quando algo não funciona como deveria. Se preferir, fale com a nossa equipe por e-mail.</p>
            <ul className="ajuda-lista">
              <li><b>Clyvo AI, 24 horas.</b> No menu, abra Clyvo AI e pergunte como fazer qualquer coisa no sistema, ou conte o problema que encontrou.</li>
              <li><b>E-mail.</b> Escreva para <a className="link" href={'mailto:' + SUPORTE_EMAIL}>{SUPORTE_EMAIL}</a>.</li>
              <li><b>Para relatar um defeito,</b> diga em qual tela estava, o que esperava que acontecesse e o que aconteceu. Se puder, mande um print da tela.</li>
            </ul>
          </section>

          {SECOES.map((s) => (
            <section key={s.id} id={s.id} className="panel panel-b ajuda-secao">
              <div className="ajuda-cab">
                <h2>{s.titulo}</h2>
                {s.link && <Link className="btn btn-sm" to={s.link}>Abrir</Link>}
              </div>
              <p className="ajuda-resumo">{s.resumo}</p>
              <div className={'ajuda-imgs' + (s.imagens.length > 1 ? ' duas' : '')}>
                {s.imagens.map((im) => (
                  <figure key={im.src}>
                    <button type="button" onClick={() => setZoom(im)} aria-label={'Ampliar imagem: ' + im.legenda}>
                      <img src={im.src} alt={im.legenda} loading="lazy" width={1208} height={900} />
                    </button>
                    <figcaption>{im.legenda}</figcaption>
                  </figure>
                ))}
              </div>
              <h3>Como usar</h3>
              <ul className="ajuda-lista">{s.passos.map((p) => <li key={p}>{p}</li>)}</ul>
              {s.dicas && <div className="obs">{s.dicas.map((d) => <p key={d}>{d}</p>)}</div>}
            </section>
          ))}

          <section id="duvidas" className="panel panel-b ajuda-secao">
            <h2>Dúvidas comuns</h2>
            <dl className="ajuda-faq">
              <dt>De onde vêm os potenciais clientes?</dt>
              <dd>Dos dados abertos de CNPJ da Receita Federal, filtrados para o seu segmento. A base é atualizada uma vez por mês.</dd>
              <dt>Por que alguns telefones aparecem como fixo?</dt>
              <dd>Muitas empresas informam à Receita o telefone fixo ou o do contador. Para esses, o melhor é ligar ou usar Buscar no Google para achar outro número.</dd>
              <dt>Meus dados ficam visíveis para outras empresas?</dt>
              <dd>Não. Cada empresa vê só os próprios clientes, prospects e anotações.</dd>
              <dt>Posso importar a planilha de novo?</dt>
              <dd>Sim. Clientes com o mesmo código do seu sistema são atualizados, sem duplicar.</dd>
              <dt>Dá para ligar o Clyvo Map direto ao meu sistema (ERP)?</dt>
              <dd>Hoje os clientes entram pela planilha (Importar CSV). A integração por API e por banco de dados está em desenvolvimento e será liberada nos planos pagos.</dd>
              <dt>O representante precisa de acesso para usar a rota?</dt>
              <dd>Sim. Convide-o em Configurações &gt; Membros com o papel Vendedor. Ele abre o link da rota, entra e marca as visitas.</dd>
              <dt>Como falo com o suporte?</dt>
              <dd>Pela Clyvo AI, 24 horas, ou pelo e-mail <a className="link" href={'mailto:' + SUPORTE_EMAIL}>{SUPORTE_EMAIL}</a>.</dd>
            </dl>
          </section>
        </div>
      </div>

      {zoom && (
        <div className="ajuda-zoom" role="dialog" aria-label="Imagem ampliada" onClick={() => setZoom(null)}>
          <figure onClick={(e) => e.stopPropagation()}>
            <img src={zoom.src} alt={zoom.legenda} />
            <figcaption>{zoom.legenda} <button type="button" className="btn btn-sm" onClick={() => setZoom(null)}>Fechar</button></figcaption>
          </figure>
        </div>
      )}
    </div>
  )
}
