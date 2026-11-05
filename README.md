# 🌸 Minhas Notas

Notas e checklists com banco de dados **Postgres**, pontuação do mês, florzinhas e uma **janelinha flutuante** que fica por cima dos outros programas.

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
│   │   └── pip.css        # visual da janelinha flutuante
│   └── js/
│       ├── app.js         # página principal (lista + abrir/fechar o editor)
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

Os itens de cada tipo ficam em `RESCISSION_TYPES` (e os fixos em `RESCISSION_TOP` e `RESCISSION_BOTTOM`), no começo de `server/index.js`.

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
- Use `127.0.0.1` no `DATABASE_URL`: no Windows, `localhost` pode causar uma espera a cada conexão.

## Configuração do banco

Tudo fica no arquivo `.env`:

| Variável       | Exemplo                                           |
|----------------|---------------------------------------------------|
| `DATABASE_URL` | `postgres://notas:notas123@127.0.0.1:5432/notas`  |
| `PGSSL`        | `true` para bancos na nuvem (Supabase, Neon…)     |
| `PORT`         | `3000`                                            |
| `APP_TZ`       | `America/Fortaleza`                               |
