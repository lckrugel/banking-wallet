# Banking Wallet

A REST API for a digital wallet system, allowing users to register, authenticate, transfer funds between wallets, check balances, and reverse transfers.

## Tech Stack

- **Framework:** NestJS with TypeScript
- **Database:** PostgreSQL
- **ORM:** Drizzle ORM + Drizzle Kit
- **Infrastructure:** Docker and Docker Compose
- **Testing:** Vitest
- **API Documentation:** OpenAPI via `@nestjs/swagger` (code-first)

## Architecture

The application follows a **modular monolith** architecture with lightweight **Event Sourcing**.

- Wallet events are immutable and serve as the source of truth.
- Wallet balances and aggregate versions are stored as synchronous, transactional projections.
- Aggregates are normally loaded from persisted projections rather than replaying the entire event history.
- Full event replay must remain possible for state reconstruction and consistency verification.
- A lightweight Unit of Work coordinates database operations through Drizzle transactions.

## Core Invariants

- Authentication uses 1-hour JWTs with revocable PostgreSQL-backed sessions, validated on every authenticated request, without refresh tokens.
- Monetary values use integer cents: `bigint` internally and decimal strings in JSON.
- Wallet balances cannot become negative.
- Transfers must atomically debit one wallet, credit another, and persist all associated events.
- Concurrent operations must preserve financial consistency.
- Transfers are protected against duplicate execution through persisted idempotency keys.
- Reversals are compensating operations; original events must never be modified or deleted.

## Development Guidelines

- Keep business logic independent of NestJS and persistence implementations.
- Prefer simple, explicit abstractions over unnecessary architectural complexity.
- Use database migrations for schema changes.
- Write unit tests for domain rules and integration tests against PostgreSQL for transactional behavior.
- Prioritize correctness, security, and maintainability over premature optimization.
