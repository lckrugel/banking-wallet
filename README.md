# Banking Wallet

Este repositorio contém uma implementação básica de um sistema de carteiras de valores.

## Stack utilizada

- NodeJS (v24)
- NestJS (v12)
- Drizzle ORM (v1)
- Postgres (v18)

## O que foi implementado

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

### Logs

Logs da aplicação podem ser acessados através do comando:

```
docker compose logs api -f
```
