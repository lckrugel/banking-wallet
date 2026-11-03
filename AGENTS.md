# Banking Wallet

A REST API for a digital wallet system, allowing users to register, authenticate, transfer funds between wallets, check balances, and reverse transfers.

## Architecture

The application follows a **modular monolith** architecture with lightweight **Event Sourcing**.

- Database access should be done in a repository.
- Wallet events are immutable and serve as the source of truth.
- Wallet balances and aggregate versions are stored as synchronous, transactional projections.
- Aggregates are normally loaded from persisted projections rather than replaying the entire event history.
- Full event replay must remain possible for state reconstruction and consistency verification.
- A lightweight Unit of Work coordinates database operations through Drizzle transactions.

## Core Invariants

- Monetary values use integer cents: `bigint` internally and decimal strings in JSON.
- Transfers must atomically debit one wallet, credit another, and persist all associated events.
- Concurrent operations must preserve financial consistency.
- Transfers are protected against duplicate execution through persisted idempotency keys.
- Reversals are compensating operations; original events must never be modified or deleted.
- Events reference the operation associated to them, if there is one, via `operation_id`
  - For example: a transfer creates 2 events for different aggregates (wallets), both referencing the transfer.

## Development Guidelines

- Keep business logic independent of NestJS and persistence implementations.
- Prefer simple, explicit abstractions over unnecessary architectural complexity.
- Write unit tests for domain rules and integration tests against PostgreSQL for transactional behavior.
- Prioritize correctness, security, and maintainability over premature optimization.
