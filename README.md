# 🌸 Rotinas do DP | P&P

Painel de gestão de RH com **Postgres**: dashboard de pendências, notas, admissão, rescisão, férias, calculadora, calendário e arquivos — mais a pontuação do mês, as florzinhas e uma **janelinha flutuante** que fica por cima dos outros programas.

## Como rodar

**1. Suba o Postgres** (opção com Docker):

```bash
docker compose up -d
```

Sem Docker? Crie o banco no seu Postgres (`createdb notas`) e ajuste o `DATABASE_URL` no passo 2.

**2. Configure e instale:**

```bash
cp .env.example .env
npm install
```

**3. Inicie:**

```bash
npm start
```

Abra http://localhost:3000. As tabelas são criadas sozinhas.

**Atualizando de uma versão anterior:** substitua os arquivos, rode `npm install` de novo (entrou a compressão das páginas) e reinicie o servidor. As colunas novas entram no banco sozinhas e as notas continuam lá. Reiniciar o servidor também é o que faz o navegador pegar o CSS novo.

## Estrutura

```
notas-checklist/
├── db/schema.sql          # tabelas
├── server/
│   ├── db.js              # conexão com o Postgres
│   └── index.js           # API (Express)
├── public/
│   ├── index.html
│   ├── css/
│   │   ├── style.css      # visual rosa
│   │   ├── panel.css      # menu, dashboard, arquivos, calendário e rodapé
│   │   └── pip.css        # visual da janelinha flutuante
│   └── js/
│       ├── app.js         # menu, módulos, listas e gaveta do editor
│       ├── dashboard.js   # pendências, observações e checklist
│       ├── files.js       # pastas e arquivos
│       ├── calendar.js    # calendário, feriados e eventos
│       ├── vacations.js   # férias
│       ├── calculator.js  # férias, 13º, horas extras e porcentagem
│       ├── notice.js      # mensagem fixa do rodapé
│       ├── editor.js      # editor de nota/admissão (usado na página e na janelinha)
│       ├── store.js       # dados compartilhados e salvamento
│       ├── pip.js         # janelinha flutuante
│       ├── score.js       # pontuação, metas, recompensas e mensagens
│       ├── flowers.js     # florzinhas
│       ├── api.js         # chamadas ao servidor
│       └── util.js        # funções pequenas
├── docker-compose.yml
└── .env.example
```

## Menu e módulos

O menu fica à esquerda no computador e vira uma faixa que rola no celular. Cada item troca a página pela âncora (`#/dashboard`, `#/notas`, `#/admissao`, `#/rescisao`, `#/ferias`, `#/calculadora`, `#/calendario`, `#/arquivos`), então o botão voltar do navegador funciona.

- **Dashboard:** cartão de desempenho, Quadro de Pendências, Quadro de Observações, Checklist e atalhos dos módulos.
- **Notas / Admissão / Rescisão:** a mesma lista, separada por tipo. O editor abre numa gaveta à direita, em qualquer módulo.
- **Férias:** quem sai, de quando até quando, com a situação calculada (programada, em andamento, concluída).
- **Calculadora:** férias + 1/3, 13º proporcional, horas extras e porcentagem. Só contas de apoio (sem INSS/IRRF).
- **Calendário:** mês tradicional, com feriados nacionais, eventos e as datas que vêm dos outros módulos.
- **Arquivos:** pastas e subpastas com os documentos de consulta.

## Quadro de Pendências

Fica no Dashboard, dividido em **Para hoje**, **Para esta semana** e **Pendências futuras**.

- **＋ Nova pendência:** título, descrição, vencimento, prioridade (alta/média/baixa) e módulo (Geral, Admissão, Rescisão ou Férias). Atrasadas ficam com a borda rosa e o aviso "X dias de atraso"; concluídas somem (o botão *Mostrar concluídas* traz de volta).
- **Automáticas:** rescisões com checklist em aberto (prazo = envio da prévia), admissões com checklist em aberto (prazo = data de admissão) e férias que ainda vão começar entram sozinhas no quadro, com a etiqueta *automática*. Elas não são cadastradas de novo: o botão **abrir** leva para o módulo, e elas desaparecem quando o checklist é concluído.

## Observações, Checklist e rodapé

- **Quadro de Observações:** campo grande, salvo sozinho 0,7 s depois da última tecla (fica na tabela `settings`, chave `board`). *Limpar* esvazia.
- **Checklist:** adicionar, marcar/desmarcar, editar o texto no lugar (salva ao sair do campo) e excluir. Fica na tabela `checklist`.
- **Mensagem do rodapé:** barra fixa embaixo, visível em todas as páginas. **✏️ Editar** escreve, **Salvar** guarda (`settings` / `footer_message`) e **Limpar** deixa vazia.

## Arquivos

Gerenciador simples: pastas, subpastas e documentos.

- **＋ Nova pasta** cria dentro da pasta aberta; o nome é pedido na hora. Dá para renomear e excluir (excluir pasta remove o que está dentro).
- **⬆ Enviar arquivo** aceita vários de uma vez, até **12 MB** cada. O conteúdo é guardado no próprio banco (coluna `files.data`, BYTEA), então nada se perde ao reiniciar.
- Cada arquivo tem uma **categoria** (INSS, Tabelas, Legislação, Procedimentos, Documentos, Imagens, Outros — ou uma nova, digitada).
- **abrir** mostra o PDF/imagem no navegador (o resto baixa). Para renomear, ✏️.

## Calendário

- Mês e ano: setas para os lados, `«` `»` para o ano e a lista de anos; **Hoje** volta para o mês atual.
- **Cores dos dias:** segunda a sexta em preto, sábado em rosa, domingo em lilás; feriado nacional em rosa-escuro sublinhado. O dia de hoje ganha um círculo.
- **Feriados:** calculados no navegador (fixos + Carnaval, Paixão e Corpus Christi pela Páscoa). Não precisa de internet.
- **Eventos:** clique no dia, preencha título, descrição, categoria e módulo. Os eventos aparecem como etiquetas no dia e na lista ao lado.
- **Automáticos:** data de admissão, envio da prévia e pagamento das rescisões, início e volta das férias. São só leitura — mudam junto com o módulo de origem.

## Notas e admissões

- **＋ Nova admissão** cria uma nota com o checklist pronto. Preencha nome, empresa, data de admissão e observações.
- Itens fixos (podem ser marcados, mas não removidos): Admissão preliminar, Envio p/ eSocial, Envio de documentação admissional, Doc. Pessoais na pasta.
- **Tem VT? / Tem VR?**: com *Sim*, aparece uma linha para escrever o evento a cadastrar na adm e entra o item "Evento VT" (ou "Evento VR") no checklist.
- **Salvar** grava e fecha a coluna do editor, deixando só a lista de notas. Clique numa nota para abrir de novo. Enquanto digita, tudo também é salvo sozinho.
- Para mudar os itens fixos ou os nomes dos eventos, edite `FIXED_TASKS` e `BENEFITS` no começo de `server/index.js`.

## Rescisão

**＋ Nova rescisão** cria uma nota com o checklist pronto. O título é sempre "Rescisão" + primeiro nome da empresa + primeiro nome do colaborador (ex.: *Rescisão Padaria Maria*).

Campos: Empresa, Colaborador, Tipo de rescisão, Último dia trabalhado, Dia limite de pagamento e Dia limite para enviar a prévia.

**Checklist:** fixos de cima (data base, período de experiência, extrato, consignado, aviso) + itens do tipo escolhido + fixos de baixo (eSocial, arquivo bancário, prévia, Conecta). Ao trocar o tipo, só os itens do meio mudam, e o que já estava marcado e continua no novo tipo se mantém. Os itens fixos e os do tipo não podem ser removidos; itens extras ela pode adicionar (ficam antes dos fixos de baixo). O último item ("Enviado via Conecta") solta uma carinha feliz ao ser marcado. Justa causa ainda não existe, de propósito.

**Carinhas e cores** (a rescisão concluída é a que tem todos os itens marcados):

| Situação | Cor | Carinha |
|---|---|---|
| Dentro do prazo | normal | 🙂 |
| 1 dia de atraso | azul | 🥶 |
| 2 dias ou mais de atraso | vermelho | 😡 |
| Concluída | verdinho pastel | 💅 |

**Qual é o prazo que vale** (em `rescissionDeadline`, no arquivo `public/js/util.js`): é **uma data só** — o Dia limite para enviar a prévia. Se ele ainda estiver vazio, a conta é feita na hora: limite de pagamento menos 5 dias.

- Ao preencher o Último dia trabalhado, o Dia limite de pagamento já vem com +10 dias (prazo legal) e o de enviar a prévia com 5 dias antes disso. Os dois podem ser trocados à mão; quando o de pagamento muda, o de envio acompanha se ainda era automático.
- Caindo no sábado ou domingo, a data vai para a sexta anterior. Feriados não entram na conta.
- **Nada antes do último dia trabalhado:** não dá para pagar nem enviar a prévia antes de a pessoa sair. Se uma data anterior for digitada, o campo volta para o último dia trabalhado e avisa; um envio calculado antes disso é puxado para o último dia trabalhado, e datas erradas já salvas se corrigem ao abrir a nota.

Os itens de cada tipo ficam em `RESCISSION_TYPES` (e os fixos em `RESCISSION_TOP` e `RESCISSION_BOTTOM`), no começo de `server/index.js`.

## Lixeira

O botão **🗑 Lixeira** (na barra de cima) guarda as notas que foram excluídas.

- **Excluir não apaga nada:** o servidor só marca a data (`notes.deleted_at`), a nota sai da lista e vai para a lixeira. Dá para trazer de volta com **Voltar**, com o checklist e as datas inteiros.
- **Excluir para sempre** (`purged_at`) tira a nota da lixeira e ela não aparece mais na interface — mas o conteúdo continua guardado no banco, fora da tela. É de propósito: nada é perdido de verdade.
- A pontuação dos itens já concluídos não muda quando uma nota vai para a lixeira.

## Janelinha flutuante

O botão **Janelinha flutuante** abre uma janela pequena que fica por cima de outros programas (como o vídeo em miniatura do YouTube), para consultar e editar as notas sem sair do sistema que ela está usando.

- **Tamanhos:** abre pequena, com as 3 notas mais recentes. **Minimizar** vira só uma barrinha (pendentes e atrasos); **Expandir** mostra tudo.
- **Expandida:** filtros **Todas / Admissões / Rescisões**, busca pelo nome, filtro por **data** e ordenação **Por data**. Cada nota mostra a carinha e a cor do prazo.
- **＋ Admissão** abre a janela grande para preencher tudo. **＋ Rescisão** abre um formulário rápido (empresa, colaborador e tipo) sem abrir a janela grande; as datas se colocam depois, em **Editar**.
- **Editar** (ou clicar no nome) abre a janela grande com todos os dados e o checklist (com as florzinhas e os pontos). **Salvar** volta para a lista.
- Funciona no **Chrome ou Edge no computador** (versão 116 ou mais nova), abrindo o site por `http://localhost:3000`. No Firefox, Safari e celular o navegador não oferece esse recurso.
- A janelinha pertence à aba do site: pode minimizar a aba, mas não feche nem atualize a aba enquanto usa a janelinha.

## Pontuação do mês

Cada item concluído vale **1 ponto**. O cartão no topo mostra o desempenho do mês, a barra de progresso e a etapa atual.

- **Meta do mês:** começa em 100 pontos; mude em *Editar meta*.
- **Recompensas:** em *Editar recompensas* ela escreve o que ganha ao chegar em 30%, 50%, 75% e 100%. Nada vem pré-preenchido.
- **Marcos:** ao chegar em cada marco aparece uma mensagem de comemoração com chuva de flores (e a recompensa que ela escreveu). Cada marco aparece só uma vez por mês.
- Desmarcar ou excluir um item concluído tira o ponto. A pontuação recomeça todo mês (fuso em `APP_TZ`, no `.env`).
- Para mudar os textos das mensagens, edite o começo de `public/js/score.js`. Para mudar os marcos (%), edite `MILESTONES` em `server/index.js`.

## Velocidade

- Fontes carregam sem travar a página (antes eram 5 famílias, agora 3).
- Notas e pontuação já vêm dentro do HTML, então a tela abre pronta.
- CSS fica em cache; JavaScript é só conferido (resposta 304, sem baixar de novo); páginas são comprimidas.
- O servidor faz uma ida ao banco por ação (antes eram várias) e mantém a conexão aberta.
- Os arquivos não são baixados na listagem: o conteúdo só sai do banco quando alguém abre o documento.
- Use `127.0.0.1` no `DATABASE_URL`: no Windows, `localhost` pode causar uma espera a cada conexão.

## Configuração do banco

Tudo fica no arquivo `.env`:

| Variável       | Exemplo                                           |
|----------------|---------------------------------------------------|
| `DATABASE_URL` | `postgres://notas:notas123@127.0.0.1:5432/notas`  |
| `PGSSL`        | `true` para bancos na nuvem (Supabase, Neon…)     |
| `PORT`         | `3000`                                            |
| `APP_TZ`       | `America/Fortaleza`                               |
