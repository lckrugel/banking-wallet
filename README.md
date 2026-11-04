# Banking Wallet

API REST de carteiras digitais construída como um monólito modular com event
sourcing leve e PostgreSQL. Valores monetários são representados em centavos
inteiros.

> **Em desenvolvimento:** cadastro, autenticação e consulta de saldo estão
> implementados. Transferências, estornos e idempotência de transferências ainda
> não estão disponíveis, apesar de já existirem tabelas para esses fluxos.
> O projeto ainda não está pronto para operar dinheiro real em produção.

## Documentação e estado atual

Consulte a [arquitetura atual](docs/architecture.md), o [plano de implementação](docs/implementation-plan.md)
para lacunas e próximos passos, e as [diretrizes de desenvolvimento](AGENTS.md).

| Funcionalidade                                  | Estado                                              |
| ----------------------------------------------- | --------------------------------------------------- |
| Cadastro de usuário com carteira de saldo zero  | Implementado em uma única transação                 |
| Login e logout                                  | Implementados com JWT e sessão persistida revogável |
| Consulta da própria carteira                    | Implementada e autenticada                          |
| Histórico de eventos e projeção de saldo/versão | Implementados                                       |
| Replay/verificação da carteira                  | Internos; sem reparo automático                     |
| Seed de desenvolvimento                         | CLI interna; não é depósito                         |
| Transferências, idempotência e estornos         | Não implementados; tabelas preparatórias            |
| Reconciliação entre operações                   | Não implementada                                    |

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

### 4. Experimente os endpoints existentes

```sh
curl -X POST http://localhost:3000/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"Pessoa Exemplo","email":"pessoa@example.com","password":"uma-senha-longa-de-exemplo"}'

curl -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"pessoa@example.com","password":"uma-senha-longa-de-exemplo"}'
```

O login retorna `accessToken`, `tokenType` (`Bearer`) e `expiresIn` (`3600`
segundos). Use o token nas chamadas autenticadas:

```sh
curl http://localhost:3000/wallets \
  -H 'Authorization: Bearer <accessToken>'

curl 'http://localhost:3000/wallets/history?limit=20' \
  -H 'Authorization: Bearer <accessToken>'

curl -X POST http://localhost:3000/auth/logout \
  -H 'Authorization: Bearer <accessToken>'
```

A carteira recém-criada retorna `{"walletId":"<uuid>","balance":"0"}`.
`balance` é uma string de centavos, não um valor em unidades monetárias.
O logout revoga a sessão do token utilizado.

| Método | Rota               | Autenticação | Finalidade                                               |
| ------ | ------------------ | ------------ | -------------------------------------------------------- |
| `POST` | `/users`           | Não          | Cadastrar usuário e criar sua carteira                   |
| `POST` | `/auth/login`      | Não          | Criar sessão e emitir token                              |
| `POST` | `/auth/logout`     | Bearer       | Revogar a sessão atual                                   |
| `GET`  | `/wallets`         | Bearer       | Consultar a própria carteira                             |
| `GET`  | `/wallets/history` | Bearer       | Consultar transferências/estornos da própria carteira    |
| `GET`  | `/`                | Não          | Resposta de exemplo `Hello World!`; não verifica o banco |

O histórico retorna operações de transferência/estorno em ordem decrescente por
data e identificador. Use `limit` (1–100, padrão 20) e `nextCursor` como
`cursor` na próxima chamada. Valores `amountCents` são strings de centavos;
eventos internos de criação e seed não aparecem no histórico. As rotas para
criar transferências, estornos ou depósitos ainda não existem.

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
e divergência entre projeção e eventos. Transferências e estornos ainda não existem.

`npm run test:e2e` existe, mas verifica apenas a rota `/`. Consulte o
[plano](docs/implementation-plan.md) para as lacunas de testes.

## Logs e operação

```sh
docker compose logs -f api
```

Há logs padrão do NestJS e de falhas internas de domínio. Ainda não há logging
estruturado ou métricas; `LOG_LEVEL` não configura o logger. Consulte o [plano de
implementação](docs/implementation-plan.md) antes de planejar uso em produção.
