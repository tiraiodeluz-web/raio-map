# Clyvo Map

Plataforma de inteligência comercial e expansão territorial para empresas B2B. O segmento de cada instalação (o que o robô procura na Receita e como as categorias aparecem) fica em `public/config/segmento.json`.

## O que já funciona (Etapa 2)

- Login por e-mail e senha, recuperação de senha, convite de membros por e-mail.
- Multiempresa: cada empresa tem seus usuários, clientes, histórico e configurações, isolados por RLS no Postgres.
- Papéis: dono, admin, vendedor, leitor.
- Dashboard: clientes, municípios atendidos, cobertura por estado, cidades com mais clientes, novos clientes por mês.
- Mapa comercial: agrupamento de marcadores, cor por estado (concentração), filtros por categoria, estado e município, busca por cidade, estado, CEP ou cliente, raio a partir de um CEP (10 a 200 km), ficha do cliente.
- Clientes: lista paginada no servidor, busca, filtros, ficha com edição, histórico de contatos, exportação CSV dentro do limite do plano.
- Importação de clientes por CSV com mapeamento de colunas, localização por cidade e CEP, atualização por código do ERP.
- Configurações: dados da empresa, membros e convites, plano e uso do mês, registro de atividades.

## Stack

React 18 + Vite + TypeScript · Leaflet + Supercluster · Supabase (Auth, Postgres + PostGIS, RLS).
O mapa usa os contornos estaduais do IBGE e não depende de servidor de mapas pago.

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # URL e chave PÚBLICA do Supabase
npm run dev
```

## Banco de dados

- `supabase/migrations/`: schema completo, na ordem em que foi aplicado no projeto `raio-map`.
- `supabase/seed/municipios.sql`: carga dos municípios (já aplicada).
- `supabase/tests/isolamento.sql`: teste de isolamento entre empresas (desfaz tudo ao final).

Nunca coloque a chave `service_role` neste repositório nem no app: ele roda no navegador.

## Publicar no Cloudflare Pages

1. Cloudflare › Workers & Pages › Create › Pages › Connect to Git › escolha este repositório.
2. Build command: `npm run build` · Output directory: `dist`.
3. Variáveis de ambiente: não são necessárias. O endereço e a chave pública do Supabase já estão em `src/lib/supabase.ts`; use as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` só se quiser apontar para outro projeto.
4. Depois do primeiro deploy, no Supabase › Authentication › URL Configuration, coloque o endereço do site em **Site URL** e em **Redirect URLs** (com `/**` no fim).

No Cloudflare Workers, o `wrangler.jsonc` publica a pasta `dist` e faz as rotas do app (ex.: `/mapa`) funcionarem ao recarregar a página. Build command: `npm run build`; deploy command: `npx wrangler deploy`.

## Dados de referência

- Municípios e coordenadas: [kelvins/municipios-brasileiros](https://github.com/kelvins/municipios-brasileiros)
- Faixas de CEP por município: [Maahzuka/database-CEPS](https://github.com/Maahzuka/database-CEPS) (`public/geo/faixas-cep.json`)
- Contornos estaduais: [click_that_hood](https://github.com/codeforgermany/click_that_hood), simplificados
