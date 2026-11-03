# 🌸 Minhas Notas

Notas e checklists com banco de dados **Postgres**. Ao marcar um item como concluído, florzinhas desabrocham na tela.

## Estrutura

```
notas-checklist/
├── db/schema.sql          # tabelas (notes e tasks)
├── server/
│   ├── db.js              # conexão com o Postgres
│   └── index.js           # API (Express)
├── public/
│   ├── index.html
│   ├── css/style.css      # visual rosa
│   └── js/
│       ├── api.js         # chamadas à API
│       ├── app.js         # lógica da tela
│       ├── score.js       # pontuação, metas e mensagens
│       └── flowers.js     # animação das florzinhas
├── docker-compose.yml     # Postgres pronto para usar
└── .env.example           # configuração do banco
```

## Como rodar

**1. Suba o Postgres** (opção com Docker):

```bash
docker compose up -d
```

Sem Docker? Crie o banco no seu Postgres: `createdb notas` e ajuste o `DATABASE_URL` no passo 2.

**2. Configure e instale:**

```bash
cp .env.example .env
npm install
```

**3. Inicie:**

```bash
npm start
```

Abra http://localhost:3000. As tabelas são criadas sozinhas na primeira vez.

## Admissões

O botão **＋ Nova admissão** cria uma nota já com o checklist pronto. Você só preenche nome, empresa, data de admissão e observações.

Itens fixos (podem ser marcados, mas não removidos nem renomeados):

- Admissão preliminar
- Envio p/ eSocial
- Envio de documentação admissional
- Doc. Pessoais na pasta

**Tem VT?** e **Tem VR?**: ao escolher *Sim*, aparece uma linha para escrever qual evento cadastrar na admissão, e entra no checklist o item "Evento VT" (ou "Evento VR"). Ao escolher *Não*, a linha e o item somem.

Para mudar a lista de itens fixos ou os nomes dos eventos, edite `FIXED_TASKS` e `BENEFITS` no começo de `server/index.js`.

Se você já rodou a versão anterior, é só reiniciar o servidor: as colunas novas são adicionadas ao banco automaticamente e suas notas continuam lá.

## Pontuação do mês

Cada item concluído vale **1 ponto**. O cartão no topo mostra o desempenho do mês, a barra de progresso e a etapa atual (Semente, Brotinho, Florzinha, Jardim florido, Buquê completo).

- **Meta do mês:** começa em 100 pontos e pode ser mudada no botão *Editar meta*.
- **Marcos:** ao chegar em 30%, 50%, 75% e 100% da meta, aparece uma mensagem de comemoração com chuva de flores. Cada marco aparece só uma vez por mês.
- **Desmarcar um item** tira o ponto. Excluir um item (ou uma nota) já concluído também.
- **Virada do mês:** a pontuação recomeça do zero todo mês. O fuso usado fica em `APP_TZ` no `.env`.
- Itens concluídos antes desta versão não entram na pontuação.

Para mudar os textos das mensagens, edite o começo de `public/js/score.js`. Para mudar os marcos (%), edite `MILESTONES` em `server/index.js`.

## Configuração do banco

Tudo fica no arquivo `.env`:

| Variável       | Exemplo                                         |
|----------------|-------------------------------------------------|
| `DATABASE_URL` | `postgres://notas:notas123@localhost:5432/notas` |
| `PGSSL`        | `true` para bancos na nuvem (Supabase, Neon…)   |
| `PORT`         | `3000`                                          |

## Suas notas antigas (localStorage)

As notas salvas na versão anterior ficam no navegador e não vão para o banco automaticamente. Se quiser migrá-las, me avise que eu faço um botão de importar.
