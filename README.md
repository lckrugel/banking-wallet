# Banking Wallet

API REST de carteiras digitais construída como um monólito modular com event
sourcing leve e PostgreSQL. Valores monetários são representados em centavos
inteiros.

> **Em desenvolvimento:** cadastro, autenticação, consulta de saldo, transferências idempotentes e estornos estão implementados.
> O projeto ainda não está pronto para operar dinheiro real em produção.

## Documentação e estado atual

Consulte a [arquitetura atual](docs/architecture.md) e as
[diretrizes de desenvolvimento](AGENTS.md) para os fluxos, garantias e limitações.

| Funcionalidade                                 | Estado                                                   |
| ---------------------------------------------- | -------------------------------------------------------- |
| Cadastro de usuário com carteira de saldo zero | Implementado em uma única transação                      |
| Login e logout                                 | Implementados com JWT e sessão persistida revogável      |
| Consulta da própria carteira                   | Implementada e autenticada                               |
| Eventos e projeção de saldo/versão             | Implementados                                            |
| Replay/verificação da carteira                 | Internos; sem reparo automático                          |
| Seed de desenvolvimento                        | CLI interna; não é depósito                              |
| Transferências autenticadas                    | Implementadas com chave de idempotência persistida       |
| Estornos                                       | Implementados como operações compensatórias idempotentes |
| Reconciliação entre operações                  | Não implementada                                         |

## Stack

- Node.js 24 e TypeScript.
- NestJS 12.
- Drizzle ORM 1 (release candidate; consulte `package-lock.json`).
- PostgreSQL 18.
- Vitest e Supertest para testes; Argon2id para senhas.

## Executando localmente

Pré-requisitos: Docker com Compose. Para executar comandos npm fora dos
containers, instale Node.js 24 e as dependências com `npm ci`.

### 1. Configure o ambiente

```sh
cp .env.example .env
```

Os valores do exemplo são apenas para desenvolvimento. Substitua `JWT_SECRET`
por um segredo aleatório forte e não versione o `.env`.

### 2. Inicie o banco e aplique as migrations

```sh
docker compose up -d db
docker compose run --build --rm migrate
```

Aplique as migrations no primeiro uso e sempre que novas migrations forem
adicionadas. Elas ficam em `drizzle/schemas/`.

### 3. Inicie a API

```sh
docker compose up -d --build api
```

Alternativamente, com o banco disponível e `PG_HOST`/`PG_PORT` apontando para ele:

```sh
npm ci
npm run db:migrate
npm run start:dev
```

### 4. Explore a API

Com a API em execução, acesse [Swagger UI](http://localhost:3000/docs) para
consultar e experimentar os endpoints. A especificação OpenAPI em JSON está em
[`/docs-json`](http://localhost:3000/docs-json).

O campo `amountCents` deve ser uma string decimal inteira positiva, limitada ao
BIGINT assinado do PostgreSQL. A transferência é atômica e aparece no histórico de
ambas as carteiras. Gere uma chave UUID por comando de transferência e reutilize
exatamente a mesma chave ao repetir uma chamada cujo resultado seja incerto; não
gere outra chave para uma simples repetição. A chave é escopada pelo usuário
autenticado e retida indefinidamente.

Uma repetição com o mesmo comando normalizado retorna o resultado original sem
novos efeitos financeiros. Reutilizar a chave com outro destinatário ou valor
retorna `409 IDEMPOTENCY_KEY_REUSED`; chaves ausentes ou inválidas retornam `400`.

A reserva da chave, a operação, as projeções e os eventos são confirmados juntos.
Falhas não persistem a chave, então a chamada pode ser tentada novamente.
Chamadas simultâneas com a mesma chave são serializadas pelo PostgreSQL: apenas
uma operação é criada. Chamadas concorrentes com comandos diferentes resultam
em uma criação e um conflito.

Somente o remetente original pode estornar uma transferência `COMPLETED`, pelo
endpoint autenticado `POST /transfers/:id/reverse`, com um `Idempotency-Key`
UUID próprio. O estorno é sempre integral; não há estornos parciais. O destinatário
precisa manter saldo suficiente para devolver o valor: movimentações posteriores
podem tornar o estorno indisponível (`422 INSUFFICIENT_FUNDS`).

O estorno é uma nova operação compensatória, não um rollback: os eventos originais
permanecem imutáveis, e o histórico exibe a transferência original como `REVERSED`
e uma operação `REVERSAL` separada. Use a mesma chave em tentativas repetidas;
chaves distintas para uma transferência já estornada entram em conflito (`409`).

Uma falha durante a execução causa rollback de todas as escritas. Já o estorno
após o commit é uma nova movimentação; ele não restaura saldos antigos nem desfaz
outras transferências. Uma retentativa idempotente retorna a resposta original de
criação (`COMPLETED`), mesmo após estorno; consulte o histórico para o status atual.

O cadastro cria a carteira junto com o usuário; o saldo pode ser consultado em
`GET /wallets`. Valores monetários são strings de centavos, não unidades monetárias.
O logout revoga a sessão do token utilizado.

| Método | Rota                     | Autenticação | Finalidade                                               |
| ------ | ------------------------ | ------------ | -------------------------------------------------------- |
| `POST` | `/users`                 | Não          | Cadastrar usuário e criar sua carteira                   |
| `POST` | `/auth/login`            | Não          | Criar sessão e emitir token                              |
| `POST` | `/auth/logout`           | Bearer       | Revogar a sessão atual                                   |
| `GET`  | `/wallets`               | Bearer       | Consultar a própria carteira                             |
| `GET`  | `/wallets/history`       | Bearer       | Consultar transferências/estornos da própria carteira    |
| `POST` | `/transfers`             | Bearer       | Transferir centavos para outro usuário                   |
| `POST` | `/transfers/:id/reverse` | Bearer       | Compensar integralmente transferência própria concluída  |
| `GET`  | `/health/live`           | Não          | Verificar se o processo da API está ativo                 |
| `GET`  | `/health/ready`          | Não          | Verificar se o banco de dados está acessível              |

O histórico retorna operações de transferência/estorno em ordem decrescente por
data e identificador. Use `limit` (1–100, padrão 20) e `nextCursor` como
`cursor` na próxima chamada. Valores `amountCents` são strings de centavos;
eventos internos de criação e seed não aparecem no histórico. As rotas para
criar depósitos ainda não existem.

## Saldo para desenvolvimento

Após cadastrar um usuário, é possível carregar saldo por uma CLI interna:

```sh
WALLET_SEED_USER_ID=<uuid-do-usuario> \
WALLET_SEED_AMOUNT_CENTS=25000 \
WALLET_SEED_REFERENCE=demo-fixture-001 \
npm run db:seed-wallet
```

Execute com as dependências instaladas e o `.env` apontando para o banco local.
A CLI gera um evento `SEED_FUNDS` e atualiza a projeção na mesma transação.
Para a mesma carteira, repetir referência e valor não aplica o crédito novamente;
usar a referência com outro valor gera conflito. Uma execução concorrente pode
exigir nova tentativa por conflito de versão. Não é uma integração de depósito
nem deve ser usada como mecanismo de financiamento de produção.

## Testes e verificações

```sh
npm test
npm run test:cov
npm run lint
npm run typecheck
npm run build
```

### Integração com PostgreSQL

Use um banco exclusivo e efêmero. Escolha uma porta livre, por exemplo `5433`:

```sh
PG_TEST_PORT=5433 docker compose -p banking-wallet-test -f compose.test.yml up -d db
# Aguarde o banco ficar saudável antes de aplicar as migrations.
PG_HOST=127.0.0.1 PG_PORT=5433 npm run db:migrate
TEST_PG_HOST=127.0.0.1 TEST_PG_PORT=5433 npm run test:integration
docker compose -p banking-wallet-test -f compose.test.yml down
```

As migrations usam `PG_HOST`/`PG_PORT`; os testes de integração usam
`TEST_PG_HOST`/`TEST_PG_PORT`. Ambos usam `PG_USER`, `PG_PASSWORD` e `PG_DB` do
ambiente ou `.env`. Não aponte esses comandos para um banco compartilhado ou de
produção: os testes escrevem e removem dados. O container de teste usa `tmpfs`;
seus dados não são persistidos após sua remoção.

Os testes de integração cobrem rollback, concorrência de projeções, constraints
e divergência entre projeção e eventos, além de idempotência e disputa de saldo
entre transferência e estorno.

## Logs e operação

```sh
docker compose logs -f api
```

As requisições geram logs JSON com identificador, rota, status e duração; falhas
incluem código e tipo do erro, com stack trace apenas para erros de servidor. O
`x-request-id` da resposta permite correlacionar a chamada com os logs. Os
endpoints de saúde são públicos. `/health/ready` executa `SELECT 1` no PostgreSQL,
com timeout de três segundos para obter conexão e limite de três segundos para a
instrução SQL; a duração total da chamada pode ser maior.
Não há reconciliação entre operações nem reparo automático de projeções; o projeto
não está pronto para operar dinheiro real em produção.

## Implementação e uso de IA

Este projeto foi desenvolvido com o apoio de agentes de IA para prototipação, programação, documentação e testes.

Inicialmente, os requisitos funcionais e não funcionais do projeto foram definidos
em discussão com um agente. Com isso, foi criado um plano de ação, que deu origem
a tarefas focadas e com critérios claros de aceitação.

O desenvolvimento de cada tarefa foi feito em grande parte por agentes, seguido
de uma revisão humana, especialmente dos testes e dos cenários que eles cobrem.
