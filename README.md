# Banking Wallet

Este repositorio contém uma implementação básica de um sistema de carteiras de valores.

## Stack utilizada

- NodeJS (v24)
- NestJS (v12)
- Drizzle ORM (v1)
- Postgres (v18)

## O que foi implementado

- Carteira como agregado, com eventos append-only e valores em centavos.
- Projeção transacional de saldo/versão em `wallets`; eventos persistidos em
  `events` são a fonte de verdade.
- Registro cria usuário, carteira, projeção e evento inicial no mesmo Unit of
  Work. Alterações de saldo verificam a versão esperada e gravam projeção e
  eventos na mesma transação.
- Replay do histórico e verificador interno que compara o replay com a projeção.
- Erros de domínio/persistência independentes do NestJS; a fronteira HTTP os
  mapeia para respostas seguras.

Transferências e estornos ainda não estão implementados. As tabelas e constraints
relacionadas são preparação para esses casos de uso.

## Executando o projeto

Para executar o projeto, recomenda-se seguir este passo-a-passo:

**1. Crie um arquivo `.env` a partir do exemplo:**

```sh
cp .env.example .env
```

Este arquivo contém variáveis placeholder, para testes locais.

**2. Executando a instância do Postgres:**

```sh
docker compose up -d db
```

**3. Executando as migrations:**

Necessário apenas quando houver novas migrations, ou quando estiver executando o projeto pela primeira vez.

```sh
docker compose run --build --rm migrate
```

Este comando constrói um container temporário, executa as migrations e o remove ao terminar.

**4. Executando a aplicação:**

```sh
docker compose up -d api
```

Com isso a API deve estar respondendo na porta definida no `.env`.

**5. Verifique funcionamento:**

Verifique que a api está funcionando com:

```sh
curl http://localhost:3000
```

Altere a porta para a que estiver definida no seu `.env`.

### Testes

Os testes unitários rodam com:

```sh
npm test
```

Os testes de integração usam PostgreSQL real e um container temporário. Escolha
uma porta livre (o exemplo usa `5433`):

```sh
PG_TEST_PORT=5433 docker compose -p banking-wallet-test -f compose.test.yml up -d db
PG_HOST=127.0.0.1 PG_PORT=5433 npm run db:migrate
TEST_PG_PORT=5433 npm run test:integration
docker compose -p banking-wallet-test -f compose.test.yml down
```

Os testes leem usuário, senha e nome do banco de `PG_USER`, `PG_PASSWORD` e
`PG_DB`. O banco de teste é efêmero; não aponte esse comando para o banco de
desenvolvimento.

### Event sourcing e consistência

Cada evento tem versão sequencial por carteira. O agregado valida as regras de
domínio; o serviço de eventos valida o lote; o repository persiste e converte
constraints conhecidas do PostgreSQL em erros customizados. Para alterar uma
carteira existente, a atualização da projeção compara a versão previamente
carregada (controle otimista). Conflitos ou falhas no append revertem a
transação inteira.

`WalletConsistencyVerifier` é uma operação interna, não um endpoint público nem
um job periódico. Ele lê projeção e eventos numa transação `REPEATABLE READ`,
reconstrói o agregado e informa divergências sem reparar dados.

Saldos iniciais podem ser aplicados sem endpoint público por um evento
`SEED_FUNDS` rastreado por referência. A mesma referência e o mesmo valor são
idempotentes; reutilizar a referência com outro valor é conflito:

```sh
WALLET_SEED_USER_ID=<uuid> \
WALLET_SEED_AMOUNT_CENTS=25000 \
WALLET_SEED_REFERENCE=demo-fixture-001 \
npm run db:seed-wallet
```

Erros conhecidos são convertidos em status HTTP pela fronteira NestJS (por
exemplo, recurso ausente `404`, conflito de versão `409` e regra monetária
inválida `422`). Erros de integridade do histórico são tratados como falhas
internas `500`; detalhes do PostgreSQL não são enviados ao cliente.

### Logs

Logs da aplicação podem ser acessados através do comando:

```
docker compose logs api -f
```
